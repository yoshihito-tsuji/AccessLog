# 決定事項（DECISIONS）

このファイルには、プロジェクトにおける重要な決定事項を記録します。

---

## 記録フォーマット

```markdown
### YYYY-MM-DD: [決定事項のタイトル]
- **決定者**: Yoshihitoさん / Codex / Claude Code
- **背景**: なぜこの決定が必要だったか
- **決定内容**: 何を決定したか
- **理由**: なぜその選択をしたか
- **影響範囲**: どのファイル/機能に影響するか
```

---

## 決定事項一覧

### 2025-12-25: Apps Script の日付処理改善
- **決定者**: Codex
- **背景**: launchd実行時刻を00:05→23:59に変更後、日次集計がダッシュボードで正しく反映されない問題が発生
- **決定内容**: `parseTimestamp()` 関数を追加し、タイムゾーン処理を堅牢化
- **理由**: `new Date()` による文字列解析がタイムゾーンに依存し不安定だったため
- **影響範囲**: `config/google_apps_script.js`

### 2025-12-18: launchd パス設定の修正
- **決定者**: Claude Code
- **背景**: 12/16以降、自動データ収集が失敗していた
- **決定内容**: plistファイルのパス設定を現環境に修正
- **理由**: 旧パス（/Users/ytsuji/dev/AccessLog）が残っていたため
- **影響範囲**: `config/com.releases.download-tracker.plist`

### 2025-12-17: データ取得時刻を23:59に変更
- **決定者**: Yoshihitoさん
- **背景**: GitHub APIの累積値を「その日の最終データ」として正確に記録したい
- **決定内容**: launchdスケジュールを00:05→23:59に変更
- **理由**: 翌日00:05取得だと「前日のデータ」として5分遅れになるため
- **影響範囲**: `config/com.releases.download-tracker.plist`

### 2025-11-17: track_downloads.sh に Google Sheets アップロードを統合
- **決定者**: Codex
- **背景**: データ取得とアップロードを手動で別々に実行する必要があった
- **決定内容**: `track_downloads.sh` 実行後に自動で `upload_to_sheets.py` を呼び出す
- **理由**: 完全自動化により運用負荷を削減
- **影響範囲**: `scripts/track_downloads.sh`

### 2026-01-04: Dev-Rules に基づく三者協働体制の導入
- **決定者**: Yoshihitoさん
- **背景**: プロジェクトの継続性と再現性を確保したい
- **決定内容**: `docs/team_ops/`、`LOG/`、`DECISIONS.md` を作成し、三者協働ルールを適用
- **理由**: Dev-Rulesの開発方法論を本プロジェクトにも適用するため
- **影響範囲**: プロジェクト全体の運用フロー

### 2026-01-04: track_downloads.sh の重複問題修正

- **決定者**: Codex
- **背景**:
  - draft/publishedリリースの二重処理で同じアセットが2回記録される問題
  - 同日複数回実行で累積CSVに重複データが追加される問題
- **決定内容**:
  1. jqクエリに `select(.draft == false and .prerelease == false)` を追加
  2. 日次CSVは毎回作り直し（上書き）
  3. 累積CSVは実行時に当日分を削除してから追記
  4. 総ダウンロード数計算のサブシェル問題を修正
- **理由**: データの一貫性と正確性を確保するため
- **影響範囲**: `scripts/track_downloads.sh`、`data/downloads_all.csv`
- **クリーンアップ実施**:
  - 1658行 → 1310行に削減
  - 2026-01-04: 217件 → 43件に正規化

### 2026-01-11: データフロー診断スクリプトの追加・改善

- **決定者**: Claude Code（Codex依頼）
- **背景**:
  - ダッシュボード表示（198）とローカルCSV（204）の不一致報告
  - データフロー全体の検証手段がなかった
- **決定内容**:
  1. `scripts/diagnose.sh` を追加
  2. 5ステップ検証: GitHub API → ローカルCSV → Google Sheets → Apps Script API → Dashboard
  3. `--verbose`オプションで詳細診断を出力
  4. 除外条件をApps Script / upload_to_sheets.py と統一（15パターン）
  5. Google Sheets DailyDataの直接実測を追加
