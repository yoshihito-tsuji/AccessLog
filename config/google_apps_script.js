/**
 * Google Apps Script Web API
 * GitHub Releases ダウンロード統計を提供
 *
 * @version 1.3.0 (2026-03-02)
 * @changelog
 *   - 1.3.0: normalizeKey導入（タグキー正規化）、日次データ選別をMAX累積値方式に変更、
 *            type=meta追加（デプロイ確認用）、inspectDailyDataSnapshots追加（法医学調査用）、
 *            testIncrementBaselineにケースG/H追加（計12テスト）
 *   - 1.2.0: maxSeenCount導入による重複スパイク防止（同一累積値の二重計上を排除）
 *   - 1.1.0: ベースライン考慮による初日スパイク修正、classifyAsset()関数化
 *   - 1.0.0: 初回リリース（parseTimestamp追加、タイムゾーン処理堅牢化）
 */

// スプレッドシートIDを設定
const SPREADSHEET_ID = '1-n-CpA9U8kwqTRxhbKBhNOj0-lcZjLG1MJXLhxgdQPs';
const SHEET_NAME = 'DailyData';

// チェックサム/署名ファイルの除外パターン
const EXCLUDED_ASSET_SUFFIXES = [
  '.sha256', '.sha256.txt', '.sha256sum',
  '.sha512', '.sha512.txt', '.sha512sum',
  '.md5', '.md5sum',
  '.sha1', '.sha1.txt', '.sha1sum',
  '.checksum', '.checksum.txt',
  '.sig', '.asc'
];

/**
 * アセット名が除外対象かどうかを判定
 */
function isExcludedAsset(assetName) {
  const lower = assetName.toLowerCase();
  return EXCLUDED_ASSET_SUFFIXES.some(suffix => lower.endsWith(suffix));
}

/**
 * タグ/バージョン文字列を正規化（NFKC正規化 + trim）
 * 全角・半角の差異や前後の空白・不可視文字によるキー不一致を防ぐ
 *
 * @param {*} value - 正規化する値
 * @returns {string} 正規化済み文字列
 */
function normalizeKey(value) {
  return String(value).normalize('NFKC').trim();
}

/**
 * アセット名にWindowsを示すヒントが含まれるか判定
 */
function hasWindowsHint(lowerAssetName) {
  return lowerAssetName.includes('windows') ||
    lowerAssetName.includes('portable') ||
    /(^|[^a-z0-9])win(32|64)?([^a-z0-9]|$)/.test(lowerAssetName);
}

/**
 * リポジトリ名とアセット名からアプリ名（プラットフォーム込み）を判定
 *
 * @param {string} repo - リポジトリ表示名（'GaQ' or 'PoPuP'）
 * @param {string} assetName - アセットファイル名
 * @param {boolean} logUnknown - 判定不能時にconsole.logを出力するか
 * @param {string} tag - タグ名（ログ出力用、省略可）
 * @returns {string|null} 'GaQ (Mac)' / 'GaQ (Windows)' / 'PoPuP (Mac)' / 'PoPuP (Windows)' / null
 */
function classifyAsset(repo, assetName, logUnknown, tag) {
  const lowerAssetName = assetName.toLowerCase();

  if (isExcludedAsset(assetName)) {
    return null;
  }

  if (repo === 'GaQ') {
    const isMac = lowerAssetName.includes('mac') || lowerAssetName.endsWith('.dmg');
    const isWindows = hasWindowsHint(lowerAssetName) || lowerAssetName.endsWith('.exe');

    if (isMac) return 'GaQ (Mac)';
    if (isWindows) return 'GaQ (Windows)';
    if (logUnknown) {
      console.log('判定不能なアセット: ' + repo + '/' + (tag || '') + '/' + assetName);
    }
    return null;
  }

  if (repo === 'PoPuP') {
    const isMac = lowerAssetName.includes('mac') || lowerAssetName.endsWith('.dmg') || lowerAssetName.includes('.app');
    const isLegacyWindowsZip = lowerAssetName === 'popup-v1.0.0.zip';
    const isWindows = hasWindowsHint(lowerAssetName) || lowerAssetName.endsWith('.exe') || isLegacyWindowsZip;

    if (isMac) return 'PoPuP (Mac)';
    if (isWindows) return 'PoPuP (Windows)';
    if (logUnknown) {
      console.log('判定不能なアセット: ' + repo + '/' + (tag || '') + '/' + assetName);
    }
    return null;
  }

  return null;
}

