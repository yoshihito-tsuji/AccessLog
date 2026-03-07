# リリースダウンロード統計システム（運用停止済み）

> **⚠️ 運用停止済み（2026-03-07）**
> 自動収集・launchd定期実行は停止しました。
> このリポジトリは参考アーカイブとして保存しています。新たな自動収集・設定変更は行いません。

---

## 現在の運用

DL数確認は必要時に以下のコマンドで手動実行します。

```bash
# popup-releases のDL数確認（popup-releases作成後に使用）
gh api repos/yoshihito-tsuji/popup-releases/releases \
  | jq '.[] | {tag: .tag_name, downloads: [.assets[].download_count] | add}'

# GaQ_app のDL数確認
gh api repos/yoshihito-tsuji/GaQ_app/releases \
  | jq '.[] | {tag: .tag_name, downloads: [.assets[].download_count] | add}'
```

---

## 停止の経緯

- 2026-03-07: `Pop_app` の Private 化に伴い、配布先を `popup-releases` へ移行する方針が確定
- AccessLog を新 repo に対応させるコストより、手動確認への切替が合理的と判断
- `launchctl unload ~/Library/LaunchAgents/com.releases.download-tracker.plist` を実行済み
- Google Sheets / Apps Script / ダッシュボードは停止済み（データは残存）

---

## 旧システム概要（参考記録）

GaQ Transcriber（Mac/Windows）と PoPuP の GitHub Releases ダウンロード数を毎日収集し、Google Sheets と Web ダッシュボードで可視化するシステムでした。詳細は `docs/` を参照してください。

### 旧自動実行フロー（停止済み）

- launchd により毎日 23:59 に `scripts/track_downloads.sh` を実行
- GitHub API でダウンロード数取得 → CSV記録 → Google Sheets 自動アップロード
- ダッシュボードは `docs/index.html`（Chart.js）で可視化

### 旧主要ファイル（参考記録）

- `scripts/track_downloads.sh` : GitHub API から日次 CSV を生成
- `scripts/upload_to_sheets.py` : Google Sheets に CSV をアップロード
- `docs/index.html` : Chart.js ベースのダッシュボード
- `config/com.releases.download-tracker.plist` : launchd ジョブ定義（現在 unload 済み）
- `logs/tracker.log` / `logs/tracker_error.log` : 過去の自動実行ログ
- `data/daily/downloads_YYYY-MM-DD.csv` : 日別ダウンロードデータ（蓄積済み）
- `data/downloads_all.csv` : 全期間の累積データ

### 旧ドキュメント（参考記録）

詳細な設計・手順・履歴は `docs/` に分割されています（現在は参照専用）。

- `docs/overview.md` — 背景、システム構成、ファイル一覧
- `docs/setup.md` — Google Sheets/GCP/launchd のセットアップ手順
- `docs/operations.md` — 旧日常運用手順
- `docs/data-structure.md` — CSV/Sheets/Apps Script API のデータレイアウト
- `docs/maintenance.md` — リポジトリ追加・バックアップ手順
- `docs/history.md` — セットアップ以降の作業ログ
