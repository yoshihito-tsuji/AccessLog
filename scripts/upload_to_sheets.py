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


def read_daily_csv(csv_path):
    """日次CSVファイルを読み込み"""
    data = []
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            data.append(row)
    return data


def aggregate_by_version(data):
    """バージョン別にダウンロード数を集計"""
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

        # sha256ファイルは除外
        if '.sha256' in asset_name:
            continue

        # アセット名からMac/Win版を判別
        is_mac = 'mac' in asset_name.lower() or '.dmg' in asset_name.lower()
        is_win = 'windows' in asset_name.lower() or '.zip' in asset_name.lower() or '.exe' in asset_name.lower()

        if repo == 'GaQ':
            key = f"{release_name} ({tag})"
            if is_mac:
                gaq_mac_versions[key] = gaq_mac_versions.get(key, 0) + download_count
            elif is_win:
                gaq_win_versions[key] = gaq_win_versions.get(key, 0) + download_count
        elif repo == 'PoPuP':
            key = f"{release_name} ({tag})"
            if is_mac:
                popup_mac_versions[key] = popup_mac_versions.get(key, 0) + download_count
            elif is_win:
                popup_win_versions[key] = popup_win_versions.get(key, 0) + download_count

    return gaq_mac_versions, gaq_win_versions, popup_mac_versions, popup_win_versions


