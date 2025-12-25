/**
 * Google Apps Script Web API
 * GitHub Releases ダウンロード統計を提供
 */

// スプレッドシートIDを設定
const SPREADSHEET_ID = '1-n-CpA9U8kwqTRxhbKBhNOj0-lcZjLG1MJXLhxgdQPs';
const SHEET_NAME = 'DailyData';

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

  records.forEach(row => {
    const timestamp = row[0];

    // parseTimestamp()で統一的にDate変換
    const timestampDate = parseTimestamp(timestamp);

    // Invalid Dateの場合はスキップ
    if (timestampDate === null) {
      return;
    }

    const dateStr = formatDate(timestampDate);

    // 対象期間外は除外
    if (!dateList.includes(dateStr)) {
      return;
    }

    // この日付の最新レコードを保持
    if (!latestRecordsByDate[dateStr]) {
      latestRecordsByDate[dateStr] = { timestamp: timestampDate, rows: [] };
    }

    const current = latestRecordsByDate[dateStr];

    if (current.timestamp < timestampDate) {
      // より新しいタイムスタンプが見つかったら置き換え
      latestRecordsByDate[dateStr] = { timestamp: timestampDate, rows: [row] };
    } else if (current.timestamp.getTime() === timestampDate.getTime()) {
      // 同じタイムスタンプなら追加
      current.rows.push(row);
    }
  });

  // 最新レコードのみを処理
  const excludedAssetSuffixes = [
    '.sha256',
    '.sha256.txt',
    '.sha256sum',
    '.sha512',
    '.sha512.txt',
    '.sha512sum',
    '.md5',
    '.md5sum',
    '.sha1',
    '.sha1.txt',
    '.sha1sum',
    '.checksum',
    '.checksum.txt',
    '.sig',
    '.asc'
  ];
  const isExcludedAssetName = lowerAssetName =>
    excludedAssetSuffixes.some(suffix => lowerAssetName.endsWith(suffix));
  const hasWindowsHint = lowerAssetName =>
    lowerAssetName.includes('windows') ||
    lowerAssetName.includes('portable') ||
    /(^|[^a-z0-9])win(32|64)?([^a-z0-9]|$)/.test(lowerAssetName);

  Object.keys(latestRecordsByDate).forEach(dateStr => {
    const latestData = latestRecordsByDate[dateStr];

    latestData.rows.forEach(row => {
      const repo = row[1];      // リポジトリ
      const releaseName = row[2]; // リリース名
      const tag = row[3];       // タグ
      const assetName = row[4]; // アセット名
      const count = parseInt(row[5]) || 0; // ダウンロード数

      // アプリ名を判定
      let appName;
      if (repo === 'GaQ') {
        // Mac版とWindows版をアセット名で判定（v1.2.10以降の統合リリース対応）
        const lowerAssetName = assetName.toLowerCase();
        // チェックサム/署名ファイルなど判定不能なファイルはスキップ
        if (isExcludedAssetName(lowerAssetName)) {
          return;
        }
        const isMac = lowerAssetName.includes('mac') || lowerAssetName.endsWith('.dmg');
        const isWindows = hasWindowsHint(lowerAssetName) || lowerAssetName.endsWith('.exe');

        if (isMac) {
          appName = 'GaQ (Mac)';
        } else if (isWindows) {
          appName = 'GaQ (Windows)';
        } else {
          // 判定不能なアセットをログに記録
          console.log('判定不能なアセット: ' + repo + '/' + tag + '/' + assetName);
          return;
        }
      } else if (repo === 'PoPuP') {
        // Mac版とWindows版をアセット名で判定
        const lowerAssetName = assetName.toLowerCase();
        // チェックサム/署名ファイルなど判定不能なファイルはスキップ
        if (isExcludedAssetName(lowerAssetName)) {
          return;
        }
        const isMac = lowerAssetName.includes('mac') || lowerAssetName.endsWith('.dmg') || lowerAssetName.includes('.app');
        const isLegacyWindowsZip = lowerAssetName === 'popup-v1.0.0.zip';
        const isWindows = hasWindowsHint(lowerAssetName) || lowerAssetName.endsWith('.exe') || isLegacyWindowsZip;

        if (isMac) {
          appName = 'PoPuP (Mac)';
        } else if (isWindows) {
          appName = 'PoPuP (Windows)';
        } else {
          // 判定不能なアセットをログに記録
          console.log('判定不能なアセット: ' + repo + '/' + tag + '/' + assetName);
          return;
        }
      } else {
        return; // 不明なリポジトリは除外
      }

      // バージョン名（タグを使用）
      const versionName = tag;

      // データ構造を初期化
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

  // 累積ダウンロード数から日次増分を計算
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

    // バージョンごとに日次増分を計算
    versionNames.forEach(versionName => {
      const dailyData = [];
      let prevCount = 0;

      dateList.forEach(date => {
        // データが存在する日付のみ累積値を取得
        if (appData[appName][date]?.[versionName] !== undefined) {
          const currentCount = appData[appName][date][versionName];
          const increment = Math.max(0, currentCount - prevCount);
          dailyData.push(increment);
          prevCount = currentCount;
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
