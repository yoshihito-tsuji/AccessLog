# リリースダウンロード統計システム

GaQ Transcriber（Mac/Windows）と PoPuP の GitHub Releases ダウンロード数を毎日収集し、Google Sheets と Web ダッシュボードで可視化するための最小構成をまとめています。詳細仕様や長文ガイドは `docs/` に分割しました。

---

## 🚨 重要：AI担当者への最優先指示

**このREADME.mdを最初から最後まで必ず精読してください。**

### 🤖 AI起動時の自動読み込み指示

**あなた（AI）がこのREADME.mdを読んだら、必ず以下を実行してください：**

#### Claude Code（実装担当）の場合

1. 次に `docs/team_ops/claude_code_role.md` を読んでください
2. その後、そのファイルに記載された起動手順に従ってください

#### Codex（設計担当）の場合

1. 次に `docs/team_ops/codex_role.md` を読んでください
2. その後、そのファイルに記載された起動手順に従ってください

**重要**: 役割定義ファイルを読んだ後、そこに記載された手順（DECISIONS.md、LOGの確認等）を必ず実行してください。

### 📋 AI起動時の必須手順（概要）

1. **README.md精読** → プロジェクト全体像を把握
2. **役割定義確認** → `docs/team_ops/codex_role.md` または `claude_code_role.md` を確認
3. **LOG確認** → `LOG/YYYY-MM-DD.md` で当日の作業状況を確認
4. **DECISIONS確認** → `DECISIONS.md` で重要な決定事項を確認
5. **From/To形式で応答開始** → 必ず「From: [あなたの名前] / To: [受信者名]」形式で開始

### ⚠️ 禁止事項

- README.mdを読まずに作業を開始すること
- 三者協働ルールを無視して単独で判断すること
- From/To形式を使わずに応答すること
- ログや決定事項を記録せずに作業を進めること
- **日本語以外の言語（英語等）で応答・ドキュメント・コメントを記述すること**