/**
 * GETリクエストを処理
 */
function doGet(e) {
  try {
    const type = e.parameter.type || 'timeline';
    const days = parseInt(e.parameter.days || '30');

    // デプロイ確認用エンドポイント（仮説A: デプロイ不一致の即時判定）
    if (type === 'meta') {
      return createJsonResponse({
        status: 'success',
        scriptVersion: '1.3.0-2026-03-02',
        generatedAt: new Date().toISOString()
      });
    }

    if (type === 'timeline') {
      const data = getTimelineData(days);
      return createJsonResponse(data);
    }

    return createJsonResponse({
      status: 'error',
      message: '不明なリクエストタイプ: ' + type
    });
  } catch (error) {
    return createJsonResponse({
      status: 'error',
      message: error.toString()
    });
  }
}

/**
 * 日別推移データを取得
 *
 * 1.3.0 変更点:
 * - 日次データの選別方式を変更: 「最新タイムスタンプのみ採用」→「全タイムスタンプを集計し app×version ごとに最大累積値を採用」
 * - タグキーに normalizeKey() を適用（全角/半角差異・前後空白による不一致を防止）
 * - ベースライン（期間前データ）にも同様の MAX 集計を適用
 */
function getTimelineData(days) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    throw new Error('シート "' + SHEET_NAME + '" が見つかりません');
  }

  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();

  if (values.length <= 1) {
    return createEmptyTimelineData(days);
  }

  const records = values.slice(1);

  // 日付範囲を計算
  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - days + 1);
  startDate.setHours(0, 0, 0, 0);

  // 日付リストを生成
  const dateList = [];
  for (let i = 0; i < days; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    dateList.push(formatDate(date));
  }

  // アプリ別・日別・バージョン別データ（MAX累積値を格納）
  const appData = {
    'GaQ (Mac)': {},
    'GaQ (Windows)': {},
    'PoPuP (Mac)': {},
    'PoPuP (Windows)': {}
  };

  // 期間内: 全行を日付+タイムスタンプで収集（タイムスタンプ絞り込みを行わない）
  // { dateStr: { tsMsKey: rows[] } }
  const allRowsByDate = {};

  // ベースライン用: 期間前の最新日のすべてのタイムスタンプを収集
  let preperiodLatestDate = null;
  let preperiodRowsByTs = {}; // { tsMsKey: rows[] }

  records.forEach(row => {
    const timestampDate = parseTimestamp(row[0]);
    if (timestampDate === null) return;

    const dateStr = formatDate(timestampDate);

    if (dateList.includes(dateStr)) {
      // 対象期間内: すべての行を収集（タイムスタンプで絞り込まない）
      if (!allRowsByDate[dateStr]) allRowsByDate[dateStr] = {};
      const tsMsKey = String(timestampDate.getTime());
      if (!allRowsByDate[dateStr][tsMsKey]) allRowsByDate[dateStr][tsMsKey] = [];
      allRowsByDate[dateStr][tsMsKey].push(row);

    } else if (timestampDate < startDate) {
      // 期間前: 最新日のすべてのタイムスタンプを収集（ベースライン用）
      if (preperiodLatestDate === null || dateStr > preperiodLatestDate) {
        // より新しい日付が見つかった → 全置換
        preperiodLatestDate = dateStr;
        preperiodRowsByTs = {};
        const tsMsKey = String(timestampDate.getTime());
        preperiodRowsByTs[tsMsKey] = [row];
      } else if (dateStr === preperiodLatestDate) {
        // 同日: タイムスタンプ別に収集
        const tsMsKey = String(timestampDate.getTime());
        if (!preperiodRowsByTs[tsMsKey]) preperiodRowsByTs[tsMsKey] = [];
        preperiodRowsByTs[tsMsKey].push(row);
      }
    }
  });

  // 期間内データ: タイムスタンプごとに app×version の合計を計算し、MAX累積値を採用
  // 理由: 不完全なスナップショット1件に引きずられないようにする
  Object.keys(allRowsByDate).forEach(dateStr => {
    const tsByRows = allRowsByDate[dateStr];

    // タイムスタンプごとに app×version の合計を計算
    const perTsSum = {}; // { tsMsKey: { appName: { versionName: count } } }
    Object.keys(tsByRows).forEach(tsMsKey => {
      perTsSum[tsMsKey] = {};
      tsByRows[tsMsKey].forEach(row => {
        const appName = classifyAsset(row[1], row[4], true, row[3]);
        if (!appName) return;
        const versionName = normalizeKey(row[3]);
        const count = parseInt(row[5]) || 0;

        if (!perTsSum[tsMsKey][appName]) perTsSum[tsMsKey][appName] = {};
        perTsSum[tsMsKey][appName][versionName] = (perTsSum[tsMsKey][appName][versionName] || 0) + count;
      });
    });

    // app×version ごとに最大累積値を appData に格納
    Object.keys(perTsSum).forEach(tsMsKey => {
      Object.keys(perTsSum[tsMsKey]).forEach(appName => {
        if (!appData[appName][dateStr]) appData[appName][dateStr] = {};
        Object.keys(perTsSum[tsMsKey][appName]).forEach(versionName => {
          const count = perTsSum[tsMsKey][appName][versionName];
          appData[appName][dateStr][versionName] = Math.max(
            appData[appName][dateStr][versionName] || 0,
            count
          );
        });
      });
    });
  });

  // ベースライン集計: 期間前最新日の app×version ごとの MAX 累積値を取得
  const baselineData = {
    'GaQ (Mac)': {},
    'GaQ (Windows)': {},
    'PoPuP (Mac)': {},
    'PoPuP (Windows)': {}
  };

  if (preperiodLatestDate !== null) {
    // タイムスタンプごとに集計
    const prePerTsSum = {};
    Object.keys(preperiodRowsByTs).forEach(tsMsKey => {
      prePerTsSum[tsMsKey] = {};
      preperiodRowsByTs[tsMsKey].forEach(row => {
        const appName = classifyAsset(row[1], row[4], false, row[3]);
        if (!appName) return;
        const versionName = normalizeKey(row[3]);
        const count = parseInt(row[5]) || 0;

        if (!prePerTsSum[tsMsKey][appName]) prePerTsSum[tsMsKey][appName] = {};
        prePerTsSum[tsMsKey][appName][versionName] = (prePerTsSum[tsMsKey][appName][versionName] || 0) + count;
      });
    });

    // MAX 採用
    Object.keys(prePerTsSum).forEach(tsMsKey => {
      Object.keys(prePerTsSum[tsMsKey]).forEach(appName => {
        Object.keys(prePerTsSum[tsMsKey][appName]).forEach(versionName => {
          const count = prePerTsSum[tsMsKey][appName][versionName];
          baselineData[appName][versionName] = Math.max(
            baselineData[appName][versionName] || 0,
            count
          );
        });
      });
    });
  }

  // 累積ダウンロード数から日次増分を計算（ベースライン考慮 + maxSeenCount による重複スパイク防止）
  const result = {
    status: 'success',
    dates: dateList,
    apps: {}
  };

  Object.keys(appData).forEach(appName => {
    const versions = {};
    const versionNames = new Set();

    // すべてのバージョンを収集（normalizeKey済みのキー）
    dateList.forEach(date => {
      if (appData[appName][date]) {
        Object.keys(appData[appName][date]).forEach(version => {
          versionNames.add(version);
        });
      }
    });

    // バージョンごとに日次増分を計算（ベースライン考慮 + 重複スパイク防止）
    versionNames.forEach(versionName => {
      const dailyData = [];
      let prevCount = (baselineData[appName] && baselineData[appName][versionName]) || 0;
      let maxSeenCount = prevCount;

      dateList.forEach(date => {
        if (appData[appName][date] && appData[appName][date][versionName] !== undefined) {
          const currentCount = appData[appName][date][versionName];
          const effectivePrev = Math.max(prevCount, maxSeenCount);
          const increment = Math.max(0, currentCount - effectivePrev);
          dailyData.push(increment);
          prevCount = currentCount;
          maxSeenCount = Math.max(maxSeenCount, currentCount);
        } else {
          dailyData.push(0);
        }
      });

      versions[versionName] = dailyData;
    });

    const total = dateList.map((_, idx) => {
      return Object.values(versions).reduce((sum, data) => sum + data[idx], 0);
    });

    result.apps[appName] = {
      versions: versions,
      total: total
    };
  });

  return result;
}

