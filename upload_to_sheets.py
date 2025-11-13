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
from datetime import datetime
from pathlib import Path

# Google Sheets API用ライブラリのインポート（オプション）
try:
    import gspread
    from oauth2client.service_account import ServiceAccountCredentials
    GSPREAD_AVAILABLE = True
except ImportError:
    GSPREAD_AVAILABLE = False
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
    gaq_versions = {}
    popup_versions = {}

    for row in data:
        repo = row['リポジトリ']
        release_name = row['リリース名']
        tag = row['タグ']
        download_count = int(row['ダウンロード数'])

        # sha256ファイルは除外
        if '.sha256' in row['アセット名']:
            continue

        if repo == 'GaQ':
            key = f"{release_name} ({tag})"
            gaq_versions[key] = gaq_versions.get(key, 0) + download_count
        elif repo == 'PoPuP':
            key = f"{release_name} ({tag})"
            popup_versions[key] = popup_versions.get(key, 0) + download_count

    return gaq_versions, popup_versions


def upload_to_google_sheets(data, gaq_versions, popup_versions):
    """Google Sheetsにデータをアップロード"""
    if not GSPREAD_AVAILABLE:
        print("❌ Google Sheets連携がスキップされました（gspreadが未インストール）")
        return False

    # 環境変数から設定を取得
    credentials_path = os.environ.get('GOOGLE_SHEETS_CREDENTIALS', './credentials.json')
    spreadsheet_id = os.environ.get('SPREADSHEET_ID')

    if not spreadsheet_id:
        print("❌ 環境変数 SPREADSHEET_ID が設定されていません")
        return False

    if not os.path.exists(credentials_path):
        print(f"❌ 認証ファイルが見つかりません: {credentials_path}")
        return False

    try:
        # Google Sheets認証
        scope = [
            'https://spreadsheets.google.com/feeds',
            'https://www.googleapis.com/auth/drive'
        ]
        credentials = ServiceAccountCredentials.from_json_keyfile_name(credentials_path, scope)
        client = gspread.authorize(credentials)

        # スプレッドシートを開く
        spreadsheet = client.open_by_key(spreadsheet_id)

        # 日次データシート
        try:
            daily_sheet = spreadsheet.worksheet('DailyData')
        except gspread.WorksheetNotFound:
            daily_sheet = spreadsheet.add_worksheet(title='DailyData', rows=1000, cols=10)
            daily_sheet.append_row(['記録日時', 'リポジトリ', 'リリース名', 'タグ', 'アセット名', 'ダウンロード数'])

        # 当日のデータを削除（冪等性を確保）
        today = datetime.now().strftime('%Y-%m-%d')
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
            print(f"   削除した既存レコード数: {len(rows_to_delete)}件")

        # データを追加
        for row in data:
            daily_sheet.append_row([
                row['記録日時'],
                row['リポジトリ'],
                row['リリース名'],
                row['タグ'],
                row['アセット名'],
                row['ダウンロード数']
            ])

        # バージョン別集計シート（GaQ）
        try:
            gaq_sheet = spreadsheet.worksheet('GaQ_Summary')
        except gspread.WorksheetNotFound:
            gaq_sheet = spreadsheet.add_worksheet(title='GaQ_Summary', rows=100, cols=10)
            gaq_sheet.append_row(['日付', 'バージョン', 'ダウンロード数'])

        # 当日のデータを削除（冪等性を確保）
        gaq_all_values = gaq_sheet.get_all_values()
        gaq_rows_to_delete = []
        for idx, row in enumerate(gaq_all_values[1:], start=2):
            if row and row[0] == today:
                gaq_rows_to_delete.append(idx)

        for row_idx in reversed(gaq_rows_to_delete):
            gaq_sheet.delete_rows(row_idx)

        # データを追加
        for version, count in gaq_versions.items():
            gaq_sheet.append_row([today, version, count])

        # バージョン別集計シート（PoPuP）
        try:
            popup_sheet = spreadsheet.worksheet('PoPuP_Summary')
        except gspread.WorksheetNotFound:
            popup_sheet = spreadsheet.add_worksheet(title='PoPuP_Summary', rows=100, cols=10)
            popup_sheet.append_row(['日付', 'バージョン', 'ダウンロード数'])

        # 当日のデータを削除（冪等性を確保）
        popup_all_values = popup_sheet.get_all_values()
        popup_rows_to_delete = []
        for idx, row in enumerate(popup_all_values[1:], start=2):
            if row and row[0] == today:
                popup_rows_to_delete.append(idx)

        for row_idx in reversed(popup_rows_to_delete):
            popup_sheet.delete_rows(row_idx)

        # データを追加
        for version, count in popup_versions.items():
            popup_sheet.append_row([today, version, count])

        print("✅ Google Sheetsにアップロードしました")
        return True

    except Exception as e:
        print(f"❌ Google Sheetsへのアップロードに失敗しました: {e}")
        return False


def main():
    """メイン処理"""
    # 当日のCSVファイルを読み込み
    today = datetime.now().strftime('%Y-%m-%d')
    csv_path = Path(__file__).parent / f'downloads_{today}.csv'

    if not csv_path.exists():
        print(f"❌ CSVファイルが見つかりません: {csv_path}")
        sys.exit(1)

    print(f"📊 ダウンロード統計のGoogle Sheetsアップロード")
    print(f"   CSVファイル: {csv_path}\n")

    # CSVを読み込み
    data = read_daily_csv(csv_path)
    print(f"   読み込んだレコード数: {len(data)}件")

    # バージョン別に集計
    gaq_versions, popup_versions = aggregate_by_version(data)

    print(f"\n📦 GaQ バージョン別集計:")
    for version, count in gaq_versions.items():
        print(f"   - {version}: {count} DL")

    print(f"\n📦 PoPuP バージョン別集計:")
    for version, count in popup_versions.items():
        print(f"   - {version}: {count} DL")

    print()

    # Google Sheetsにアップロード
    upload_to_google_sheets(data, gaq_versions, popup_versions)


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print("\n\n中断されました", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ 予期しないエラー: {e}", file=sys.stderr)
        sys.exit(1)
