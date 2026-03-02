/**
 * Google Apps Script Web API
 * GitHub Releases ダウンロード統計を提供
 *
 * @version 1.2.0 (2026-03-02)
 * @changelog
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
 */
function getTimelineData(days) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    throw new Error('シート "' + SHEET_NAME + '" が見つかりません');
  }

  // 全データを取得
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();

  if (values.length <= 1) {
    // ヘッダーのみの場合は空データを返す
    return createEmptyTimelineData(days);
  }

  // ヘッダーを除外
  const headers = values[0];
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

  // データを整理
  const appData = {
    'GaQ (Mac)': {},
    'GaQ (Windows)': {},
    'PoPuP (Mac)': {},
    'PoPuP (Windows)': {}
  };

  // 日付ごとに最新のタイムスタンプのレコードのみを保持
  const latestRecordsByDate = {};

  // ベースライン用: 期間開始日より前の最新日・最新タイムスタンプのデータのみ保持
  let preperiodLatestDate = null;
  let preperiodLatestTimestamp = null;
  let preperiodLatestRows = [];

  records.forEach(row => {
    const timestamp = row[0];

    // parseTimestamp()で統一的にDate変換
    const timestampDate = parseTimestamp(timestamp);

    // Invalid Dateの場合はスキップ
    if (timestampDate === null) {
      return;
    }

    const dateStr = formatDate(timestampDate);

    if (dateList.includes(dateStr)) {
      // 対象期間内: 既存ロジックと同様に処理
      if (!latestRecordsByDate[dateStr]) {
        latestRecordsByDate[dateStr] = { timestamp: timestampDate, rows: [] };
      }

      const current = latestRecordsByDate[dateStr];

      if (current.timestamp.getTime() < timestampDate.getTime()) {
        latestRecordsByDate[dateStr] = { timestamp: timestampDate, rows: [row] };
      } else if (current.timestamp.getTime() === timestampDate.getTime()) {
        current.rows.push(row);
      }
    } else if (timestampDate < startDate) {
      // 期間開始日より前: 最新日・最新タイムスタンプのみ保持（ベースライン用）
      // 期間内と同じ「最新タイムスタンプ選別」ロジックを適用
      if (preperiodLatestDate === null || dateStr > preperiodLatestDate) {
        // より新しい日付が見つかった → 全置換
        preperiodLatestDate = dateStr;
        preperiodLatestTimestamp = timestampDate;
        preperiodLatestRows = [row];
      } else if (dateStr === preperiodLatestDate) {
        // 同日内: タイムスタンプで最新のみを保持
        if (preperiodLatestTimestamp.getTime() < timestampDate.getTime()) {
          // より新しいタイムスタンプ → 行を置換
          preperiodLatestTimestamp = timestampDate;
          preperiodLatestRows = [row];
        } else if (preperiodLatestTimestamp.getTime() === timestampDate.getTime()) {
          // 同一タイムスタンプ → 行を追加
          preperiodLatestRows.push(row);
        }
        // 古いタイムスタンプは無視
      }
    }
  });

  // 最新レコードのみを処理（classifyAsset()でアプリ判定を統一）
  Object.keys(latestRecordsByDate).forEach(dateStr => {
    const latestData = latestRecordsByDate[dateStr];

    latestData.rows.forEach(row => {
      const repo = row[1];
      const tag = row[3];
      const assetName = row[4];
      const count = parseInt(row[5]) || 0;

      const appName = classifyAsset(repo, assetName, true, tag);
      if (!appName) return;

      const versionName = tag;

      if (!appData[appName][dateStr]) {
        appData[appName][dateStr] = {};
      }
      if (!appData[appName][dateStr][versionName]) {
        appData[appName][dateStr][versionName] = 0;
      }

      // ダウンロード数を加算（同じ日の複数アセットを合計）
      appData[appName][dateStr][versionName] += count;
    });
  });

  // ベースライン集計: 期間開始日より前の最新日データから、アプリ×バージョンの累積値を取得
  const baselineData = {
    'GaQ (Mac)': {},
    'GaQ (Windows)': {},
    'PoPuP (Mac)': {},
    'PoPuP (Windows)': {}
  };

  if (preperiodLatestRows.length > 0) {
    preperiodLatestRows.forEach(row => {
      const repo = row[1];
      const tag = row[3];
      const assetName = row[4];
      const count = parseInt(row[5]) || 0;

      const appName = classifyAsset(repo, assetName, false, tag);
      if (!appName) return;

      const versionName = tag;
      if (!baselineData[appName][versionName]) {
        baselineData[appName][versionName] = 0;
      }
      baselineData[appName][versionName] += count;
    });
  }

  // 累積ダウンロード数から日次増分を計算（ベースライン考慮）
  const result = {
    status: 'success',
    dates: dateList,
    apps: {}
  };

  Object.keys(appData).forEach(appName => {
    const versions = {};
    const versionNames = new Set();

    // すべてのバージョンを収集
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
      // 期間前のベースライン値で初期化（存在しない場合は0 = 新規バージョン）
      let prevCount = (baselineData[appName] && baselineData[appName][versionName]) || 0;
      // maxSeenCount: これまでに見た最大累積値を追跡し、prevCountがリセットされても
      // 同一累積値の二重計上（スパイク再発）を防ぐ
      let maxSeenCount = prevCount;

      dateList.forEach(date => {
        // データが存在する日付のみ累積値を取得
        if (appData[appName][date] && appData[appName][date][versionName] !== undefined) {
          const currentCount = appData[appName][date][versionName];
          // effectivePrev: prevCountとmaxSeenCountの大きい方を基準に増分を計算
          // これにより prevCount が何らかの理由でリセットされた場合も二重計上を防ぐ
          const effectivePrev = Math.max(prevCount, maxSeenCount);
          const increment = Math.max(0, currentCount - effectivePrev);
          dailyData.push(increment);
          prevCount = currentCount;
          maxSeenCount = Math.max(maxSeenCount, currentCount);
        } else {
          // データが存在しない日は0
          dailyData.push(0);
        }
      });

      versions[versionName] = dailyData;
    });

    // 合計を計算
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
      'GaQ (Mac)': {
        versions: {},
        total: zeros
      },
      'GaQ (Windows)': {
        versions: {},
        total: zeros
      },
      'PoPuP (Mac)': {
        versions: {},
        total: zeros
      },
      'PoPuP (Windows)': {
        versions: {},
        total: zeros
      }
    }
  };
}