/**
 * 空の日別データを生成
 */
function createEmptyTimelineData(days) {
  const today = new Date();
  const startDate = new Date(today);
  startDate.setDate(startDate.getDate() - days + 1);

  const dateList = [];
  for (let i = 0; i < days; i++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + i);
    dateList.push(formatDate(date));
  }

  const zeros = dateList.map(() => 0);

  return {
    status: 'success',
    dates: dateList,
    apps: {
      'GaQ (Mac)': { versions: {}, total: zeros },
      'GaQ (Windows)': { versions: {}, total: zeros },
      'PoPuP (Mac)': { versions: {}, total: zeros },
      'PoPuP (Windows)': { versions: {}, total: zeros }
    }
  };
}

/**
 * タイムスタンプを安全にDateオブジェクトに変換
 */
function parseTimestamp(value) {
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    return value;
  }

  const str = value.toString().trim();
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/);

  if (match) {
    const date = new Date(
      parseInt(match[1], 10),
      parseInt(match[2], 10) - 1,
      parseInt(match[3], 10),
      parseInt(match[4], 10),
      parseInt(match[5], 10),
      parseInt(match[6], 10)
    );
    if (isNaN(date.getTime())) return null;
    return date;
  }

  const fallbackDate = new Date(value);
  if (isNaN(fallbackDate.getTime())) return null;
  return fallbackDate;
}