**開発方法論の詳細**: [Dev-Rules](https://github.com/yoshihito-tsuji/Dev-Rules) を参照してください。

---

## 目的 / ゴール
- GitHub API から各アセットの累積ダウンロード数を取得し、日次差分として記録する
- Google Sheets (`DailyData`) に最新データを反映し、Apps Script から JSON API を公開する
- `docs/index.html` で主要アプリ・バージョン別の推移を 1 ページで確認できるようにする

## 運用のキモ
### 自動実行（デフォルト）
- `config/com.releases.download-tracker.plist` を `~/Library/LaunchAgents` に配置し、`launchctl load ~/Library/LaunchAgents/com.releases.download-tracker.plist` で登録
- 毎日 23:59 に `scripts/track_downloads.sh` が実行され、**GitHub API取得 → CSV記録 → Google Sheets自動アップロード**まで完全自動化（2025-11-17改善、2025-12-17に23:59へ変更）
  - **変更理由**: GitHub APIの累積値を「その日の最終データ」として正確に記録するため、翌日00:05ではなく当日23:59に取得
- 実行結果は `logs/tracker.log` / `logs/tracker_error.log` に追記される
- 再登録したい場合は `bash scripts/setup_launchd.sh` で plist を再生成 → load するだけでOK
  - **重要**: plistファイルは `config/` が正。変更後は必ず `setup_launchd.sh` を実行してLaunchAgents側に反映すること

### 手動更新フロー（テストや即時反映用）
1. `bash scripts/track_downloads.sh` を実行（データ取得からGoogle Sheetsアップロードまで一括実行）
2. ダッシュボードは `open docs/index.html` またはホストしている URL を開いて確認

**注意：** 2025-11-17以降、`track_downloads.sh`がGoogle Sheetsアップロードを自動実行するため、個別に`upload_to_sheets.py`を実行する必要はありません。

### アセット命名規則（ダウンロード集計の判定基準）
Apps Script 側の判定はアセット名のヒントに依存します。将来の誤判定を防ぐため、以下の命名規則を推奨します（`config/google_apps_script.js` 参照）。

- Windows 版 ZIP/EXE は `windows` または `win32` / `win64` / `portable` を含める
- Mac 版は `mac` / `macos` を含めるか `.dmg` とする
- 署名・チェックサムは拡張子で除外されるため、上記のヒントを含めない

**レガシー例外:** `PoPuP` の `popup-v1.0.0.zip` は過去の命名で OS ヒントがないため、Windows として集計する例外を入れています。

### すぐ確認したいときのコマンド
- ログ: `tail -n 50 logs/tracker.log` / `tail -n 50 logs/tracker_error.log`
- launchd 状態: `launchctl list | grep com.releases.download-tracker`
- 直近の CSV: `ls -t data/daily/downloads_*.csv | head -n 5`
- 統合CSV: `tail -n 20 data/downloads_all.csv`

## 主要ファイル
- `scripts/track_downloads.sh` : GitHub API から日次 CSV を生成
- `scripts/upload_to_sheets.py` : 認証情報 (`credentials.json`) と `SPREADSHEET_ID` で Sheets を更新
- `docs/index.html` : Chart.js ベースのダッシュボード（GitHub Pages公開版）
- `config/com.releases.download-tracker.plist` : launchd ジョブ定義
- `logs/tracker.log` / `logs/tracker_error.log` : 自動実行ログ
- `data/daily/downloads_YYYY-MM-DD.csv` : 日別ダウンロードデータ
- `data/downloads_all.csv` : 全期間の累積データ（Apps Script やバックアップのソース）

## Google Apps Script の日付処理改善（2025-12-25）

### 背景

launchd実行時刻を00:05→23:59に変更後、日次集計がWebダッシュボードで正しく反映されない問題が発生しました。原因は Apps Script 側で "YYYY-MM-DD HH:MM:SS" 形式の文字列を `new Date()` で解釈する際のタイムゾーン処理が不安定だったためです。

### 実装した修正

`config/google_apps_script.js` に以下の改善を実施:

1. **parseTimestamp() 関数の追加**
   - "YYYY-MM-DD HH:MM:SS" 形式を正規表現でパースし、手動で `new Date(year, month-1, day, hour, min, sec)` を生成
   - すでに Date 型の値はそのまま返す
   - JST（Asia/Tokyo）タイムゾーンを前提とした堅牢な解析

2. **既存ロジックの置き換え**
   - 84-95行目の分岐処理を `parseTimestamp()` に統一
   - `formatDate()` にも統一的に Date オブジェクトを渡すよう修正

3. **normalizeDailyDataTimestamps() 関数の追加**
   - 既存の DailyData シートで文字列として保存されている記録日時を Date 型に一括変換
   - 手動で1回だけ実行するワンショット関数
   - 実行後は全データが DateTime 型で統一される
   - **一括更新で高速化済み**: setValues() を使ったバッチ処理で大量データでも高速に動作
   - **Invalid Date はスキップ**: 無効な日付はログに記録され、元の値を維持

### 実行手順

1. Google Apps Script エディタを開く
2. `config/google_apps_script.js` の内容を全てコピー
3. Apps Script プロジェクトに貼り付けて保存
4. `normalizeDailyDataTimestamps` 関数を選択して「実行」ボタンをクリック
5. 初回は権限承認が必要（承認後に再実行）
6. ログで変換件数を確認（例: "✅ 変換完了: 1234件を変換しました"）

### 期待される効果

- 23:59実行後も日次データが正しくグラフに反映される
- タイムゾーンのずれによる日付誤認識が解消される
- 将来的なデータの一貫性が保たれる

## ドキュメントガイド
詳細チュートリアルや作業ログは `docs/` に移動しました。必要なトピックだけ参照できます。

- **[Dev-Rules](https://github.com/yoshihito-tsuji/Dev-Rules)** — 三者協働開発方法論アーカイブ（全プロジェクト共通）
- `docs/overview.md` — 背景、システム構成、ファイル一覧、実装機能
- `docs/collaboration.md` — 三者協働開発ルールとコミュニケーション原則（プロジェクト固有）
- `docs/setup.md` — Google Sheets/GCP/launchd までのセットアップ手順
- `docs/operations.md` — 日常運用・手動実行・確認方法の詳細
- `docs/data-structure.md` — CSV/Google Sheets/Apps Script API のデータレイアウト
- `docs/troubleshooting.md` — よくあるエラーと復旧手順
- `docs/maintenance.md` — リポジトリ追加やバックアップなどの長期運用メモ
- `docs/customization.md` — ダッシュボードのテーマ・グラフ変更方法
- `docs/support.md` — ログ/環境変数/API テストなどのデバッグ Tips
- `docs/history.md` — セットアップ以降の詳細な作業ログ
- `docs/legal-and-links.md` — ライセンスと関連リンク集

README では今後も最小限の運用情報のみを記載し、詳細や履歴は `docs/` を参照する運用にします。
