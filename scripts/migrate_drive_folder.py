#!/usr/bin/env python3
"""
Google Drive フォルダ整理スクリプト（ワンタイム実行用）

【前提条件】
サービスアカウントはファイルのオーナーではなく「共有された編集者」のため、
ユーザーの My Drive ルートにフォルダを作成する権限がありません。

そのため、以下の手順を先に実施してください:
  1. Google Drive UI で「AccessLog」フォルダを手動作成
  2. フォルダの URL から ID を取得（例: .../folders/XXXXX → ID=XXXXX）
  3. フォルダをサービスアカウントと共有（編集者権限）
  4. 下記コマンドで実行

使用方法:
    # 事前確認（ドライラン）
    SPREADSHEET_ID=... python scripts/migrate_drive_folder.py --target-folder-id <FOLDER_ID> --dry-run

    # 実際に移動を実行
    SPREADSHEET_ID=... python scripts/migrate_drive_folder.py --target-folder-id <FOLDER_ID>

環境変数:
    GOOGLE_SHEETS_CREDENTIALS: サービスアカウントJSONファイルのパス（デフォルト: ./credentials.json）
    SPREADSHEET_ID: 移動対象のスプレッドシートID（必須）

重要:
    ファイルを移動しても SPREADSHEET_ID は変わりません。
    既存の track_downloads.sh / upload_to_sheets.py への影響はありません。
"""

import os
import sys
import logging
import argparse
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
ROOT_DIR = SCRIPT_DIR.parent