/**
 * 日付をYYYY-MM-DD形式でフォーマット
 */
function formatDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * JSON形式のレスポンスを作成
 */
function createJsonResponse(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * DailyData の特定日付の行を削除する（データクリーンアップ用）
 *
 * 重複スパイク問題で汚染された日付のデータを削除する。
 * 削除対象: 2026-02-24 と 2026-02-27（2/16 と同一累積値の重複データ）
 *
 * 【実行方法】
 * 1. Apps Script エディタでこの関数を選択
 * 2. 「実行」ボタンをクリック
 * 3. 初回は権限承認が必要
 * 4. ログで削除件数を確認
 *
 * 【注意】
 * - 削除前にスプレッドシートのバックアップを推奨
 * - getTimelineData() の maxSeenCount 修正後に実行（修正だけでも表示は正常になる）
 */
function cleanupDuplicateSpikeDates() {
  const DATES_TO_DELETE = ['2026-02-24', '2026-02-27'];

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    throw new Error('シート "' + SHEET_NAME + '" が見つかりません');
  }

  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();

  if (values.length <= 1) {
    Logger.log('データがありません（ヘッダーのみ）');
    return;
  }

  const rowsToDelete = [];
  for (let i = 1; i < values.length; i++) {
    const timestampDate = parseTimestamp(values[i][0]);
    if (timestampDate === null) continue;
    if (DATES_TO_DELETE.includes(formatDate(timestampDate))) {
      rowsToDelete.push(i + 1);
    }
  }

  if (rowsToDelete.length === 0) {
    Logger.log('削除対象の行が見つかりませんでした（すでに削除済みの可能性）');
    return;
  }

  Logger.log('削除対象行数: ' + rowsToDelete.length + ' 行');
  rowsToDelete.reverse();
  for (let i = 0; i < rowsToDelete.length; i++) {
    sheet.deleteRow(rowsToDelete[i]);
    if (i > 0 && i % 50 === 0) Utilities.sleep(1000);
  }

  Logger.log('✅ 削除完了: ' + rowsToDelete.length + ' 行を削除しました');
}

/**
 * DailyDataシートの記録日時列をDateTime型に統一（ワンショット実行用）
 */
function normalizeDailyDataTimestamps() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) throw new Error('シート "' + SHEET_NAME + '" が見つかりません');

  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) {
    Logger.log('データがありません（ヘッダーのみ）');
    return;
  }

  let convertedCount = 0;
  let skippedCount = 0;
  let invalidCount = 0;
  const timestampColumn = [];

  for (let i = 1; i < values.length; i++) {
    const timestamp = values[i][0];
    if (timestamp instanceof Date) {
      timestampColumn.push([timestamp]);
      skippedCount++;
    } else if (typeof timestamp === 'string' && timestamp.trim() !== '') {
      const dateObj = parseTimestamp(timestamp);
      if (dateObj === null) {
        timestampColumn.push([timestamp]);
        invalidCount++;
      } else {
        timestampColumn.push([dateObj]);
        convertedCount++;
      }
    } else {
      timestampColumn.push([timestamp]);
    }
  }

  if (convertedCount > 0) {
    const range = sheet.getRange(2, 1, timestampColumn.length, 1);
    range.setValues(timestampColumn);
    range.setNumberFormat('yyyy-mm-dd hh:mm:ss');
    Logger.log('✅ 変換完了: ' + convertedCount + '件を変換しました');
  } else {
    Logger.log('変換対象のデータがありませんでした');
  }

  if (invalidCount > 0) Logger.log('⚠️  無効な日付: ' + invalidCount + '件（変換スキップ）');
  Logger.log('スキップ: ' + skippedCount + '件（すでにDate型）');
  Logger.log('合計処理: ' + (convertedCount + skippedCount + invalidCount) + '件');
}

