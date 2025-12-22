#!/usr/bin/env python3
"""
GitHub Releases ダウンロード統計をGoogle Sheetsにアップロードするスクリプト

機能:
- CSVファイルを読み込み
- Google Sheets APIを使用してスプレッドシートに書き込み
- バージョン別の集計データも同時に記録

使用方法:
    python upload_to_sheets.py

環境変数:
    GOOGLE_SHEETS_CREDENTIALS: サービスアカウントJSONファイルのパス（デフォルト: ./credentials.json）
    SPREADSHEET_ID: Google SheetsのスプレッドシートID（必須）

必要なパッケージ:
    pip install gspread oauth2client
"""

import os
import sys
import csv
import json
import logging
import time
import re
from datetime import datetime
from pathlib import Path

# パス設定
SCRIPT_DIR = Path(__file__).resolve().parent
ROOT_DIR = SCRIPT_DIR.parent
DATA_DIR = ROOT_DIR / "data"

# ログ設定
LOG_FILE = ROOT_DIR / 'logs' / 'tracker_error.log'
LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] %(levelname)s: %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
    handlers=[
        logging.FileHandler(str(LOG_FILE), mode='a'),  # 追記モード
        logging.StreamHandler()  # 標準出力にも表示
    ]
)
logger = logging.getLogger(__name__)

# Google Sheets API用ライブラリのインポート（オプション）
try:
    import gspread
    from oauth2client.service_account import ServiceAccountCredentials
    GSPREAD_AVAILABLE = True
    logger.info("gspread/oauth2clientライブラリを正常にインポート")
except ImportError:
    GSPREAD_AVAILABLE = False
    logger.warning("gspreadライブラリがインストールされていません")
    print("⚠️  gspreadライブラリがインストールされていません")
    print("   インストール: pip install gspread oauth2client")


# Apps Scriptと同一の除外リスト（15パターン）
EXCLUDED_ASSET_SUFFIXES = [
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
]


def is_excluded_asset_name(asset_name):
    """チェックサム/署名ファイルかどうか判定（Apps Scriptと同一ロジック）"""
    lower_name = asset_name.lower()
    return any(lower_name.endswith(suffix) for suffix in EXCLUDED_ASSET_SUFFIXES)


def has_windows_hint(asset_name):
    """Windowsを示すヒントがあるか判定（Apps Scriptと同一ロジック）"""
    lower_name = asset_name.lower()
    if 'windows' in lower_name:
        return True
    if 'portable' in lower_name:
        return True
    # win, win32, win64 を単語境界で検出
    if re.search(r'(^|[^a-z0-9])win(32|64)?([^a-z0-9]|$)', lower_name):
        return True
    return False


def detect_platform(repo, asset_name):
    """
    リポジトリとアセット名からプラットフォームを判定（Apps Scriptと同一ロジック）

    Returns:
        'mac', 'windows', または None（判定不能/除外対象）
    """
    lower_name = asset_name.lower()

    # チェックサム/署名ファイルは除外
    if is_excluded_asset_name(asset_name):
        return None

    if repo == 'GaQ':
        is_mac = 'mac' in lower_name or lower_name.endswith('.dmg')
        is_windows = has_windows_hint(lower_name) or lower_name.endswith('.exe')

        if is_mac:
            return 'mac'
        elif is_windows:
            return 'windows'
        else:
            return None

    elif repo == 'PoPuP':
        is_mac = 'mac' in lower_name or lower_name.endswith('.dmg') or '.app' in lower_name
        is_legacy_windows_zip = lower_name == 'popup-v1.0.0.zip'
        is_windows = has_windows_hint(lower_name) or lower_name.endswith('.exe') or is_legacy_windows_zip

        if is_mac:
            return 'mac'
        elif is_windows:
            return 'windows'
        else:
            return None

    return None


def read_daily_csv(csv_path):
    """日次CSVファイルを読み込み"""
    data = []
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            data.append(row)
    return data


def aggregate_by_version(data):
    """バージョン別にダウンロード数を集計（Apps Scriptと同一ロジック）"""
    gaq_mac_versions = {}
    gaq_win_versions = {}
    popup_mac_versions = {}
    popup_win_versions = {}

    for row in data:
        repo = row['リポジトリ']
        release_name = row['リリース名']
        tag = row['タグ']
        asset_name = row['アセット名']
        download_count = int(row['ダウンロード数'])

        # Apps Scriptと同一の判定ロジックを使用
        platform = detect_platform(repo, asset_name)
        if platform is None:
            # 判定不能なアセット（チェックサム以外）をログに記録
            if not is_excluded_asset_name(asset_name):
                logger.warning(f"判定不能なアセット: {repo}/{tag}/{asset_name}")
            continue

        key = f"{release_name} ({tag})"

        if repo == 'GaQ':
            if platform == 'mac':
                gaq_mac_versions[key] = gaq_mac_versions.get(key, 0) + download_count
            elif platform == 'windows':
                gaq_win_versions[key] = gaq_win_versions.get(key, 0) + download_count
        elif repo == 'PoPuP':
            if platform == 'mac':
                popup_mac_versions[key] = popup_mac_versions.get(key, 0) + download_count
            elif platform == 'windows':
                popup_win_versions[key] = popup_win_versions.get(key, 0) + download_count

    return gaq_mac_versions, gaq_win_versions, popup_mac_versions, popup_win_versions


