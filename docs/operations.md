# 運用・操作手順

日常的な利用方法と手動実行のメモをまとめています。

## 📊 使用方法

### 日常的な使用

#### ダッシュボード表示

**方法1: GitHub Pages（推奨）**

どこからでもアクセス可能なWeb版ダッシュボード:

```
URL: https://yoshihito-tsuji.github.io/AccessLog/
```

1. URLにアクセス
2. パスワードを入力（デフォルト: `AccessLog20251114`）
3. ダッシュボードが表示される

**アクセス可能デバイス**:
- iPhone / iPad
- Mac / Windows PC
- その他スマートフォン・タブレット

**パスワード変更方法**:
- [docs/index.html](docs/index.html)の11行目 `ACCESS_PASSWORD` を編集
- 変更後、GitHubにpushすると反映（数分後）

**方法2: ローカルファイル（従来方式）**

```bash
open /Users/yoshihitotsuji/Claude_Code/AccessLog/dashboard.html
```

- **自動更新**: ページを開くたびに最新のGoogle Sheetsデータを取得
- **期間選択**: 7日間、30日間、90日間、180日間、365日間ボタンで切り替え
- **表示内容**:
  - GaQ (Mac) ダウンロード数
  - GaQ (Windows) ダウンロード数
  - PoPuP ダウンロード数
  - 合計ダウンロード数
  - バージョン別推移グラフ（3つ）

### 手動実行（テスト・確認用）

#### データ取得のみ
```bash
cd /Users/yoshihitotsuji/Claude_Code/AccessLog
bash track_downloads.sh
```

#### Google Sheetsアップロードのみ
```bash
cd /Users/yoshihitotsuji/Claude_Code/AccessLog
SPREADSHEET_ID="1-n-CpA9U8kwqTRxhbKBhNOj0-lcZjLG1MJXLhxgdQPs" \
GOOGLE_SHEETS_CREDENTIALS="/Users/yoshihitotsuji/Claude_Code/AccessLog/credentials.json" \
python3 upload_to_sheets.py
```

#### 完全実行（データ取得 + アップロード）
```bash
cd /Users/yoshihitotsuji/Claude_Code/AccessLog
bash track_downloads.sh
```

### 動作確認

#### 自動実行ログ確認
```bash
# 標準出力ログ
cat /Users/yoshihitotsuji/Claude_Code/AccessLog/tracker.log

# エラーログ
cat /Users/yoshihitotsuji/Claude_Code/AccessLog/tracker_error.log

# 最新5件のCSVファイル
ls -lt /Users/yoshihitotsuji/Claude_Code/AccessLog/downloads_*.csv | head -5
```

#### launchd状態確認
```bash
# 登録状態確認
launchctl list | grep releases

# plist内容確認
cat ~/Library/LaunchAgents/com.releases.download-tracker.plist
```

#### Google Sheetsデータ確認
```bash
# Python経由で確認
SPREADSHEET_ID="1-n-CpA9U8kwqTRxhbKBhNOj0-lcZjLG1MJXLhxgdQPs" \
GOOGLE_SHEETS_CREDENTIALS="/Users/yoshihitotsuji/Claude_Code/AccessLog/credentials.json" \
python3 -c "
import gspread
from oauth2client.service_account import ServiceAccountCredentials
import os

scope = ['https://spreadsheets.google.com/feeds', 'https://www.googleapis.com/auth/drive']
creds = ServiceAccountCredentials.from_json_keyfile_name(os.environ['GOOGLE_SHEETS_CREDENTIALS'], scope)
client = gspread.authorize(creds)

sheet = client.open_by_key(os.environ['SPREADSHEET_ID'])
worksheet = sheet.worksheet('DailyData')

data = worksheet.get_all_values()[:10]
for i, row in enumerate(data, 1):
    print(f'{i}: {row}')
"
```

---