/**
 * DailyData 生データの法医学調査（仮説B確認用）
 *
 * 指定期間内の各日について、タイムスタンプ一覧・行数・app×version件数・
 * タグ正規化差異・複数スナップショットの完全性を Logger に出力する。
 *
 * 【実行方法】
 * 1. Apps Script エディタでこの関数を選択
 * 2. 「実行」ボタンをクリック（デフォルト: 2026-02-14〜2026-03-02）
 * 3. ログで出力を確認
 *
 * @param {string} startDateStr - 開始日 'YYYY-MM-DD'（省略時: '2026-02-14'）
 * @param {string} endDateStr   - 終了日 'YYYY-MM-DD'（省略時: '2026-03-02'）
 */
function inspectDailyDataSnapshots(startDateStr, endDateStr) {
  startDateStr = startDateStr || '2026-02-14';
  endDateStr   = endDateStr   || '2026-03-02';

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('シート "' + SHEET_NAME + '" が見つかりません');

  const values = sheet.getDataRange().getValues();
  if (values.length <= 1) { Logger.log('データがありません'); return; }

  const records = values.slice(1);

  // { dateStr: { tsMsKey: { timestamp, rows, appVersionCount, tagIssues } } }
  const dateData = {};

  records.forEach(row => {
    const timestampDate = parseTimestamp(row[0]);
    if (timestampDate === null) return;

    const dateStr = formatDate(timestampDate);
    if (dateStr < startDateStr || dateStr > endDateStr) return;

    if (!dateData[dateStr]) dateData[dateStr] = {};
    const tsMsKey = String(timestampDate.getTime());
    if (!dateData[dateStr][tsMsKey]) {
      dateData[dateStr][tsMsKey] = {
        timestamp: timestampDate,
        rows: [],
        appVersionCount: {},
        tagIssues: []
      };
    }

    const entry = dateData[dateStr][tsMsKey];
    entry.rows.push(row);

    // タグ正規化差異を検出
    const tagRaw        = String(row[3]);
    const tagTrimmed    = tagRaw.trim();
    const tagNormalized = normalizeKey(tagRaw);
    if (tagRaw !== tagTrimmed || tagRaw !== tagNormalized) {
      entry.tagIssues.push({
        assetName: row[4], tagRaw, tagTrimmed, tagNormalized
      });
    }

    // app×version カウント
    const appName = classifyAsset(row[1], row[4], false, row[3]);
    if (appName) {
      const key = appName + '::' + tagNormalized;
      entry.appVersionCount[key] = (entry.appVersionCount[key] || 0) + 1;
    }
  });

  // 出力
  const dates = Object.keys(dateData).sort();
  Logger.log('=== DailyData スナップショット調査: ' + startDateStr + ' 〜 ' + endDateStr + ' ===');
  Logger.log('対象日数: ' + dates.length);
  Logger.log('');

  dates.forEach(dateStr => {
    const tsMap = dateData[dateStr];
    const tsMsKeys = Object.keys(tsMap).sort();

    Logger.log('--- ' + dateStr + ' (' + tsMsKeys.length + ' タイムスタンプ) ---');

    // タイムスタンプごとの詳細
    tsMsKeys.forEach(tsMsKey => {
      const entry = tsMap[tsMsKey];
      Logger.log('  タイムスタンプ: ' + entry.timestamp.toLocaleString('ja-JP'));
      Logger.log('  行数: ' + entry.rows.length);

      const avKeys = Object.keys(entry.appVersionCount).sort();
      Logger.log('  app×version 件数: ' + avKeys.length);
      avKeys.forEach(k => Logger.log('    ' + k + ': ' + entry.appVersionCount[k] + '件'));

      if (entry.tagIssues.length > 0) {
        Logger.log('  ⚠️ タグ正規化差異:');
        entry.tagIssues.forEach(issue => {
          Logger.log('    assetName      : ' + issue.assetName);
          Logger.log('    tagRaw         : ' + JSON.stringify(issue.tagRaw));
          Logger.log('    tagTrimmed     : ' + JSON.stringify(issue.tagTrimmed));
          Logger.log('    tagNormalized  : ' + JSON.stringify(issue.tagNormalized));
        });
      }
      Logger.log('');
    });

    // 複数スナップショットがある日は完全性を分析
    if (tsMsKeys.length > 1) {
      Logger.log('  📋 複数スナップショット分析（' + dateStr + '）:');

      // タイムスタンプごとの app×version 合計を計算
      const tsSums = {};
      tsMsKeys.forEach(tsMsKey => {
        tsSums[tsMsKey] = {};
        tsMap[tsMsKey].rows.forEach(row => {
          const appName = classifyAsset(row[1], row[4], false, row[3]);
          if (!appName) return;
          const key = appName + '::' + normalizeKey(row[3]);
          tsSums[tsMsKey][key] = (tsSums[tsMsKey][key] || 0) + (parseInt(row[5]) || 0);
        });
      });

      // 全タイムスタンプに存在するキーと一部にのみ存在するキーを判定
      const allKeys = new Set();
      tsMsKeys.forEach(k => Object.keys(tsSums[k]).forEach(key => allKeys.add(key)));

      allKeys.forEach(key => {
        const counts = tsMsKeys.map(k => (tsSums[k][key] !== undefined ? tsSums[k][key] : null));
        const hasGap = counts.some(c => c === null);
        const label = hasGap ? '⚠️ 一部欠損' : '全TS存在';
        Logger.log('    ' + label + ' ' + key + ' = ' + JSON.stringify(counts));
      });
      Logger.log('');
    }
  });

  Logger.log('=== 調査完了 ===');
}