def _filter_rows_by_date(rows, target_date, match_prefix):
    if not rows:
        return rows
    header = rows[0]
    filtered = [header]
    for row in rows[1:]:
        if not row:
            continue
        cell = row[0]
        if match_prefix:
            if not cell.startswith(target_date):
                filtered.append(row)
        else:
            if cell != target_date:
                filtered.append(row)
    return filtered


def _update_sheet_with_rows(sheet, rows):
    """
    シートをrowsの内容で更新する（sheet.clear()を使わない安全な方式）

    既存データを消さずに、必要な範囲のみを更新する。
    rowsが空の場合は何もしない。
    """
    if not rows:
        return

    # 更新する範囲を計算
    num_rows = len(rows)
    num_cols = max(len(row) for row in rows) if rows else 0

    if num_rows == 0 or num_cols == 0:
        return

    # A1:最終列最終行 の範囲を指定して更新
    end_col = chr(ord('A') + num_cols - 1)  # A, B, C, ... 列名
    range_notation = f'A1:{end_col}{num_rows}'

    # 一括更新（clear()を使わない）
    sheet.update(range_notation, rows, value_input_option='RAW')

    # 既存データがrowsより多い場合、余分な行を空にする
    # シートの現在の行数を取得して、超過分をクリア（上限なし・分割更新）
    try:
        current_row_count = sheet.row_count
        if current_row_count > num_rows:
            rows_to_clear = current_row_count - num_rows
            if rows_to_clear > 0:
                chunk_size = 500
                start_row = num_rows + 1
                while rows_to_clear > 0:
                    clear_rows = min(rows_to_clear, chunk_size)
                    empty_rows = [[''] * num_cols for _ in range(clear_rows)]
                    clear_range = f'A{start_row}:{end_col}{start_row + clear_rows - 1}'
                    sheet.update(clear_range, empty_rows, value_input_option='RAW')
                    start_row += clear_rows
                    rows_to_clear -= clear_rows
    except Exception:
        # 超過行のクリアに失敗しても、メインの更新は成功しているので続行
        pass