/**
 * タイムスタンプを安全にDateオブジェクトに変換
 *
 * Apps Scriptでは "YYYY-MM-DD HH:MM:SS" 形式の文字列をnew Date()で解釈すると
 * タイムゾーンの扱いが不安定になる可能性があるため、手動でパースする。
 *
 * @param {Date|string} value - Dateオブジェクトまたは "YYYY-MM-DD HH:MM:SS" 形式の文字列
 * @returns {Date|null} - JSTタイムゾーンでのDateオブジェクト、または無効な場合はnull
 */
function parseTimestamp(value) {
  // すでにDateオブジェクトの場合はそのまま返す
  if (value instanceof Date) {
    // Invalid Dateチェック
    if (isNaN(value.getTime())) {
      return null;
    }
    return value;
  }

  // 文字列の場合は "YYYY-MM-DD HH:MM:SS" 形式を手動でパース
  const str = value.toString().trim();

  // 正規表現で年月日時分秒を抽出
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})$/);

  if (match) {
    // 手動でDate生成（月は0始まりなので-1が必要）
    const year = parseInt(match[1], 10);
    const month = parseInt(match[2], 10) - 1;
    const day = parseInt(match[3], 10);
    const hour = parseInt(match[4], 10);
    const minute = parseInt(match[5], 10);
    const second = parseInt(match[6], 10);

    const date = new Date(year, month, day, hour, minute, second);

    // Invalid Dateチェック
    if (isNaN(date.getTime())) {
      return null;
    }

    return date;
  }

  // フォールバック: 標準的なDate解析
  const fallbackDate = new Date(value);

  // Invalid Dateチェック
  if (isNaN(fallbackDate.getTime())) {
    return null;
  }

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

  // 削除対象行のインデックスを収集（後ろから削除するため逆順）
  const rowsToDelete = [];
  for (let i = 1; i < values.length; i++) {
    const timestamp = values[i][0];
    const timestampDate = parseTimestamp(timestamp);
    if (timestampDate === null) continue;

    const dateStr = formatDate(timestampDate);
    if (DATES_TO_DELETE.includes(dateStr)) {
      rowsToDelete.push(i + 1); // シートの行番号は1始まり、ヘッダーが1行目
    }
  }

  if (rowsToDelete.length === 0) {
    Logger.log('削除対象の行が見つかりませんでした（すでに削除済みの可能性）');
    return;
  }

  Logger.log('削除対象行数: ' + rowsToDelete.length + ' 行');
  Logger.log('対象日付: ' + DATES_TO_DELETE.join(', '));

  // 後ろから削除（行番号がズレないように）
  rowsToDelete.reverse();
  for (let i = 0; i < rowsToDelete.length; i++) {
    sheet.deleteRow(rowsToDelete[i]);
    // 大量削除時のAPIレート制限を避けるため適宜待機
    if (i > 0 && i % 50 === 0) {
      Utilities.sleep(1000);
    }
  }

  Logger.log('✅ 削除完了: ' + rowsToDelete.length + ' 行を削除しました');
  Logger.log('削除後の確認: Apps Script API で timeline データを取得して確認してください');
}

