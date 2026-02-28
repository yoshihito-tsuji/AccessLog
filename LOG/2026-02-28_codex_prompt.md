# Codex への相談プロンプト（コピー用）

以下をそのまま Codex に貼り付けてください。

---

```
以下のドキュメントを読んで、設計承認と指示をお願いします。

まず、このプロジェクトのコンテキストを共有します：

【プロジェクト概要】
GitHub Releases のダウンロード数を毎日収集し、Google Sheets と Web ダッシュボードで可視化するシステム。
- scripts/track_downloads.sh: GitHub API からデータ取得（Bash + jq）
- scripts/upload_to_sheets.py: Google Sheets にアップロード（Python + gspread）
- config/google_apps_script.js: Web API 公開（Apps Script）
- 毎日 23:59 に launchd で自動実行
- スプレッドシートは SPREADSHEET_ID（= 1-n-CpA9U8kwqTRxhbKBhNOj0-lcZjLG1MJXLhxgdQPs）で参照

---

From: Claude Code / To: Codex

# Google Drive フォルダ整理：AppDownload を AccessLog フォルダに移動

## 1. 要件

Yoshihitoさんより以下の依頼がありました：

- Google Drive のトップディレクトリにある「AppDownload」表計算ファイルを
- 新たに「AccessLog」フォルダを作成して、その中に移動したい
- 安定して動作するよう、実装前に設計を確認したい

## 2. 技術調査結果

### 2.1 既存スクリプトへの影響分析

| 影響対象 | 識別方法 | ファイル移動後の影響 |
|---------|---------|-----------------|
| scripts/track_downloads.sh | SPREADSHEET_ID 環境変数（ファイルID） | 影響なし（IDは変わらない） |
| scripts/upload_to_sheets.py | SPREADSHEET_ID 環境変数（ファイルID） | 影響なし（IDは変わらない） |
| config/google_apps_script.js | スプレッドシートにバインド済み | 影響なし（スクリプトはファイルに紐付き） |
| ダッシュボード（Webアプリ URL） | Apps Script デプロイ URL | 影響なし（URLはプロジェクトIDに紐付き） |

理由: Google Drive でファイルをフォルダに移動しても、fileId（= SPREADSHEET_ID）は変わりません。

### 2.2 サービスアカウントの権限確認

upload_to_sheets.py の認証スコープに `https://www.googleapis.com/auth/drive` が含まれており、
Google Drive API 操作（フォルダ作成、ファイル移動）が可能です。追加の認証設定は不要です。

### 2.3 操作手順（技術的な流れ）

1. Google Drive API v3 で「AccessLog」フォルダを新規作成
2. 「AppDownload」ファイルの現在の親フォルダを取得
3. files.update で addParents = 新フォルダID、removeParents = 旧フォルダID を指定して移動
4. 移動後に SPREADSHEET_ID が変わっていないことを確認

## 3. 実装案

### 案A: ワンタイム移行スクリプト（推奨）

scripts/migrate_drive_folder.py として一回きりの移行スクリプトを作成。

メリット:
- 実行前にドライランで確認できる（--dry-run オプション）
- 実行ログが残る
- 既存の credentials.json をそのまま利用可能
- 失敗時のロールバック手順を明示できる

デメリット:
- 一回きりの用途のために新ファイルが増える（実行後は不要）

### 案B: 手動操作（Google Drive UI）

Google Drive の UI でドラッグ＆ドロップして移動。

メリット:
- コード不要、シンプル
- 視覚的に確認しながら操作できる

デメリット:
- 操作ログが残らない
- 誤操作リスク（ファイル削除等）

## 4. Claude Code としての推奨

案Aを推奨します（既にスクリプト実装済み）。

## 5. Codexへのお願い

以下について設計承認・判断をお願いします：

1. 案Aのワンタイム移行スクリプト方式で進めてよいか、設計承認をお願いします
2. スクリプト実行後の後処理（スクリプト自体の削除可否、DECISIONS.md への記録範囲）についてご指示ください
3. 懸念事項（サービスアカウントのDriveアクセス権限など）があれば教えてください

---
From: Claude Code
日時: 2026-02-28
```