def upload_to_google_sheets(data, gaq_mac_versions, gaq_win_versions, popup_mac_versions, popup_win_versions, target_date):
    """Google Sheetsにデータをアップロード"""
    if not GSPREAD_AVAILABLE:
        logger.error("Google Sheets連携がスキップされました（gspreadが未インストール）")
        print("❌ Google Sheets連携がスキップされました（gspreadが未インストール）")
        return False

    # 環境変数から設定を取得
    credentials_env = os.environ.get('GOOGLE_SHEETS_CREDENTIALS')
    credentials_path = Path(credentials_env).expanduser() if credentials_env else ROOT_DIR / 'credentials.json'
    spreadsheet_id = os.environ.get('SPREADSHEET_ID')

    if not spreadsheet_id:
        logger.error("環境変数 SPREADSHEET_ID が設定されていません")
        print("❌ 環境変数 SPREADSHEET_ID が設定されていません")
        return False

    if not credentials_path.exists():
        logger.error(f"認証ファイルが見つかりません: {credentials_path}")
        print(f"❌ 認証ファイルが見つかりません: {credentials_path}")
        return False

    try:
        logger.info(f"Google Sheets認証開始: {credentials_path}")
        # Google Sheets認証
        scope = [
            'https://spreadsheets.google.com/feeds',
            'https://www.googleapis.com/auth/drive'
        ]
        credentials = ServiceAccountCredentials.from_json_keyfile_name(str(credentials_path), scope)
        client = gspread.authorize(credentials)
        logger.info("Google Sheets認証成功")

        # スプレッドシートを開く
        logger.info(f"スプレッドシート接続: {spreadsheet_id}")
        spreadsheet = client.open_by_key(spreadsheet_id)
        logger.info(f"スプレッドシート '{spreadsheet.title}' を開きました")

        # 日次データシート
        try:
            daily_sheet = spreadsheet.worksheet('DailyData')
            logger.info("DailyDataシートを取得")
        except gspread.WorksheetNotFound:
            logger.warning("DailyDataシートが見つかりません。新規作成します")
            daily_sheet = spreadsheet.add_worksheet(title='DailyData', rows=1000, cols=10)
            daily_sheet.append_row(['記録日時', 'リポジトリ', 'リリース名', 'タグ', 'アセット名', 'ダウンロード数'])
            logger.info("DailyDataシートを作成しました")

        # 当日のデータを差し替え（冪等性を確保）
        logger.info(f"当日データの重複チェック: {target_date}")
        all_values = daily_sheet.get_all_values()
        if not all_values:
            all_values = [['記録日時', 'リポジトリ', 'リリース名', 'タグ', 'アセット名', 'ダウンロード数']]

        filtered_values = _filter_rows_by_date(all_values, target_date, match_prefix=True)
        before_count = max(len(all_values) - 1, 0)
        after_count = max(len(filtered_values) - 1, 0)
        removed = before_count - after_count
        if removed:
            logger.info(f"削除した既存レコード数: {removed}件")
            print(f"   削除した既存レコード数: {removed}件")

        # データを追加（1回の更新にまとめる）
        logger.info(f"DailyDataシートにデータ追加開始: {len(data)}件")
        rows_to_add = [
            [
                row['記録日時'],
                row['リポジトリ'],
                row['リリース名'],
                row['タグ'],
                row['アセット名'],
                row['ダウンロード数']
            ]
            for row in data
        ]
        merged_values = filtered_values + rows_to_add
        _update_sheet_with_rows(daily_sheet, merged_values)
        logger.info(f"DailyDataシートにデータ追加完了: {len(rows_to_add)}件（1回のAPI呼び出し）")

        # バージョン別集計シート（GaQ Mac版）
        try:
            gaq_mac_sheet = spreadsheet.worksheet('GaQ_Mac_Summary')
        except gspread.WorksheetNotFound:
            gaq_mac_sheet = spreadsheet.add_worksheet(title='GaQ_Mac_Summary', rows=100, cols=10)
            gaq_mac_sheet.append_row(['日付', 'バージョン', 'ダウンロード数'])

        gaq_mac_all_values = gaq_mac_sheet.get_all_values()
        if not gaq_mac_all_values:
            gaq_mac_all_values = [['日付', 'バージョン', 'ダウンロード数']]
        gaq_mac_filtered = _filter_rows_by_date(gaq_mac_all_values, target_date, match_prefix=False)
        gaq_mac_rows_to_add = [[target_date, version, count] for version, count in gaq_mac_versions.items()]
        _update_sheet_with_rows(gaq_mac_sheet, gaq_mac_filtered + gaq_mac_rows_to_add)
        if gaq_mac_rows_to_add:
            logger.info(f"GaQ_Mac_Summaryシートにデータ追加完了: {len(gaq_mac_rows_to_add)}件（1回のAPI呼び出し）")

        # バージョン別集計シート（GaQ Win版）
        try:
            gaq_win_sheet = spreadsheet.worksheet('GaQ_Win_Summary')
        except gspread.WorksheetNotFound:
            gaq_win_sheet = spreadsheet.add_worksheet(title='GaQ_Win_Summary', rows=100, cols=10)
            gaq_win_sheet.append_row(['日付', 'バージョン', 'ダウンロード数'])

        gaq_win_all_values = gaq_win_sheet.get_all_values()
        if not gaq_win_all_values:
            gaq_win_all_values = [['日付', 'バージョン', 'ダウンロード数']]
        gaq_win_filtered = _filter_rows_by_date(gaq_win_all_values, target_date, match_prefix=False)
        gaq_win_rows_to_add = [[target_date, version, count] for version, count in gaq_win_versions.items()]
        _update_sheet_with_rows(gaq_win_sheet, gaq_win_filtered + gaq_win_rows_to_add)
        if gaq_win_rows_to_add:
            logger.info(f"GaQ_Win_Summaryシートにデータ追加完了: {len(gaq_win_rows_to_add)}件（1回のAPI呼び出し）")

        # バージョン別集計シート（PoPuP Mac版）
        try:
            popup_mac_sheet = spreadsheet.worksheet('PoPuP_Mac_Summary')
        except gspread.WorksheetNotFound:
            popup_mac_sheet = spreadsheet.add_worksheet(title='PoPuP_Mac_Summary', rows=100, cols=10)
            popup_mac_sheet.append_row(['日付', 'バージョン', 'ダウンロード数'])

        popup_mac_all_values = popup_mac_sheet.get_all_values()
        if not popup_mac_all_values:
            popup_mac_all_values = [['日付', 'バージョン', 'ダウンロード数']]
        popup_mac_filtered = _filter_rows_by_date(popup_mac_all_values, target_date, match_prefix=False)
        popup_mac_rows_to_add = [[target_date, version, count] for version, count in popup_mac_versions.items()]
        _update_sheet_with_rows(popup_mac_sheet, popup_mac_filtered + popup_mac_rows_to_add)
        if popup_mac_rows_to_add:
            logger.info(f"PoPuP_Mac_Summaryシートにデータ追加完了: {len(popup_mac_rows_to_add)}件（1回のAPI呼び出し）")

        # バージョン別集計シート（PoPuP Win版）
        try:
            popup_win_sheet = spreadsheet.worksheet('PoPuP_Win_Summary')
        except gspread.WorksheetNotFound:
            popup_win_sheet = spreadsheet.add_worksheet(title='PoPuP_Win_Summary', rows=100, cols=10)
            popup_win_sheet.append_row(['日付', 'バージョン', 'ダウンロード数'])

        popup_win_all_values = popup_win_sheet.get_all_values()
        if not popup_win_all_values:
            popup_win_all_values = [['日付', 'バージョン', 'ダウンロード数']]
        popup_win_filtered = _filter_rows_by_date(popup_win_all_values, target_date, match_prefix=False)
        popup_win_rows_to_add = [[target_date, version, count] for version, count in popup_win_versions.items()]
        _update_sheet_with_rows(popup_win_sheet, popup_win_filtered + popup_win_rows_to_add)
        if popup_win_rows_to_add:
            logger.info(f"PoPuP_Win_Summaryシートにデータ追加完了: {len(popup_win_rows_to_add)}件（1回のAPI呼び出し）")

        logger.info("Google Sheetsへのアップロードが完了しました")
        print("✅ Google Sheetsにアップロードしました")
        return True

    except Exception as e:
        logger.error(f"Google Sheetsへのアップロードに失敗しました: {e}", exc_info=True)
        print(f"❌ Google Sheetsへのアップロードに失敗しました: {e}")
        return False