/**
 * セルフテスト: ベースライン考慮の日次増分計算が正しいことを検証（計12テスト）
 *
 * 【実行方法】
 * 1. Apps Script エディタでこの関数を選択
 * 2. 「実行」ボタンをクリック
 * 3. ログで pass/fail を確認
 *
 * テストケース一覧:
 * A   : 期間前ベースラインあり（50→55）で初日増分が5になる
 * A-2 : ベースライン50、初日55で増分5
 * B   : 新規バージョン（baseline=0）で初日に累積値が増分
 * C   : 欠損日あり、復帰日の増分が正しい
 * D   : ベースラインあり→スパイクなし、D-2: 新規→スパイクあり
 * E   : 同日複数タイムスタンプ→最新(23:59)のみベースラインに採用
 * E-2 : 複数日+同日複数TS→最新日の最新TSのみ採用
 * F   : 同一累積値の重複スパイク防止（2/24, 2/27 は 0）
 * F-2 : prevCountリセット後の重複スパイク防止
 * G   : 同日複数スナップショット（MAX集計後）での正常増分
 * H   : normalizeKey による全角/半角・前後空白の正規化
 */
function testIncrementBaseline() {
  let passed = 0;
  let failed = 0;

  function assertEqual(testName, actual, expected) {
    if (JSON.stringify(actual) === JSON.stringify(expected)) {
      Logger.log('✅ PASS: ' + testName);
      passed++;
    } else {
      Logger.log('❌ FAIL: ' + testName);
      Logger.log('  期待値: ' + JSON.stringify(expected));
      Logger.log('  実際値: ' + JSON.stringify(actual));
      failed++;
    }
  }

  // テスト用の増分計算関数（本体ロジックと同一: maxSeenCount対応）
  function calcIncrements(cumulativeByDate, dateList, baseline) {
    const dailyData = [];
    let prevCount = baseline;
    let maxSeenCount = baseline;

    dateList.forEach(date => {
      if (cumulativeByDate[date] !== undefined) {
        const currentCount = cumulativeByDate[date];
        const effectivePrev = Math.max(prevCount, maxSeenCount);
        const increment = Math.max(0, currentCount - effectivePrev);
        dailyData.push(increment);
        prevCount = currentCount;
        maxSeenCount = Math.max(maxSeenCount, currentCount);
      } else {
        dailyData.push(0);
      }
    });

    return dailyData;
  }

  // --- ケースA ---
  {
    const dateList = ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04'];
    const cumulative = { '2026-01-01': 50, '2026-01-02': 55, '2026-01-03': 55, '2026-01-04': 58 };
    assertEqual('ケースA: ベースライン50, 初日50→増分0', calcIncrements(cumulative, dateList, 50), [0, 5, 0, 3]);
  }

  // --- ケースA-2 ---
  {
    const dateList = ['2026-01-01', '2026-01-02'];
    const cumulative = { '2026-01-01': 55, '2026-01-02': 58 };
    assertEqual('ケースA-2: ベースライン50→初日55で増分5', calcIncrements(cumulative, dateList, 50), [5, 3]);
  }

  // --- ケースB ---
  {
    const dateList = ['2026-01-01', '2026-01-02', '2026-01-03'];
    const cumulative = { '2026-01-02': 10, '2026-01-03': 12 };
    assertEqual('ケースB: 新規バージョン, 初出10で増分10', calcIncrements(cumulative, dateList, 0), [0, 10, 2]);
  }

  // --- ケースC ---
  {
    const dateList = ['2026-01-01', '2026-01-02', '2026-01-03'];
    const cumulative = { '2026-01-01': 32, '2026-01-03': 35 };
    assertEqual('ケースC: 欠損日あり, 復帰日の増分が正しい', calcIncrements(cumulative, dateList, 30), [2, 0, 3]);
  }

  // --- ケースD ---
  {
    const dateList = ['2026-01-01', '2026-01-02', '2026-01-03'];
    const cumulative = { '2026-01-01': 78, '2026-01-02': 78, '2026-01-03': 79 };
    assertEqual('ケースD: ベースライン78でスパイクなし', calcIncrements(cumulative, dateList, 78), [0, 0, 1]);
    assertEqual('ケースD-2: 新規(baseline=0)は初日78が増分', calcIncrements(cumulative, dateList, 0), [78, 0, 1]);
  }

  // --- ケースE ---
  {
    function collectBaseline(rows, startDate) {
      var latestDate = null, latestTimestamp = null, latestRows = [];
      rows.forEach(function(row) {
        var ts = row[0], dateStr = formatDate(ts);
        if (ts < startDate) {
          if (latestDate === null || dateStr > latestDate) {
            latestDate = dateStr; latestTimestamp = ts; latestRows = [row];
          } else if (dateStr === latestDate) {
            if (latestTimestamp.getTime() < ts.getTime()) { latestTimestamp = ts; latestRows = [row]; }
            else if (latestTimestamp.getTime() === ts.getTime()) { latestRows.push(row); }
          }
        }
      });
      var baseline = {};
      latestRows.forEach(function(row) {
        var version = row[3], count = parseInt(row[5]) || 0;
        if (!baseline[version]) baseline[version] = 0;
        baseline[version] += count;
      });
      return baseline;
    }

    var startDate = new Date(2026, 0, 15, 0, 0, 0);
    var ts10 = new Date(2026, 0, 14, 10, 0, 0);
    var ts23 = new Date(2026, 0, 14, 23, 59, 0);
    var rows = [
      [ts10, 'GaQ', '', 'v1.0.0', 'GaQ_mac.dmg', '50'],
      [ts10, 'GaQ', '', 'v1.0.0', 'GaQ_windows.exe', '30'],
      [ts23, 'GaQ', '', 'v1.0.0', 'GaQ_mac.dmg', '55'],
      [ts23, 'GaQ', '', 'v1.0.0', 'GaQ_windows.exe', '35']
    ];
    var baseline = collectBaseline(rows, startDate);
    assertEqual('ケースE: 同日複数タイムスタンプ - 最新(23:59)のみ採用', baseline['v1.0.0'], 90);
  }

  // --- ケースE-2 ---
  {
    function collectBaseline2(rows, startDate) {
      var latestDate = null, latestTimestamp = null, latestRows = [];
      rows.forEach(function(row) {
        var ts = row[0], dateStr = formatDate(ts);
        if (ts < startDate) {
          if (latestDate === null || dateStr > latestDate) {
            latestDate = dateStr; latestTimestamp = ts; latestRows = [row];
          } else if (dateStr === latestDate) {
            if (latestTimestamp.getTime() < ts.getTime()) { latestTimestamp = ts; latestRows = [row]; }
            else if (latestTimestamp.getTime() === ts.getTime()) { latestRows.push(row); }
          }
        }
      });
      var baseline = {};
      latestRows.forEach(function(row) {
        var version = row[3], count = parseInt(row[5]) || 0;
        if (!baseline[version]) baseline[version] = 0;
        baseline[version] += count;
      });
      return baseline;
    }

    var startDate = new Date(2026, 0, 15, 0, 0, 0);
    var ts13 = new Date(2026, 0, 13, 23, 59, 0);
    var ts14_10 = new Date(2026, 0, 14, 10, 0, 0);
    var ts14_23 = new Date(2026, 0, 14, 23, 59, 0);
    var rows = [
      [ts13, 'GaQ', '', 'v1.0.0', 'GaQ_mac.dmg', '40'],
      [ts14_10, 'GaQ', '', 'v1.0.0', 'GaQ_mac.dmg', '50'],
      [ts14_23, 'GaQ', '', 'v1.0.0', 'GaQ_mac.dmg', '55']
    ];
    assertEqual('ケースE-2: 複数日+同日複数TS - 最新日(1/14)最新TS(23:59)のみ', collectBaseline2(rows, startDate)['v1.0.0'], 55);
  }

  // --- ケースF ---
  {
    const dateList = ['2026-02-03', '2026-02-04', '2026-02-15', '2026-02-16',
                      '2026-02-17', '2026-02-24', '2026-02-27', '2026-02-28'];
    const cumulative = {
      '2026-02-03': 42, '2026-02-04': 44, '2026-02-15': 45,
      '2026-02-16': 123, '2026-02-24': 123, '2026-02-27': 123, '2026-02-28': 127
    };
    assertEqual('ケースF: 同一累積値の重複スパイク防止（2/24, 2/27 は 0）',
      calcIncrements(cumulative, dateList, 40), [2, 2, 1, 78, 0, 0, 0, 4]);
  }

  // --- ケースF-2 ---
  {
    const dateList = ['2026-02-16', '2026-02-24'];
    const cumulative = { '2026-02-16': 78, '2026-02-24': 78 };
    assertEqual('ケースF-2: prevCountリセット後の重複スパイク防止', calcIncrements(cumulative, dateList, 0), [78, 0]);
  }

  // --- ケースG: 同日複数スナップショット（MAX集計後）での正常増分 ---
  // 状況:
  //   2/28 Snapshot A (10:00): PoPuP Win v1.2.0 = 78 (古い値 / 不完全スナップショット)
  //   2/28 Snapshot B (23:59): PoPuP Win v1.2.0 = 82 (実DL後の正しい値)
  //   MAX集計 → 2/28 の累積値 = 82
  // 期待: 2/28 の増分 = 82 - 78 = +4
  {
    const dateList = ['2026-02-16', '2026-02-24', '2026-02-27', '2026-02-28'];
    const cumulative = {
      '2026-02-16': 78, // 正規スパイク
      '2026-02-24': 78, // DLなし（maxSeenCount で 0）
      '2026-02-27': 78, // DLなし（maxSeenCount で 0）
      '2026-02-28': 82  // MAX集計結果（Snapshot B = 82 > Snapshot A = 78）
    };
    assertEqual('ケースG: 同日複数スナップショットMAX集計後の正常増分（2/28 = +4）',
      calcIncrements(cumulative, dateList, 0), [78, 0, 0, 4]);
  }

  // --- ケースH: normalizeKey による全角/半角・前後空白の正規化 ---
  {
    assertEqual('ケースH: 全角英数字の正規化', normalizeKey('ｖ１．２．０'), 'v1.2.0');
    assertEqual('ケースH-2: 前後空白の除去', normalizeKey('  v1.2.0  '), 'v1.2.0');
    assertEqual('ケースH-3: 正常な文字列はそのまま', normalizeKey('v1.2.0'), 'v1.2.0');
  }

  Logger.log('');
  Logger.log('========================================');
  Logger.log('テスト結果: ' + passed + ' passed, ' + failed + ' failed');
  Logger.log('========================================');

  if (failed > 0) {
    Logger.log('⚠️ テスト失敗があります。修正を確認してください。');
  } else {
    Logger.log('✅ すべてのテストが通過しました。');
  }
}
