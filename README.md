# リリースダウンロード統計システム

GaQ TranscriberとPoPuPのGitHub Releasesダウンロード数を自動追跡し、Google Sheetsに記録、Webダッシュボードで可視化するシステムです。

## 📋 目次

- [構築の経緯と目的](#構築の経緯と目的)
- [システム概要](#システム概要)
- [ファイル構成](#ファイル構成)
- [実装された機能](#実装された機能)
- [セットアップ手順](#セットアップ手順)
- [使用方法](#使用方法)
- [データ構造](#データ構造)
- [トラブルシューティング](#トラブルシューティング)
- [作業ログ](#作業ログ)

---

## 構築の経緯と目的

### 背景
- **日付**: 2025年11月13日
- **目的**: GitHub Releasesのダウンロード数を継続的に追跡し、アプリの人気度や使用状況を可視化する
- **対象アプリ**:
  - GaQ Transcriber (Mac版・Windows版)
  - PoPuP

### 実現したいこと
1. **自動データ収集**: 毎日決まった時刻にダウンロード数を自動取得
2. **データの永続化**: Google Sheetsに累積データを保存
3. **視覚的なダッシュボード**: グラフで推移を確認できるWebインターフェース
4. **バージョン別集計**: 各リリースバージョンごとのダウンロード数を追跡
5. **Mac/Windows分離**: GaQアプリをプラットフォーム別に集計

---

## システム概要

```
┌─────────────────────────────────────────────────────────────┐
│                     自動実行サイクル                          │
│  毎日 00:05 (ラジオ録音中の安定した起動時間帯)                │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  track_downloads.sh                                         │
│  - GitHub API経由でダウンロード数取得                         │
│  - CSVファイルに記録（日次 + 累積）                           │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  upload_to_sheets.py                                        │
│  - CSVデータをGoogle Sheetsにアップロード                     │
│  - サービスアカウント経由で認証                               │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  Google Sheets (DailyData)                                  │
│  - 累積データを永続保存                                       │
│  - 日付ごとに最新タイムスタンプのデータを保持                  │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  Google Apps Script (Web API)                               │
│  - Google Sheetsデータを読み取り                             │
│  - 累積値から日次増分を計算                                   │
│  - JSON形式でダッシュボードに提供                             │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│  dashboard.html                                             │
│  - Chart.jsで視覚的なグラフを表示                            │
│  - 期間選択: 7日/30日/90日/180日/365日                       │
│  - アプリ別・バージョン別の積層棒グラフ                        │
└─────────────────────────────────────────────────────────────┘
```

---

## 📁 ファイル構成

```
AccessLog/
├── track_downloads.sh          # ダウンロード数取得スクリプト（毎日00:05自動実行）
├── upload_to_sheets.py         # Google Sheetsアップロードスクリプト
├── dashboard.html              # Webダッシュボード（ブラウザで開く）
├── google_apps_script.js       # Google Apps Script（Web API）
├── credentials.json            # Google Cloud サービスアカウント認証情報
├── downloads_YYYY-MM-DD.csv    # 日次ログ（日付別）
├── downloads_all.csv           # 累積ログ（全データ）
├── tracker.log                 # 自動実行の標準出力ログ
├── tracker_error.log           # 自動実行のエラーログ
└── README.md                   # このファイル

~/Library/LaunchAgents/
└── com.releases.download-tracker.plist  # launchd自動実行設定
```

---

## 実装された機能

### 1. 自動データ収集
- **実行時刻**: 毎日00:05（ラジオ録音中で確実にMacが起動している時間帯）
- **対象リポジトリ**:
  - `yoshihito-tsuji/GaQ_app`
  - `yoshihito-tsuji/Pop_app`
- **収集データ**:
  - リリース名
  - タグ名
  - アセット名
  - ダウンロード数（累積値）
- **保存形式**: CSV（日次 + 累積）

### 2. Google Sheets連携
- **認証方式**: サービスアカウント（JSON鍵認証）
- **シート構成**:
  - `DailyData`: 生の累積データ
- **データ更新**: 毎日自動追記
- **重複対策**: 同一日付で最新タイムスタンプのデータのみ使用

### 3. Webダッシュボード
- **フレームワーク**: Chart.js 4.4.0
- **表示内容**:
  - アプリ別ダウンロード数カード（GaQ Mac, GaQ Windows, PoPuP, 合計）
  - バージョン別推移グラフ（積層棒グラフ）
- **期間選択**: 7日間、30日間、90日間、180日間、365日間
- **データソース**: Google Apps Script Web API経由でリアルタイム取得
- **デザイン**: 濃紺（Navy）テーマ、レスポンシブ対応

### 4. データ処理ロジック
- **累積値から増分計算**: GitHub APIが返す累積ダウンロード数から日次増分を算出
- **Mac/Windows分離**: タグ名とリリース名から自動判定
  - `v1.1.1-mac`, `macOS` → GaQ (Mac)
  - `windows-v1.1.1`, `Windows` → GaQ (Windows)
- **バージョン管理**: タグ名（`v1.2.0`など）でバージョンを識別

### 5. エラーハンドリング
- **GitHub API認証**: GitHub CLIを使用（`gh auth`）
- **ログ記録**: 標準出力とエラー出力を別ファイルに記録
- **フォールバック**: API取得失敗時はサンプルデータを表示（開発用）

---

## 🚀 セットアップ手順

### 1. Google Sheetsの準備

#### 1.1 スプレッドシート作成
1. [Google Sheets](https://sheets.google.com/)にアクセス
2. 新しいスプレッドシートを作成
3. スプレッドシートIDをメモ
   - URL: `https://docs.google.com/spreadsheets/d/【ここがID】/edit`
   - 本プロジェクトのID: `1-n-CpA9U8kwqTRxhbKBhNOj0-lcZjLG1MJXLhxgdQPs`

#### 1.2 シート作成
- シート名: `DailyData`（自動的に作成される）

#### 1.3 Google Apps Script設定
1. スプレッドシート上部メニュー: `拡張機能` > `Apps Script`
2. `google_apps_script.js`の内容を全てコピー&ペースト
3. `デプロイ` > `新しいデプロイ`
4. デプロイタイプ: `ウェブアプリ`
5. 設定:
   - 次のユーザーとして実行: **自分**
   - アクセスできるユーザー: **全員**
6. `デプロイ`をクリック
7. 表示されたURLをメモ（dashboard.htmlで使用）

**重要**: デプロイ後に`google_apps_script.js`を更新した場合：
- `デプロイ` > `デプロイを管理`
- 鉛筆マーク（編集）をクリック
- `バージョン` > `新バージョン`
- `デプロイ`（URLは変わらない）

### 2. Google Cloud Platform設定

#### 2.1 プロジェクト作成
1. [Google Cloud Console](https://console.cloud.google.com/)にアクセス
2. 新しいプロジェクトを作成（既存のものでも可）

#### 2.2 API有効化
1. `APIとサービス` > `ライブラリ`
2. 以下のAPIを検索して有効化:
   - `Google Sheets API`
   - `Google Drive API`

#### 2.3 サービスアカウント作成
1. `APIとサービス` > `認証情報`
2. `認証情報を作成` > `サービスアカウント`
3. サービスアカウント名: `releases-tracker`
4. `作成して続行` > `完了`

#### 2.4 認証キー作成
1. 作成したサービスアカウントをクリック
2. `キー` > `鍵を追加` > `新しい鍵を作成`
3. JSON形式を選択
4. ダウンロードされたJSONファイルを以下に配置:
   ```
   /Users/yoshihitotsuji/Claude_Code/AccessLog/credentials.json
   ```

#### 2.5 シート共有
1. `credentials.json`を開く
2. `client_email`の値をコピー（例: `releases-tracker@project-id.iam.gserviceaccount.com`）
3. Google Sheetsの`共有`ボタンをクリック
4. コピーしたメールアドレスを追加（**編集者**権限）

**重要**: Google Cloudは無料枠で利用可能。このプロジェクトでは課金は発生しません。

### 3. Python環境セットアップ

#### 3.1 パッケージインストール
```bash
pip install gspread oauth2client
```

#### 3.2 環境変数設定（オプション）
`~/.zshrc`または`~/.bash_profile`に追加（現在は不要、スクリプト内で直接指定）:

```bash
export SPREADSHEET_ID="1-n-CpA9U8kwqTRxhbKBhNOj0-lcZjLG1MJXLhxgdQPs"
export GOOGLE_SHEETS_CREDENTIALS="/Users/yoshihitotsuji/Claude_Code/AccessLog/credentials.json"
```

設定後:
```bash
source ~/.zshrc
```

### 4. 自動実行設定（launchd）

#### 4.1 plistファイル確認
ファイル: `~/Library/LaunchAgents/com.releases.download-tracker.plist`

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.releases.download-tracker</string>

    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>/Users/yoshihitotsuji/Claude_Code/AccessLog/track_downloads.sh</string>
    </array>

    <key>WorkingDirectory</key>
    <string>/Users/yoshihitotsuji/Claude_Code/AccessLog</string>

    <key>StandardOutPath</key>
    <string>/Users/yoshihitotsuji/Claude_Code/AccessLog/tracker.log</string>

    <key>StandardErrorPath</key>
    <string>/Users/yoshihitotsuji/Claude_Code/AccessLog/tracker_error.log</string>

    <!-- スケジュール設定: 毎日00:05に実行 -->
    <key>StartCalendarInterval</key>
    <dict>
        <key>Hour</key>
        <integer>0</integer>
        <key>Minute</key>
        <integer>5</integer>
    </dict>

    <key>RunAtLoad</key>
    <false/>

    <key>KeepAlive</key>
    <false/>
</dict>
</plist>
```

#### 4.2 launchd登録
```bash
launchctl load ~/Library/LaunchAgents/com.releases.download-tracker.plist
```

#### 4.3 登録確認
```bash
launchctl list | grep releases
# 出力: -	0	com.releases.download-tracker
```

#### 4.4 設定変更時の再読み込み
```bash
launchctl unload ~/Library/LaunchAgents/com.releases.download-tracker.plist
launchctl load ~/Library/LaunchAgents/com.releases.download-tracker.plist
```

**重要**:
- **実行時刻**: 毎日00:05（当初は23:55だったが、ラジオ録音中の安定した起動時間に変更）
- **Mac起動が必須**: スリープ状態では実行されない
- 00:00-00:10はラジオ録音で確実に起動中

### 5. ダッシュボード設定

#### 5.1 API URL設定
`dashboard.html`の226行目を編集:

```javascript
const API_URL = 'https://script.google.com/macros/s/AKfycbxZx9xCYNYVepuxRsPpWwd4k4zpuq1yivyC6P3nWEEnbYHaIyelOdgVAGvHhi7-rzYeYw/exec';
```

実際のGoogle Apps Script URLに置き換える。

#### 5.2 アクセス方法
```bash
# ファイルを直接開く
open /Users/yoshihitotsuji/Claude_Code/AccessLog/dashboard.html

# またはブラウザでブックマーク
file:///Users/yoshihitotsuji/Claude_Code/AccessLog/dashboard.html
```

---

## 📊 使用方法

### 日常的な使用

#### ダッシュボード表示
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

## 📈 データ構造

### CSVフォーマット

#### ヘッダー
```csv
記録日時,リポジトリ,リリース名,タグ,アセット名,ダウンロード数
```

#### データ例
```csv
"2025-11-13 16:36:04","GaQ","GaQ Transcriber v1.1.1 (macOS)","v1.1.1-mac","GaQ_Transcriber_v1.1.1_mac.dmg",4
"2025-11-13 16:36:04","GaQ","GaQ Transcriber v1.1.1 (macOS)","v1.1.1-mac","GaQ_Transcriber_v1.1.1_mac.dmg.sha256",0
"2025-11-13 16:36:04","GaQ","Windows v1.1.1","windows-v1.1.1","GaQ_Transcriber_Windows_v1.1.1_Portable.zip",0
"2025-11-13 16:36:04","PoPuP","PoPuP v1.2.0","v1.2.0","PoPuP_Portable_v1.2.0.zip",37
```

### Google Sheetsシート構成

#### DailyData
- **カラム**: 記録日時, リポジトリ, リリース名, タグ, アセット名, ダウンロード数
- **用途**: 累積データの生データ保存
- **データ処理**: Apps Scriptが日付ごとに最新タイムスタンプのレコードを選択

### Google Apps Script APIレスポンス

#### エンドポイント
```
GET https://script.google.com/macros/s/.../exec?type=timeline&days=30
```

#### レスポンス例（JSON）
```json
{
  "status": "success",
  "dates": ["2025-11-07", "2025-11-08", "...", "2025-11-13"],
  "apps": {
    "GaQ (Mac)": {
      "versions": {
        "v1.1.1-mac": [0, 0, 0, 0, 0, 0, 4]
      },
      "total": [0, 0, 0, 0, 0, 0, 4]
    },
    "GaQ (Windows)": {
      "versions": {
        "windows-v1.1.1": [0, 0, 0, 0, 0, 0, 0]
      },
      "total": [0, 0, 0, 0, 0, 0, 0]
    },
    "PoPuP": {
      "versions": {
        "v1.2.0": [0, 0, 0, 0, 0, 0, 37],
        "v1.1.0": [0, 0, 0, 0, 0, 0, 2],
        "v1.0.0": [0, 0, 0, 0, 0, 0, 1]
      },
      "total": [0, 0, 0, 0, 0, 0, 40]
    }
  }
}
```

**データの解釈**:
- `dates`: 指定期間の日付配列
- `versions`: バージョン別の日次増分配列
- `total`: 全バージョン合計の日次増分配列
- 累積値から前日との差分を計算して増分表示

---

## 🔧 トラブルシューティング

### 1. Google Sheets APIエラー

#### エラー内容
```
❌ Google Sheetsへのアップロードに失敗しました: APIError
```

#### 解決策
1. **サービスアカウントの共有確認**
   ```bash
   # credentials.jsonから確認
   cat /Users/yoshihitotsuji/Claude_Code/AccessLog/credentials.json | grep client_email
   ```
   このメールアドレスがGoogle Sheetsに**編集者**として追加されているか確認

2. **API有効化確認**
   - Google Cloud Console > APIとサービス > ライブラリ
   - `Google Sheets API` と `Google Drive API` が有効化されているか

3. **credentials.jsonパス確認**
   ```bash
   ls -la /Users/yoshihitotsuji/Claude_Code/AccessLog/credentials.json
   ```

### 2. gspreadライブラリが見つからない

#### エラー内容
```
⚠️  gspreadライブラリがインストールされていません
```

#### 解決策
```bash
pip install gspread oauth2client
```

### 3. launchdが実行されない

#### 確認方法
```bash
# 登録状態確認
launchctl list | grep releases

# ログファイル確認（次回実行予定後）
cat /Users/yoshihitotsuji/Claude_Code/AccessLog/tracker.log
cat /Users/yoshihitotsuji/Claude_Code/AccessLog/tracker_error.log
```

#### 原因と解決策
1. **Macがスリープ状態**
   - 00:05にMacが起動している必要がある
   - ラジオ録音（00:00-00:10）中なので通常は問題なし

2. **plist設定ミス**
   ```bash
   # plist再読み込み
   launchctl unload ~/Library/LaunchAgents/com.releases.download-tracker.plist
   launchctl load ~/Library/LaunchAgents/com.releases.download-tracker.plist
   ```

3. **スクリプトの実行権限**
   ```bash
   chmod +x /Users/yoshihitotsuji/Claude_Code/AccessLog/track_downloads.sh
   ```

### 4. ダッシュボードが表示されない

#### 確認ポイント
1. **API URLが正しいか**
   - `dashboard.html`の226行目を確認
   - Google Apps ScriptのデプロイURLと一致しているか

2. **ブラウザコンソール確認**
   - Command + Option + I でDevToolsを開く
   - Consoleタブでエラーメッセージを確認

3. **Google Apps Scriptエラー**
   - Apps Scriptエディタで「実行」をクリック
   - 実行ログでエラーを確認

### 5. データが0件

#### 原因
- Google Sheetsにデータがまだアップロードされていない

#### 解決策
```bash
# 手動実行でテスト
cd /Users/yoshihitotsuji/Claude_Code/AccessLog
bash track_downloads.sh
```

成功すると:
```
✅ ログファイルに記録しました
  - 日次ログ: downloads_2025-11-13.csv
  - 累積ログ: downloads_all.csv

✅ Google Sheetsにアップロードしました
```

### 6. GaQデータが表示されない

#### 過去の問題と解決
**問題**: 全データがPoPuPに分類される

**原因**: Google Apps Scriptのアプリ判定ロジックで、GaQのデータが処理されていなかった

**解決**: `google_apps_script.js`の165-176行目を修正
```javascript
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
```

**デプロイ更新**: v4として再デプロイ（URLは不変）

---

## 作業ログ

### 2025年11月13日 - システム構築

#### フェーズ1: 初期セットアップ（10:00-12:00）
1. **Google Cloud Platform設定**
   - プロジェクト作成
   - Google Sheets API / Google Drive API有効化
   - サービスアカウント `releases-tracker` 作成
   - JSON鍵ダウンロード → `credentials.json`に配置

2. **Google Sheets準備**
   - スプレッドシート作成（ID: `1-n-CpA9U8kwqTRxhbKBhNOj0-lcZjLG1MJXLhxgdQPs`）
   - `DailyData` シート作成
   - サービスアカウントに編集者権限付与

3. **Python環境構築**
   - `gspread` と `oauth2client` インストール
   - `upload_to_sheets.py` 実装
   - 環境変数設定（後に不要と判明）

#### フェーズ2: データ収集テスト（12:00-14:00）
1. **手動実行テスト**
   ```bash
   bash track_downloads.sh
   ```
   - 成功: 28レコードをCSVに記録

2. **Google Sheetsアップロードテスト**
   ```bash
   SPREADSHEET_ID="..." GOOGLE_SHEETS_CREDENTIALS="..." python3 upload_to_sheets.py
   ```
   - 成功: 28レコードをアップロード
   - 出力:
     ```
     GaQ: 16 downloads
     PoPuP: 160 downloads (v1.2.0: 148, v1.1.0: 8, v1.0.0: 4)
     ```

3. **データ重複問題発見**
   - 複数タイムスタンプ（10:15, 10:19, 15:57, 16:36）のデータが混在
   - 手動削除: 16:36以外のデータを削除（行2-22削除）

#### フェーズ3: Google Apps Script実装（14:00-16:00）
1. **初回実装**
   - `google_apps_script.js`が1行のみ（空ファイル状態）
   - 完全な実装を作成
   - デプロイ: v2

2. **データ分類問題**
   - **問題**: ダッシュボードで全データがPoPuPに分類
   - **原因**: 累積値→増分変換ロジックのバグ
   - **修正**: データ存在確認ロジックを改善
   - デプロイ: v3

3. **Mac/Windows分離ロジック実装**
   ```javascript
   if (repo === 'GaQ') {
     if (tag.includes('mac') || releaseName.includes('macOS')) {
       appName = 'GaQ (Mac)';
     } else if (tag.includes('windows') || releaseName.includes('Windows')) {
       appName = 'GaQ (Windows)';
     }
   }
   ```

4. **同日アセット合算処理**
   - 129-131行目: ダウンロード数を「設定」から「加算」に変更
   - 同じバージョンの複数アセット（.dmgと.sha256など）を正しく合計

5. **最終修正**
   - データが存在しない日の処理を改善
   - デプロイ: v4（最終版）

#### フェーズ4: ダッシュボード実装（16:00-17:00）
1. **dashboard.html作成**
   - Chart.js 4.4.0使用
   - 濃紺（Navy）テーマ適用
   - レスポンシブデザイン

2. **期間ボタン表記変更**
   - 「週」→「7日間」に統一
   - ボタン: 7日間、30日間、90日間、180日間、365日間

3. **グラフX軸調整**
   - 問題: 7日間表示でも30日分のラベルが表示
   - 修正: `autoSkip: true`, `maxTicksLimit: 15` 追加
   - 結果: 期間に応じて適切にラベルを間引き

4. **API URL設定**
   ```javascript
   const API_URL = 'https://script.google.com/macros/s/AKfycbxZx9xCYNYVepuxRsPpWwd4k4zpuq1yivyC6P3nWEEnbYHaIyelOdgVAGvHhi7-rzYeYw/exec';
   ```

#### フェーズ5: 自動実行設定（17:00-17:30）
1. **launchd plist作成**
   - 初期設定: 毎日23:55実行
   - ファイル: `~/Library/LaunchAgents/com.releases.download-tracker.plist`

2. **実行時刻変更**
   - 問題: 23:55はスリープ時間帯
   - 解決: 00:05に変更（ラジオ録音中で確実に起動）
   - 理由: 00:00-00:10にラジオ録音で自動起動

3. **launchd登録**
   ```bash
   launchctl load ~/Library/LaunchAgents/com.releases.download-tracker.plist
   ```
   - 確認: `launchctl list | grep releases`

#### 動作確認結果
- **データ収集**: ✅ 正常動作
- **Google Sheetsアップロード**: ✅ 正常動作
- **ダッシュボード表示**: ✅ 正常動作
  - GaQ (Mac): 4ダウンロード
  - GaQ (Windows): 0ダウンロード
  - PoPuP: 40ダウンロード
  - 合計: 44ダウンロード

#### 初回データ（2025-11-13 16:36:04時点）
- **GaQ Transcriber v1.1.1 (macOS)**:
  - GaQ_Transcriber_v1.1.1_mac.dmg: 4 DL
  - GaQ_Transcriber_v1.1.1_mac.dmg.sha256: 0 DL
- **GaQ Windows v1.1.1**:
  - GaQ_Transcriber_Windows_v1.1.1_Portable.zip: 0 DL
  - GaQ_Transcriber_Windows_v1.1.1_Setup.exe: 0 DL
- **PoPuP v1.2.0**:
  - PoPuP_Portable_v1.2.0.zip: 37 DL
- **PoPuP v1.1.0**:
  - PoPuP_v1.1.0_windows.zip: 2 DL
- **PoPuP v1.0.0**:
  - popup-v1.0.0.zip: 1 DL

---

## 📝 メンテナンス

### 新しいリポジトリを追加

`track_downloads.sh`の42-43行目を編集:

```bash
REPO_NAMES=("yoshihito-tsuji/GaQ_app" "yoshihito-tsuji/Pop_app" "yoshihito-tsuji/NEW_REPO")
REPO_DISPLAY_NAMES=("GaQ" "PoPuP" "NewApp")
```

**注意**: dashboard.htmlとgoogle_apps_script.jsも対応する修正が必要

### データのバックアップ

```bash
# すべてのCSVをバックアップ
cd /Users/yoshihitotsuji/Claude_Code/AccessLog
tar -czf backup_$(date +%Y%m%d).tar.gz downloads_*.csv

# Google Sheetsは自動的にバックアップされる（Googleドライブのバージョン履歴）
```

### Google Apps Scriptコード更新手順

1. Apps Scriptエディタでコード編集
2. 保存（Command + S）
3. `デプロイ` > `デプロイを管理`
4. 鉛筆マーク（編集）をクリック
5. `バージョン` > `新バージョン`
6. `デプロイ`

**重要**: URLは変わらないため、dashboard.htmlの変更は不要

### 実行時刻の変更

1. plistファイル編集:
   ```bash
   # 例: 毎日02:00に変更
   <key>Hour</key>
   <integer>2</integer>
   <key>Minute</key>
   <integer>0</integer>
   ```

2. launchd再読み込み:
   ```bash
   launchctl unload ~/Library/LaunchAgents/com.releases.download-tracker.plist
   launchctl load ~/Library/LaunchAgents/com.releases.download-tracker.plist
   ```

---

## 🎨 カスタマイズ

### ダッシュボードの色変更

`dashboard.html`の9-18行目（CSS変数）:

```css
:root {
    --navy: #1a365d;           /* メインカラー */
    --navy-light: #2c5282;     /* ライトバージョン */
    --navy-dark: #0f2642;      /* ダークバージョン */
    --gray-bg: #f7fafc;        /* 背景色 */
    --gray-light: #edf2f7;     /* ライトグレー */
    --text-primary: #2d3748;   /* テキスト（濃） */
    --text-secondary: #718096; /* テキスト（薄） */
}
```

### グラフの色変更

`dashboard.html`の229-250行目:

```javascript
const APP_COLOR_PALETTES = {
    'GaQ (Mac)': [
        { bg: 'rgba(26, 54, 93, 0.85)', border: 'rgba(26, 54, 93, 1)' },  // 濃紺
        // ... 他の色
    ],
    // ...
};
```

### グラフの種類変更

`dashboard.html`の391行目:

```javascript
type: 'bar',  // 'line', 'pie', 'doughnut'なども可能
```

---

## 📞 サポート・デバッグ

### ログファイル確認

```bash
# 標準出力ログ
cat /Users/yoshihitotsuji/Claude_Code/AccessLog/tracker.log

# エラーログ
cat /Users/yoshihitotsuji/Claude_Code/AccessLog/tracker_error.log
```

### launchd状態確認

```bash
# 登録状態
launchctl list | grep releases

# plist内容
cat ~/Library/LaunchAgents/com.releases.download-tracker.plist
```

### 環境変数確認

```bash
# 環境変数（オプション設定の場合）
env | grep SPREADSHEET
env | grep GOOGLE_SHEETS
```

### Google Sheets直接確認

スプレッドシートURL:
```
https://docs.google.com/spreadsheets/d/1-n-CpA9U8kwqTRxhbKBhNOj0-lcZjLG1MJXLhxgdQPs/edit
```

### API動作テスト（ブラウザコンソール）

```javascript
fetch('https://script.google.com/macros/s/AKfycbxZx9xCYNYVepuxRsPpWwd4k4zpuq1yivyC6P3nWEEnbYHaIyelOdgVAGvHhi7-rzYeYw/exec?type=timeline&days=7')
  .then(r => r.json())
  .then(data => {
    console.log('Status:', data.status);
    console.log('Dates count:', data.dates.length);
    console.log('First 5 dates:', data.dates.slice(0, 5));
    console.log('Last 5 dates:', data.dates.slice(-5));
  });
```

---

## 📜 ライセンス

このプロジェクトは個人利用のために作成されました。

---

## 🔗 関連リンク

- **Google Sheets**: [スプレッドシート](https://docs.google.com/spreadsheets/d/1-n-CpA9U8kwqTRxhbKBhNOj0-lcZjLG1MJXLhxgdQPs/edit)
- **Google Apps Script**: スプレッドシート > 拡張機能 > Apps Script
- **Google Cloud Console**: https://console.cloud.google.com/
- **GitHub CLI**: https://cli.github.com/
- **Chart.js**: https://www.chartjs.org/

---

**最終更新**: 2025年11月13日
**システムバージョン**: 1.0
**ステータス**: 本番稼働中 ✅
