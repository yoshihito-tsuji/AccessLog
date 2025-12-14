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
    let dateStr;
    let timestampDate;

    if (timestamp instanceof Date) {
      dateStr = formatDate(timestamp);
      timestampDate = timestamp;
    } else {
      dateStr = timestamp.toString().split(' ')[0];
      timestampDate = new Date(timestamp);
    }

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
        const isMac = lowerAssetName.includes('mac') || lowerAssetName.includes('.dmg');
        const isWindows = lowerAssetName.includes('windows') || lowerAssetName.includes('.zip') || lowerAssetName.includes('.exe');

        if (isMac) {
          appName = 'GaQ (Mac)';
        } else if (isWindows) {
          appName = 'GaQ (Windows)';
        } else {
          // sha256など判定不能なファイルはスキップ
          return;
        }
      } else if (repo === 'PoPuP') {
        // Mac版とWindows版をアセット名で判定
        const lowerAssetName = assetName.toLowerCase();
        const isMac = lowerAssetName.includes('mac') || lowerAssetName.includes('.dmg') || lowerAssetName.includes('.app');
        const isWindows = lowerAssetName.includes('windows') || lowerAssetName.includes('.zip') || lowerAssetName.includes('.exe') || lowerAssetName.includes('portable');

        if (isMac) {
          appName = 'PoPuP (Mac)';
        } else if (isWindows) {
          appName = 'PoPuP (Windows)';
        } else {
          // sha256など判定不能なファイルはスキップ
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