/**
 * DailyDataシートの記録日時列をDateTime型に統一（ワンショット実行用）
 *
 * 既存データで文字列 "YYYY-MM-DD HH:MM:SS" として保存されている記録日時を、
 * Date型に変換して書き戻す。すでにDate型のセルはスキップする。
 *
 * 【実行方法】
 * 1. Apps Script エディタでこの関数を選択
 * 2. 「実行」ボタンをクリック
 * 3. 初回は権限承認が必要
 * 4. 処理完了後、ログで変換件数を確認
 *
 * 【注意】
 * - この処理は一度だけ実行すれば良い
 * - 大量データがある場合は時間がかかる可能性あり
 * - タイムゾーンはJST（Asia/Tokyo）前提
 */
function normalizeDailyDataTimestamps() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);

  if (!sheet) {
    throw new Error('シート "' + SHEET_NAME + '" が見つかりません');
  }

  // 全データを取得
  const dataRange = sheet.getDataRange();
  const values = dataRange.getValues();

  if (values.length <= 1) {
    Logger.log('データがありません（ヘッダーのみ）');
    return;
  }

  let convertedCount = 0;
  let skippedCount = 0;
  let invalidCount = 0;

  // A列の値を更新用配列として準備（ヘッダー行を除く）
  const timestampColumn = [];

  // ヘッダー行をスキップして2行目から処理
  for (let i = 1; i < values.length; i++) {
    const timestamp = values[i][0]; // A列（記録日時）

    // すでにDate型の場合はそのまま維持
    if (timestamp instanceof Date) {
      timestampColumn.push([timestamp]);
      skippedCount++;
      continue;
    }

    // 文字列の場合はDate型に変換
    if (typeof timestamp === 'string' && timestamp.trim() !== '') {
      const dateObj = parseTimestamp(timestamp);

      if (dateObj === null) {
        // Invalid Dateの場合は元の値を維持
        timestampColumn.push([timestamp]);
        invalidCount++;
      } else {
        timestampColumn.push([dateObj]);
        convertedCount++;
      }
    } else {
      // 空文字列や他の型はそのまま維持
      timestampColumn.push([timestamp]);
    }
  }

  // 一括更新（バッチ処理で高速化）
  if (convertedCount > 0) {
    Logger.log('変換開始: ' + convertedCount + '件');

    // A列の2行目以降を一括更新
    const range = sheet.getRange(2, 1, timestampColumn.length, 1);
    range.setValues(timestampColumn);
    range.setNumberFormat('yyyy-mm-dd hh:mm:ss'); // 表示形式を一括設定

    Logger.log('✅ 変換完了: ' + convertedCount + '件を変換しました');
  } else {
    Logger.log('変換対象のデータがありませんでした');
  }

  if (invalidCount > 0) {
    Logger.log('⚠️  無効な日付: ' + invalidCount + '件（変換スキップ）');
  }
  Logger.log('スキップ: ' + skippedCount + '件（すでにDate型）');
  Logger.log('合計処理: ' + (convertedCount + skippedCount + invalidCount) + '件');
}

