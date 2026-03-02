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

### 2026-03-02: 2/28スパイク修正・仮説A/B対応（allRowsByDate + MAX + normalizeKey）

- **決定者**: Claude Code（Codex Round 2 指示プロンプトに基づく）
- **背景**:
  - v1.2.0 デプロイ・cleanupDuplicateSpikeDates 実行後、2/28 に新たな +238 スパイクが出現
  - 仮説A: 全角/半角差異でタグキーが重複し、カウントが合算される
  - 仮説B: 23:59 より前の中間スナップショット（不完全）が最終値として採用され、翌日差分が水増しされる
- **決定内容**:
  1. `normalizeKey(value)` 関数を追加（NFKC正規化 + trim）— 仮説A 対応
  2. `getTimelineData()` を `allRowsByDate`（全TS収集） + MAX 選択方式に変更 — 仮説B 対応
  3. ベースライン計算も MAX 選択方式に統一
  4. `doGet()` に `?type=meta` ハンドラを追加（デプロイバージョン確認用）
  5. `inspectDailyDataSnapshots()` 診断関数を追加（仮説A/B の根本原因特定用）
  6. `testIncrementBaseline()` にケースG・H を追加（合計 12 テスト）
  7. バージョンを 1.2.0 → 1.3.0 に更新
- **理由**:
  - 仮説A/B いずれが真因でも同時対応できるロジックを採用
  - `allRowsByDate` + MAX 方式は、不完全スナップショットを完全スナップショットで上書きするため仮説B に対応
  - NFKC 正規化は同一バージョンの重複集計を防ぐため仮説A に対応
  - `inspectDailyDataSnapshots()` により、実際のデプロイ後に仮説A/B の採否を確定できる
- **影響範囲**: `config/google_apps_script.js`
- **反映手順**:
  1. Apps Script エディタで `config/google_apps_script.js` の内容を全て貼り付けて保存
  2. `curl "${API_URL}?type=meta"` で `scriptVersion: "1.3.0-2026-03-02"` を確認
  3. `inspectDailyDataSnapshots()` を実行して仮説A/B の採否を特定
  4. `testIncrementBaseline()` を実行して 12 テスト全通過を確認
  5. ダッシュボード 30 日間表示で 2/28 スパイクが解消されたことを確認
- **残リスク**: 仮説A/B の採否は `inspectDailyDataSnapshots()` 実行後に確定。万一いずれも否定された場合は新たな仮説Cの調査が必要

### 2026-03-02: 重複スパイク問題の修正（maxSeenCount導入）

- **決定者**: Claude Code（Codex指示プロンプトに基づく）
- **背景**:
  - ダッシュボード 30日間表示で +234 DL が 3 回計上（2/16・2/24・2/27）
  - PoPuP Win v1.2.0 が +78 × 3 = 234 DL と主張するが、GitHub API の PoPuP 合計は 145 DL → 数学的に不可能 → 二重計上が確定
  - 削除実験（2/23・2/26 行を手動削除）でスパイクが 1 日ずつ移動 → DailyData に複数日の同一累積スナップショットが存在と判明
  - `getTimelineData()` で `prevCount` が日付間で正しく引き継がれず、同一累積値を「新規増分」として計上するバグが疑われる
- **決定内容**:
  1. `getTimelineData()` に `maxSeenCount`（これまで見た最大累積値）を導入し、`effectivePrev = max(prevCount, maxSeenCount)` で増分計算
  2. `prevCount` がリセットされても `maxSeenCount` が過去最大を保持し、同一累積値の二重計上を防止
  3. Apps Script に `cleanupDuplicateSpikeDates()` 関数を追加（2/24・2/27 行の一括削除用）
  4. `testIncrementBaseline()` にケースF・F-2 を追加（重複スパイク防止の検証）
  5. バージョンを 1.1.0 → 1.2.0 に更新
- **理由**: `maxSeenCount` 方式は prevCount リセットの原因に依存せず効果を発揮し、正常データ（単調増加）への副作用もない
- **影響範囲**: `config/google_apps_script.js`
- **反映手順**:
  1. Apps Script エディタで `config/google_apps_script.js` の内容を全て貼り付けて保存
  2. `testIncrementBaseline()` を実行して 10 テスト全通過を確認
  3. `cleanupDuplicateSpikeDates()` を実行して 2/24・2/27 の行を削除
  4. ダッシュボード 30 日間表示で +234 スパイクが解消されたことを確認