def upload_to_google_sheets(data, gaq_mac_versions, gaq_win_versions, popup_mac_versions, popup_win_versions):
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

        # 当日のデータを削除（冪等性を確保）
        today = datetime.now().strftime('%Y-%m-%d')
        logger.info(f"当日データの重複チェック: {today}")
        all_values = daily_sheet.get_all_values()

        # 削除する行のインデックスを収集（降順にソートして後ろから削除）
        rows_to_delete = []
        for idx, row in enumerate(all_values[1:], start=2):  # ヘッダーをスキップ
            if row and row[0].startswith(today):
                rows_to_delete.append(idx)

        # 後ろから削除（インデックスのずれを防ぐ）
        for row_idx in reversed(rows_to_delete):
            daily_sheet.delete_rows(row_idx)

        if rows_to_delete:
            logger.info(f"削除した既存レコード数: {len(rows_to_delete)}件")
            print(f"   削除した既存レコード数: {len(rows_to_delete)}件")

        # データを追加（バッチ処理でAPI呼び出し回数を削減）
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
        if rows_to_add:
            daily_sheet.append_rows(rows_to_add, value_input_option='RAW')
            logger.info(f"DailyDataシートにデータ追加完了: {len(data)}件（1回のAPI呼び出し）")
        else:
            logger.info("追加するデータがありません")

        # バージョン別集計シート（GaQ Mac版）
        try:
            gaq_mac_sheet = spreadsheet.worksheet('GaQ_Mac_Summary')
        except gspread.WorksheetNotFound:
            gaq_mac_sheet = spreadsheet.add_worksheet(title='GaQ_Mac_Summary', rows=100, cols=10)
            gaq_mac_sheet.append_row(['日付', 'バージョン', 'ダウンロード数'])

        # 当日のデータを削除（冪等性を確保）
        gaq_mac_all_values = gaq_mac_sheet.get_all_values()
        gaq_mac_rows_to_delete = []
        for idx, row in enumerate(gaq_mac_all_values[1:], start=2):
            if row and row[0] == today:
                gaq_mac_rows_to_delete.append(idx)

        for row_idx in reversed(gaq_mac_rows_to_delete):
            gaq_mac_sheet.delete_rows(row_idx)

        # データを追加（バッチ処理でAPI呼び出し回数を削減）
        gaq_mac_rows_to_add = [[today, version, count] for version, count in gaq_mac_versions.items()]
        if gaq_mac_rows_to_add:
            gaq_mac_sheet.append_rows(gaq_mac_rows_to_add, value_input_option='RAW')
            logger.info(f"GaQ_Mac_Summaryシートにデータ追加完了: {len(gaq_mac_rows_to_add)}件（1回のAPI呼び出し）")

        # バージョン別集計シート（GaQ Win版）
        try:
            gaq_win_sheet = spreadsheet.worksheet('GaQ_Win_Summary')
        except gspread.WorksheetNotFound:
            gaq_win_sheet = spreadsheet.add_worksheet(title='GaQ_Win_Summary', rows=100, cols=10)
            gaq_win_sheet.append_row(['日付', 'バージョン', 'ダウンロード数'])

        # 当日のデータを削除（冪等性を確保）
        gaq_win_all_values = gaq_win_sheet.get_all_values()
        gaq_win_rows_to_delete = []
        for idx, row in enumerate(gaq_win_all_values[1:], start=2):
            if row and row[0] == today:
                gaq_win_rows_to_delete.append(idx)

        for row_idx in reversed(gaq_win_rows_to_delete):
            gaq_win_sheet.delete_rows(row_idx)

        # データを追加（バッチ処理でAPI呼び出し回数を削減）
        gaq_win_rows_to_add = [[today, version, count] for version, count in gaq_win_versions.items()]
        if gaq_win_rows_to_add:
            gaq_win_sheet.append_rows(gaq_win_rows_to_add, value_input_option='RAW')
            logger.info(f"GaQ_Win_Summaryシートにデータ追加完了: {len(gaq_win_rows_to_add)}件（1回のAPI呼び出し）")

        # バージョン別集計シート（PoPuP Mac版）
        try:
            popup_mac_sheet = spreadsheet.worksheet('PoPuP_Mac_Summary')
        except gspread.WorksheetNotFound:
            popup_mac_sheet = spreadsheet.add_worksheet(title='PoPuP_Mac_Summary', rows=100, cols=10)
            popup_mac_sheet.append_row(['日付', 'バージョン', 'ダウンロード数'])

        # 当日のデータを削除（冪等性を確保）
        popup_mac_all_values = popup_mac_sheet.get_all_values()
        popup_mac_rows_to_delete = []
        for idx, row in enumerate(popup_mac_all_values[1:], start=2):
            if row and row[0] == today:
                popup_mac_rows_to_delete.append(idx)

        for row_idx in reversed(popup_mac_rows_to_delete):
            popup_mac_sheet.delete_rows(row_idx)

        # データを追加（バッチ処理でAPI呼び出し回数を削減）
        popup_mac_rows_to_add = [[today, version, count] for version, count in popup_mac_versions.items()]
        if popup_mac_rows_to_add:
            popup_mac_sheet.append_rows(popup_mac_rows_to_add, value_input_option='RAW')
            logger.info(f"PoPuP_Mac_Summaryシートにデータ追加完了: {len(popup_mac_rows_to_add)}件（1回のAPI呼び出し）")

        # バージョン別集計シート（PoPuP Win版）
        try:
            popup_win_sheet = spreadsheet.worksheet('PoPuP_Win_Summary')
        except gspread.WorksheetNotFound:
            popup_win_sheet = spreadsheet.add_worksheet(title='PoPuP_Win_Summary', rows=100, cols=10)
            popup_win_sheet.append_row(['日付', 'バージョン', 'ダウンロード数'])

        # 当日のデータを削除（冪等性を確保）
        popup_win_all_values = popup_win_sheet.get_all_values()
        popup_win_rows_to_delete = []
        for idx, row in enumerate(popup_win_all_values[1:], start=2):
            if row and row[0] == today:
                popup_win_rows_to_delete.append(idx)

        for row_idx in reversed(popup_win_rows_to_delete):
            popup_win_sheet.delete_rows(row_idx)

        # データを追加（バッチ処理でAPI呼び出し回数を削減）
        popup_win_rows_to_add = [[today, version, count] for version, count in popup_win_versions.items()]
        if popup_win_rows_to_add:
            popup_win_sheet.append_rows(popup_win_rows_to_add, value_input_option='RAW')
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

    # 当日のCSVファイルを読み込み
    today = datetime.now().strftime('%Y-%m-%d')
    csv_path = DATA_DIR / "daily" / f'downloads_{today}.csv'

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
    upload_to_google_sheets(data, gaq_mac_versions, gaq_win_versions, popup_mac_versions, popup_win_versions)


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n中断されました", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ 予期しないエラー: {e}", file=sys.stderr)
        sys.exit(1)