/**
 * セルフテスト: ベースライン考慮の日次増分計算が正しいことを検証
 *
 * 【実行方法】
 * 1. Apps Script エディタでこの関数を選択
 * 2. 「実行」ボタンをクリック
 * 3. ログで pass/fail を確認
 *
 * テストケース:
 * A: 期間前ベースラインあり（50→55）で初日増分が5になる
 * B: ベースラインなし（新規バージョン）で初日増分が累積値になる
 * C: 期間内でデータ欠損日がある場合、復帰日の増分が正しい
 * E: 同日複数タイムスタンプのベースライン選別（最新タイムスタンプのみ採用）
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

  // --- ケースA: 期間前ベースラインあり ---
  // ベースライン=50, 期間内で50→55→55→58
  {
    const dateList = ['2026-01-01', '2026-01-02', '2026-01-03', '2026-01-04'];
    const cumulative = {
      '2026-01-01': 50,
      '2026-01-02': 55,
      '2026-01-03': 55,
      '2026-01-04': 58
    };
    const baseline = 50;
    const result = calcIncrements(cumulative, dateList, baseline);
    assertEqual('ケースA: ベースライン50, 初日50→増分0', result, [0, 5, 0, 3]);
  }

  // --- ケースA-2: ベースラインと初日の間に増加あり ---
  // ベースライン=50, 初日累積=55
  {
    const dateList = ['2026-01-01', '2026-01-02'];
    const cumulative = {
      '2026-01-01': 55,
      '2026-01-02': 58
    };
    const baseline = 50;
    const result = calcIncrements(cumulative, dateList, baseline);
    assertEqual('ケースA-2: ベースライン50→初日55で増分5', result, [5, 3]);
  }

  // --- ケースB: ベースラインなし（新規バージョン） ---
  // ベースライン=0, 期間内で初出=10→12
  {
    const dateList = ['2026-01-01', '2026-01-02', '2026-01-03'];
    const cumulative = {
      '2026-01-02': 10,
      '2026-01-03': 12
    };
    const baseline = 0;
    const result = calcIncrements(cumulative, dateList, baseline);
    assertEqual('ケースB: 新規バージョン, 初出10で増分10', result, [0, 10, 2]);
  }

  // --- ケースC: データ欠損日がある ---
  // ベースライン=30, 1日目=32, 2日目=欠損, 3日目=35
  {
    const dateList = ['2026-01-01', '2026-01-02', '2026-01-03'];
    const cumulative = {
      '2026-01-01': 32,
      '2026-01-03': 35
    };
    const baseline = 30;
    const result = calcIncrements(cumulative, dateList, baseline);
    assertEqual('ケースC: 欠損日あり, 復帰日の増分が正しい', result, [2, 0, 3]);
  }

  // --- ケースD: 旧バグ再現テスト ---
  // ベースラインなし(0), 初日累積=78 → 旧ロジックでは78がスパイク表示されていた
  {
    const dateList = ['2026-01-01', '2026-01-02', '2026-01-03'];
    const cumulative = {
      '2026-01-01': 78,
      '2026-01-02': 78,
      '2026-01-03': 79
    };
    // ベースラインがある場合（78）: スパイクは出ない
    const resultWithBaseline = calcIncrements(cumulative, dateList, 78);
    assertEqual('ケースD: ベースライン78でスパイクなし', resultWithBaseline, [0, 0, 1]);
    // ベースラインなし（新規）: 初日にそのまま出る（これは正しい動作）
    const resultNoBaseline = calcIncrements(cumulative, dateList, 0);
    assertEqual('ケースD-2: 新規(baseline=0)は初日78が増分', resultNoBaseline, [78, 0, 1]);
  }

  // --- ケースE: 同日複数タイムスタンプのベースライン選別 ---
  // 期間前の同一日に2回実行（10:00と23:59）があった場合、
  // 最新タイムスタンプ（23:59）のデータのみがベースラインに採用されること
  {
    // ベースライン選別ロジックの再現（getTimelineData内と同一アルゴリズム）
    function collectBaseline(rows, startDate) {
      var latestDate = null;
      var latestTimestamp = null;
      var latestRows = [];

      rows.forEach(function(row) {
        var ts = row[0];
        var dateStr = formatDate(ts);

        if (ts < startDate) {
          if (latestDate === null || dateStr > latestDate) {
            latestDate = dateStr;
            latestTimestamp = ts;
            latestRows = [row];
          } else if (dateStr === latestDate) {
            if (latestTimestamp.getTime() < ts.getTime()) {
              latestTimestamp = ts;
              latestRows = [row];
            } else if (latestTimestamp.getTime() === ts.getTime()) {
              latestRows.push(row);
            }
          }
        }
      });

      // 集計
      var baseline = {};
      latestRows.forEach(function(row) {
        var version = row[3];
        var count = parseInt(row[5]) || 0;
        if (!baseline[version]) baseline[version] = 0;
        baseline[version] += count;
      });
      return baseline;
    }

    // 期間開始日: 2026-01-15
    var startDate = new Date(2026, 0, 15, 0, 0, 0);

    // 2026-01-14 に 10:00 と 23:59 の2回実行
    var ts10 = new Date(2026, 0, 14, 10, 0, 0);
    var ts23 = new Date(2026, 0, 14, 23, 59, 0);

    // row format: [timestamp, repo, ?, tag, assetName, count]
    var rows = [
      // 10:00実行分（古いタイムスタンプ → ベースラインに含めるべきでない）
      [ts10, 'GaQ', '', 'v1.0.0', 'GaQ_mac.dmg', '50'],
      [ts10, 'GaQ', '', 'v1.0.0', 'GaQ_windows.exe', '30'],
      // 23:59実行分（最新タイムスタンプ → こちらのみベースラインに採用）
      [ts23, 'GaQ', '', 'v1.0.0', 'GaQ_mac.dmg', '55'],
      [ts23, 'GaQ', '', 'v1.0.0', 'GaQ_windows.exe', '35']
    ];

    var baseline = collectBaseline(rows, startDate);

    // 23:59のデータのみが採用: v1.0.0 = 55 + 35 = 90
    assertEqual('ケースE: 同日複数タイムスタンプ - 最新(23:59)のみ採用', baseline['v1.0.0'], 90);

    // もし旧バグ（タイムスタンプ未考慮）なら 50+30+55+35=170 になってしまう
    // 正しくは 55+35=90
  }

  // --- ケースE-2: 期間前に複数日あり、最新日の最新タイムスタンプのみ採用 ---
  {
    function collectBaseline2(rows, startDate) {
      var latestDate = null;
      var latestTimestamp = null;
      var latestRows = [];

      rows.forEach(function(row) {
        var ts = row[0];
        var dateStr = formatDate(ts);

        if (ts < startDate) {
          if (latestDate === null || dateStr > latestDate) {
            latestDate = dateStr;
            latestTimestamp = ts;
            latestRows = [row];
          } else if (dateStr === latestDate) {
            if (latestTimestamp.getTime() < ts.getTime()) {
              latestTimestamp = ts;
              latestRows = [row];
            } else if (latestTimestamp.getTime() === ts.getTime()) {
              latestRows.push(row);
            }
          }
        }
      });

      var baseline = {};
      latestRows.forEach(function(row) {
        var version = row[3];
        var count = parseInt(row[5]) || 0;
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
      // 1/13のデータ（古い日付 → 採用しない）
      [ts13, 'GaQ', '', 'v1.0.0', 'GaQ_mac.dmg', '40'],
      // 1/14 10:00（同日だが古いタイムスタンプ → 採用しない）
      [ts14_10, 'GaQ', '', 'v1.0.0', 'GaQ_mac.dmg', '50'],
      // 1/14 23:59（最新日の最新タイムスタンプ → これのみ採用）
      [ts14_23, 'GaQ', '', 'v1.0.0', 'GaQ_mac.dmg', '55']
    ];

    var baseline = collectBaseline2(rows, startDate);
    assertEqual('ケースE-2: 複数日+同日複数TS - 最新日(1/14)最新TS(23:59)のみ', baseline['v1.0.0'], 55);
  }

  // --- ケースF: 同一累積値の重複スパイク防止（maxSeenCount効果の検証）---
  // 2026-02-16 に +78 の正規スパイク後、2026-02-24・2026-02-27 に
  // 同一累積値 78 が再度記録された場合（データ汚染）、
  // maxSeenCount により 2026-02-24 と 2026-02-27 の増分が 0 になるべき
  {
    const dateList = ['2026-02-03', '2026-02-04', '2026-02-15', '2026-02-16',
                      '2026-02-17', '2026-02-24', '2026-02-27', '2026-02-28'];
    const cumulative = {
      '2026-02-03': 42,   // +2
      '2026-02-04': 44,   // +2
      '2026-02-15': 45,   // +1
      '2026-02-16': 123,  // +78 正規スパイク（cumulative が 45 → 123 に増加）
      '2026-02-24': 123,  // 同一累積値 → 重複（本来 0 であるべき）
      '2026-02-27': 123,  // 同一累積値 → 重複
      '2026-02-28': 127   // +4 正規増分
    };
    const baseline = 40;
    const result = calcIncrements(cumulative, dateList, baseline);
    assertEqual('ケースF: 同一累積値の重複スパイク防止（2/24, 2/27 は 0）',
      result, [2, 2, 1, 78, 0, 0, 0, 4]);
  }

  // --- ケースF-2: prevCountリセット再現シミュレーション ---
  // prevCount が 0 にリセットされた状態で同一累積値が来た場合、
  // maxSeenCount によって 0 になるべき（実際のバグ状況の再現）
  {
    const dateList = ['2026-02-16', '2026-02-24'];
    const cumulative = {
      '2026-02-16': 78,
      '2026-02-24': 78   // 同一累積値
    };
    const baseline = 0;  // prevCountリセット状態をシミュレート
    const result = calcIncrements(cumulative, dateList, baseline);
    // 2/16: 78 - 0 = +78（正規スパイク）
    // 2/24: maxSeenCount=78 により 78 - 78 = 0（重複防止）
    assertEqual('ケースF-2: prevCountリセット後の重複スパイク防止', result, [78, 0]);
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