def main():
    """メイン処理"""
    logger.info("upload_to_sheets.py 実行開始")

    import argparse

    parser = argparse.ArgumentParser(description="Upload daily CSV to Google Sheets.")
    parser.add_argument("--date", help="対象日付 (YYYY-MM-DD)。省略時は当日。")
    args = parser.parse_args()

    # 対象日のCSVファイルを読み込み
    target_date = args.date or datetime.now().strftime('%Y-%m-%d')
    csv_path = DATA_DIR / "daily" / f'downloads_{target_date}.csv'

    if not csv_path.exists():
        logger.error(f"CSVファイルが見つかりません: {csv_path}")
        print(f"❌ CSVファイルが見つかりません: {csv_path}")
        sys.exit(1)

    logger.info(f"CSVファイル読み込み開始: {csv_path}")
    print(f"📊 ダウンロード統計のGoogle Sheetsアップロード")
    print(f"   CSVファイル: {csv_path}\n")

    # CSVを読み込み
    data = read_daily_csv(csv_path)
    logger.info(f"CSVファイル読み込み完了: {len(data)}件")
    print(f"   読み込んだレコード数: {len(data)}件")

    # バージョン別に集計
    gaq_mac_versions, gaq_win_versions, popup_mac_versions, popup_win_versions = aggregate_by_version(data)

    print(f"\n📦 GaQ (Mac) バージョン別集計:")
    for version, count in gaq_mac_versions.items():
        print(f"   - {version}: {count} DL")

    print(f"\n📦 GaQ (Win) バージョン別集計:")
    for version, count in gaq_win_versions.items():
        print(f"   - {version}: {count} DL")

    print(f"\n📦 PoPuP (Mac) バージョン別集計:")
    for version, count in popup_mac_versions.items():
        print(f"   - {version}: {count} DL")

    print(f"\n📦 PoPuP (Win) バージョン別集計:")
    for version, count in popup_win_versions.items():
        print(f"   - {version}: {count} DL")

    print()

    # Google Sheetsにアップロード
    max_attempts = 5
    base_delay = 5
    for attempt in range(1, max_attempts + 1):
        success = upload_to_google_sheets(
            data,
            gaq_mac_versions,
            gaq_win_versions,
            popup_mac_versions,
            popup_win_versions,
            target_date
        )
        if success:
            return 0

        if attempt < max_attempts:
            delay = base_delay * (2 ** (attempt - 1))
            logger.warning(f"アップロード失敗。{delay}秒後に再試行します（{attempt}/{max_attempts}）")
            time.sleep(delay)
        else:
            logger.error("アップロードの再試行上限に達しました")
            return 1


if __name__ == '__main__':
    try:
        exit_code = main()
        sys.exit(exit_code)
    except KeyboardInterrupt:
        print("\n\n中断されました", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ 予期しないエラー: {e}", file=sys.stderr)
        sys.exit(1)
