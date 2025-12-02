# リリースダウンロード統計システム

GaQ Transcriber（Mac/Windows）と PoPuP の GitHub Releases ダウンロード数を毎日収集し、Google Sheets と Web ダッシュボードで可視化するための最小構成をまとめています。詳細仕様や長文ガイドは `docs/` に分割しました。

## 目的 / ゴール
- GitHub API から各アセットの累積ダウンロード数を取得し、日次差分として記録する
- Google Sheets (`DailyData`) に最新データを反映し、Apps Script から JSON API を公開する
- `dashboard.html` で主要アプリ・バージョン別の推移を 1 ページで確認できるようにする

## 運用のキモ
### 自動実行（デフォルト）
- `com.releases.download-tracker.plist` を `~/Library/LaunchAgents` に配置し、`launchctl load ~/Library/LaunchAgents/com.releases.download-tracker.plist` で登録
- 毎日 00:05 に `track_downloads.sh` が実行され、**GitHub API取得 → CSV記録 → Google Sheets自動アップロード**まで完全自動化（2025-11-17改善）
- 実行結果は `tracker.log` / `tracker_error.log` に追記される
- 再登録したい場合は `bash scripts/setup_launchd.sh` で plist を再生成 → load するだけでOK

### 手動更新フロー（テストや即時反映用）
1. `bash track_downloads.sh` を実行（データ取得からGoogle Sheetsアップロードまで一括実行）
2. ダッシュボードは `open dashboard.html` またはホストしている URL を開いて確認

**注意：** 2025-11-17以降、`track_downloads.sh`がGoogle Sheetsアップロードを自動実行するため、個別に`upload_to_sheets.py`を実行する必要はありません。

### すぐ確認したいときのコマンド
- ログ: `tail -n 50 tracker.log` / `tail -n 50 tracker_error.log`
- launchd 状態: `launchctl list | grep com.releases.download-tracker`
- 直近の CSV: `ls -t data/daily/downloads_*.csv | head -n 5`
- 統合CSV: `tail -n 20 data/downloads_all.csv`

## 主要ファイル
- `track_downloads.sh` : GitHub API から日次 CSV を生成
- `upload_to_sheets.py` : 認証情報 (`credentials.json`) と `SPREADSHEET_ID` で Sheets を更新
- `docs/index.html` : Chart.js ベースのダッシュボード（GitHub Pages公開版）
- `com.releases.download-tracker.plist` : launchd ジョブ定義
- `tracker.log` / `tracker_error.log` : 自動実行ログ
- `data/daily/downloads_YYYY-MM-DD.csv` : 日別ダウンロードデータ
- `data/downloads_all.csv` : 全期間の累積データ（Apps Script やバックアップのソース）

## ドキュメントガイド
詳細チュートリアルや作業ログは `docs/` に移動しました。必要なトピックだけ参照できます。

- `docs/overview.md` — 背景、システム構成、ファイル一覧、実装機能
- `docs/collaboration.md` — 三者協働開発ルールとコミュニケーション原則
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