LOG_FILE = ROOT_DIR / 'logs' / 'tracker_error.log'
LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
logging.basicConfig(
    level=logging.INFO,
    format='[%(asctime)s] %(levelname)s: %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S',
    handlers=[
        logging.FileHandler(str(LOG_FILE), mode='a'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

TARGET_FILE_ID_ENV = 'SPREADSHEET_ID'


def build_drive_service(credentials_path: Path):
    """Google Drive API サービスを構築"""
    try:
        from oauth2client.service_account import ServiceAccountCredentials
        from googleapiclient.discovery import build
    except ImportError as e:
        logger.error(f"必要なライブラリが見つかりません: {e}")
        logger.error("インストール: pip install oauth2client google-api-python-client")
        sys.exit(1)

    scope = ['https://www.googleapis.com/auth/drive']
    credentials = ServiceAccountCredentials.from_json_keyfile_name(str(credentials_path), scope)
    service = build('drive', 'v3', credentials=credentials)
    return service


def get_file_info(service, file_id: str) -> dict:
    """ファイル情報（名前・親フォルダ一覧）を取得"""
    result = service.files().get(
        fileId=file_id,
        fields='id,name,parents,mimeType'
    ).execute()
    return result


def get_folder_info(service, folder_id: str) -> dict:
    """フォルダ情報を取得して存在確認"""
    result = service.files().get(
        fileId=folder_id,
        fields='id,name,mimeType'
    ).execute()
    return result


def move_file(service, file_id: str, new_parent_id: str, old_parent_ids: list, dry_run: bool):
    """ファイルを新しい親フォルダに移動"""
    old_parents = ','.join(old_parent_ids) if old_parent_ids else None

    if dry_run:
        logger.info(f"[ドライラン] ファイル（ID: {file_id}）を移動します")
        logger.info(f"  移動元の親: {old_parents or '（取得不可 - My Drive ルート）'}")
        logger.info(f"  移動先の親: {new_parent_id}")
        return

    update_kwargs = {
        'fileId': file_id,
        'addParents': new_parent_id,
        'fields': 'id,parents'
    }
    if old_parents:
        update_kwargs['removeParents'] = old_parents

    service.files().update(**update_kwargs).execute()
    logger.info(f"ファイル（ID: {file_id}）を移動しました（フォルダ ID: {new_parent_id}）")


def main():
    parser = argparse.ArgumentParser(
        description='AppDownload を指定した Google Drive フォルダに移動します',
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
事前手順:
  1. Google Drive UI で「AccessLog」フォルダを手動作成
  2. フォルダ URL から ID を取得（.../folders/<FOLDER_ID>）
  3. フォルダをサービスアカウントのメールアドレスと共有（編集者権限）

実行例:
  SPREADSHEET_ID=1-n-... python scripts/migrate_drive_folder.py --target-folder-id 1ABC...XYZ --dry-run
  SPREADSHEET_ID=1-n-... python scripts/migrate_drive_folder.py --target-folder-id 1ABC...XYZ
        """
    )
    parser.add_argument('--dry-run', action='store_true', help='実際には変更せず内容を確認するだけ')
    parser.add_argument('--target-folder-id', required=True,
                        help='移動先フォルダの ID（Google Drive UI で作成後、URL から取得）')
    args = parser.parse_args()

    if args.dry_run:
        print("=" * 50)
        print("ドライランモード: 変更は行いません")
        print("=" * 50)

    # 認証ファイルの確認
    credentials_env = os.environ.get('GOOGLE_SHEETS_CREDENTIALS')
    credentials_path = Path(credentials_env).expanduser() if credentials_env else ROOT_DIR / 'credentials.json'
    if not credentials_path.exists():
        logger.error(f"認証ファイルが見つかりません: {credentials_path}")
        sys.exit(1)

    # スプレッドシート ID の確認
    spreadsheet_id = os.environ.get(TARGET_FILE_ID_ENV)
    if not spreadsheet_id:
        logger.error(f"環境変数 {TARGET_FILE_ID_ENV} が設定されていません")
        sys.exit(1)

    logger.info(f"対象スプレッドシート ID: {spreadsheet_id}")
    logger.info(f"移動先フォルダ ID: {args.target_folder_id}")

    # Drive サービス構築
    service = build_drive_service(credentials_path)

    # 移動先フォルダの存在確認とサービスアカウントのアクセス権確認
    logger.info("移動先フォルダを確認中...")
    try:
        folder_info = get_folder_info(service, args.target_folder_id)
        if folder_info.get('mimeType') != 'application/vnd.google-apps.folder':
            logger.error(f"指定した ID はフォルダではありません: {folder_info.get('mimeType')}")
            sys.exit(1)
        folder_name = folder_info.get('name', '不明')
        logger.info(f"移動先フォルダ確認済み: 「{folder_name}」（ID: {args.target_folder_id}）")
    except Exception as e:
        logger.error(f"移動先フォルダへのアクセスに失敗しました: {e}")
        logger.error("フォルダがサービスアカウントと共有されているか確認してください（編集者権限）")
        sys.exit(1)

    # 対象ファイルの情報取得
    logger.info("対象ファイルの情報を取得中...")
    file_info = get_file_info(service, spreadsheet_id)
    file_name = file_info.get('name', '不明')
    current_parents = file_info.get('parents', [])

    print(f"\n対象ファイル: 「{file_name}」")
    print(f"  ファイル ID: {spreadsheet_id}")
    print(f"  現在の親フォルダ ID: {current_parents or '（取得不可 - My Drive ルート）'}")
    print(f"\n移動先フォルダ: 「{folder_name}」")
    print(f"  フォルダ ID: {args.target_folder_id}")

    if args.dry_run:
        print(f"\n[ドライラン] 以下の操作が実行されます:")
        print(f"  1. 「{file_name}」を「{folder_name}」フォルダに移動")
        print(f"\n実際に実行するには --dry-run を外してください:")
        print(f"  SPREADSHEET_ID={spreadsheet_id} python scripts/migrate_drive_folder.py \\")
        print(f"    --target-folder-id {args.target_folder_id}")
        return

    # ファイルを移動
    move_file(service, spreadsheet_id, args.target_folder_id, current_parents, dry_run=False)

    # 移動後の確認
    logger.info("移動後の確認...")
    updated_info = get_file_info(service, spreadsheet_id)
    updated_parents = updated_info.get('parents', [])
    print(f"\n移動完了:")
    print(f"  ファイル名: 「{updated_info.get('name')}」")
    print(f"  ファイル ID: {spreadsheet_id}（変化なし ✓）")
    print(f"  新しい親フォルダ ID: {updated_parents}")
    print(f"\n✅ 既存スクリプトへの影響はありません（SPREADSHEET_ID は変わりません）")
    logger.info("Google Drive のフォルダ整理が完了しました")


if __name__ == '__main__':
    main()