- **残リスク**: prevCount リセットの根本原因（DailyData のデータ構造の詳細）は未解明。直接 Sheets アクセスがある環境での実査を推奨

### 2026-03-02: upload_to_sheets.py 二重実行防止・フィルタ修正（Round 3）

- **決定者**: Claude Code（Codex Round 3 指示プロンプトに基づく）
- **背景**:
  - `inspectDailyDataSnapshots()` により 2/16・2/28・3/1 の DailyData 行数が 86 = 43 × 2 と確認
  - 根本原因: `upload_to_sheets.py` の二重実行（launchd `StartCalendarInterval` がスリープ/ウェイク時に同一ジョブを二重発火）
  - 二次原因: `_filter_rows_by_date` が gspread の Date 型セル `'YYYY/M/D H:MM:SS'` に対して `cell.startswith('YYYY-MM-DD')` でマッチ失敗 → 削除されずに 43 行が二重 append
  - ログ二重記録: `logging.FileHandler`（直接書き込み）+ `logging.StreamHandler`（stderr → launchd `StandardErrorPath` が同一ファイルに書き込み）の競合
- **決定内容**:
  1. `scripts/track_downloads.sh` に PID ロックファイル排他制御を追加（`logs/.track_downloads.lock`）
     - 実行中プロセスが存在する場合は即終了 + エラーログ出力
     - `trap` で EXIT/INT/TERM 時にロックファイルを自動削除
  2. `scripts/upload_to_sheets.py` の `logging.basicConfig` から `FileHandler` を除去（`StreamHandler` のみに変更）
  3. `scripts/upload_to_sheets.py` の `_filter_rows_by_date` を `'YYYY/M/D H:MM:SS'` 形式にも対応
     - `datetime.strptime` で `target_date` を slash 形式（`'YYYY/M/D'`）に変換してプレフィックス比較
  4. `scripts/upload_to_sheets.py` の `main()` に `run_id`（uuid8桁）と `pid` のログ出力を追加
  5. `scripts/upload_to_sheets.py` に DailyData 書き込み後の行数検証を追加（期待値不一致でエラー）
- **理由**:
  - PID ロック: macOS で `flock` が非対応のため PID ファイル方式を採用。第2プロセスが起動時点で検出・終了
  - `StreamHandler` のみ: launchd の `StandardErrorPath` が stderr をキャプチャするため FileHandler は不要
  - `_filter_rows_by_date` 修正: 両フォーマット対応により Sheets のセル型変換に依存しなくなる
  - 行数検証: 書き込み後に実際の行数を確認することで、将来の二重 append を検出可能
- **影響範囲**: `scripts/track_downloads.sh`、`scripts/upload_to_sheets.py`
- **反映手順**: 次回 23:59 の launchd 実行から自動的に有効（plist 変更・再登録不要）
- **残リスク**: launchd が二重発火する根本トリガー（スリープ/ウェイクのタイミング）は OS レベルのため未解決。PID ロックにより実害は防止される

### 2026-03-02: 日付フィルタ最終強化・noclobber 排他制御（Round 4）

- **決定者**: Claude Code（Codex Round 4 指示プロンプトに基づく）
- **背景**:
  - `_filter_rows_by_date` が `YYYY/MM/DD`（ゼロ埋めあり）に未対応のリスクが残存
  - PID ロックファイルの作成に TOCTOU 窓（`-f` 確認 → `>` 書き込み）が存在
- **決定内容**:
  1. `_extract_date_str(cell_str)` 関数を追加（`YYYY-MM-DD` / `YYYY/M/D` / `YYYY/MM/DD` を全て `YYYY-MM-DD` に正規化）
  2. `_filter_rows_by_date()` を文字列プレフィックス比較から `_extract_date_str()` による日付一致判定に全面変更
  3. `_test_filter_rows_by_date()` 単体テスト関数を追加（9ケース、`--test` 引数で実行可能）
  4. `track_downloads.sh` のロック作成を `( set -o noclobber; echo $$ > "${LOCK_FILE}" )` に変更（`O_CREAT|O_EXCL` 相当で原子的）
- **理由**: フォーマット正規化によりメンテナンス負担を削減、noclobber で TOCTOU 窓を実質閉鎖
- **影響範囲**: `scripts/upload_to_sheets.py`、`scripts/track_downloads.sh`
- **テスト結果**: `python3 scripts/upload_to_sheets.py --test` → 9/9 PASS
- **残リスク**: stale ロック上書き時の TOCTOU は残存するが、stale は稀かつ実害なし
