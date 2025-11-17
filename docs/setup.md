# セットアップ手順

Google Sheets や GCP 設定から launchd まで、初期セットアップに必要な手順を一括で参照できます。

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

#### 4.1 自動セットアップスクリプト（推奨）

**簡単な方法**: セットアップスクリプトを使用

```bash
bash scripts/setup_launchd.sh
```

このスクリプトは以下を自動的に実行します:
1. Git管理下の`com.releases.download-tracker.plist`を`~/Library/LaunchAgents/`にコピー
2. 既存の登録があればアンロード
3. launchdへロード
4. 即座にkickstart（動作確認）
5. 登録状態の確認

**注意**: plistファイルはリポジトリ直下の`com.releases.download-tracker.plist`がソースオブトゥルース（信頼できる唯一の情報源）です。`~/Library/LaunchAgents/`配下のファイルは、このファイルをコピーして使用します。

#### 4.2 手動セットアップ（詳細な制御が必要な場合）

**plistファイルのコピー**:
```bash
cp com.releases.download-tracker.plist ~/Library/LaunchAgents/
```

**launchd登録**:
```bash
launchctl load ~/Library/LaunchAgents/com.releases.download-tracker.plist
```

**登録確認**:
```bash
launchctl list | grep releases
# 出力: -	0	com.releases.download-tracker
```

**設定変更時の再読み込み**:
```bash
launchctl unload ~/Library/LaunchAgents/com.releases.download-tracker.plist
launchctl load ~/Library/LaunchAgents/com.releases.download-tracker.plist
```

または、`scripts/setup_launchd.sh`を再実行するだけでも可。

#### 4.3 plist設定内容

Git管理下のファイル: `com.releases.download-tracker.plist`

主要設定:
- **実行スケジュール**: 毎日00:05
- **環境変数**: `PATH=/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin`（Homebrewコマンド利用のため）
- **ログ出力**: tracker.log（標準出力）、tracker_error.log（エラー出力）

**重要**:
- **実行時刻**: 毎日00:05（当初は23:55だったが、ラジオ録音中の安定した起動時間に変更）
- **Mac起動が必須**: スリープ状態では実行されない
- 00:00-00:10はラジオ録音で確実に起動中

### 5. ダッシュボード設定（GitHub Pages公開）

#### 5.1 GitHub Pages有効化

1. **GitHubリポジトリページにアクセス**
   ```
   https://github.com/yoshihito-tsuji/AccessLog
   ```

2. **Settings > Pages**
   - 左メニューから「Pages」を選択

3. **Source設定**
   - Source: **Deploy from a branch**
   - Branch: **main**
   - Folder: **/docs**
   - 「Save」をクリック

4. **公開URL確認**
   - 数分後、以下のURLで公開される:
     ```
     https://yoshihito-tsuji.github.io/AccessLog/
     ```

5. **動作確認**
   - URLにアクセス
   - パスワード入力プロンプトが表示される
   - `AccessLog20251114` を入力
   - ダッシュボードが正常に表示されることを確認

#### 5.2 パスワード変更（オプション）

**注意**: パスワードはJavaScriptで平文保存されます。高度なセキュリティは提供しません。

1. [docs/index.html](docs/index.html) を編集
2. 11行目の `ACCESS_PASSWORD` を変更:
   ```javascript
   const ACCESS_PASSWORD = 'YourNewPassword2025';
   ```
3. 変更をGitHubにpush
4. 数分後にGitHub Pagesに反映

#### 5.3 ローカルでの動作確認（オプション）

GitHub Pagesへのpush前にローカルでテスト:

```bash
cd /Users/yoshihitotsuji/Claude_Code/AccessLog/docs
python3 -m http.server 8080
# ブラウザで http://localhost:8080/ を開く
```

#### 5.4 API URL設定（初回のみ）

`docs/index.html`の16行目を確認:

```javascript
const API_URL = 'https://script.google.com/macros/s/AKfycbxZx9xCYNYVepuxRsPpWwd4k4zpuq1yivyC6P3nWEEnbYHaIyelOdgVAGvHhi7-rzYeYw/exec';
```

実際のGoogle Apps Script URLに置き換える（既に設定済み）。

#### 5.5 従来のローカルアクセス方法

GitHub Pagesを使わず、ローカルでHTMLファイルを開く場合:

```bash
# ファイルを直接開く
open /Users/yoshihitotsuji/Claude_Code/AccessLog/dashboard.html

# またはブラウザでブックマーク
file:///Users/yoshihitotsuji/Claude_Code/AccessLog/dashboard.html
```

---