- **理由**: 運用中の問題切り分けを迅速化するため
- **影響範囲**: `scripts/diagnose.sh`（新規・改善）

### 2026-01-11: ダッシュボード「合計」表示の仕様確認（再検証済み）

- **決定者**: Claude Code（Codex依頼による再検証）
- **背景**:
  - ダッシュボードの「合計ダウンロード数」が累積総数と異なる
- **再検証結果**:
  - GitHub API（2026-01-11時点）: **194 DL**（累積）
  - ローカルCSV（2026-01-10時点）: **192 DL**（累積、チェックサム除外後）
  - Google Sheets DailyData: **192 DL**（ローカルCSVと一致）
  - ダッシュボード表示: **198 DL**（365日間の日次増分合計）
- **結論**:
  - 各ステップ間のデータは**正常に同期**されている
  - 204と198の差は「チェックサムファイル（12 DL分）」の除外による
  - ダッシュボードは「期間内の増分合計」を正しく表示している
- **現状維持の理由**:
  - 「期間内の新規ダウンロード数」として設計通り
  - 累積総数はGitHub Releasesページで確認可能
- **影響範囲**: なし（仕様として確認のみ）
- **備考**: ユーザーへの説明が必要な場合は、ダッシュボードに注釈追加を検討

### 2026-02-28: Google Drive フォルダ整理（AppDownload → AccessLog フォルダ）

- **決定者**: Yoshihitoさん（Codex設計承認: 案A → 実施時に案B に変更）
- **背景**: Google Drive トップディレクトリの「AppDownload」スプレッドシートをフォルダ整理したい
- **決定内容**:
  1. Google Drive に「AccessLog」フォルダを手動作成（ID: `1GiCy6rRnnjTiruLiQevkLj4en574nnqu`）
  2. 「AppDownload」スプレッドシートを Google Drive UI で AccessLog フォルダに移動（2026-02-28 完了）
  3. サービスアカウントを AccessLog フォルダの編集者として共有
- **技術的根拠**: ファイル移動後も `SPREADSHEET_ID`（= `fileId`）は変わらないため、既存の `track_downloads.sh` / `upload_to_sheets.py` への影響なし
- **API での移動が不可だった理由**: サービスアカウントはファイルの「共有された編集者」に過ぎず、ユーザーの My Drive ルートフォルダへのアクセス権がないため `cannotAddParent (403)` エラー
- **影響範囲**: Google Drive のファイル配置のみ（コードの変更なし）
- **現在の状態**:
  - AppDownload の場所: `AccessLog` フォルダ内（親 ID: `1GiCy6rRnnjTiruLiQevkLj4en574nnqu`）
  - SPREADSHEET_ID: `1-n-CpA9U8kwqTRxhbKBhNOj0-lcZjLG1MJXLhxgdQPs`（変化なし）

### 2026-02-17: Apps Script 日次増分計算のベースライン初期化バグ修正

- **決定者**: Codex
- **背景**:
  - ダッシュボード（90日/180日/365日表示）で、データ記録開始日に異常なスパイクが表示される問題
  - 90日間表示で合計474DLと表示されるが、実際のDL増分はほぼ0
  - 原因: `getTimelineData()` の差分計算で `prevCount = 0` 初期化していたため、表示期間内の初回データ出現日に累積値全量が「日次増分」として計上
- **決定内容**:
  1. 表示期間開始日より前の最新累積値を「ベースライン」として取得
  2. 差分計算の初期値を `prevCount = baseline` に変更
  3. ベースラインが存在しないバージョン（新規）のみ `0` 開始
  4. セルフテスト関数 `testIncrementBaseline()` を追加（5ケース6テスト）
  5. `scripts/diagnose.sh` に初日スパイク検出チェックを追加（ステップ5/6）
- **理由**: 3案（A: ベースライン初期化、B: 初日0扱い、C: 表示期間制限）のうち、データ正確性と設計意図への忠実さでAを採用
- **影響範囲**: `config/google_apps_script.js`、`scripts/diagnose.sh`
- **反映手順**: Apps Scriptエディタでコードを更新後、`testIncrementBaseline()` を実行して全テスト通過を確認
