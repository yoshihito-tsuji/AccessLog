# 作業ログ

構築以降の詳細な作業ログを保管します。

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

### 2025年11月14日 - PATH問題修正

#### 問題発見
- **症状**: ダッシュボードが11/13時点で止まっている
- **原因**: launchd環境で `gh` と `jq` コマンドが見つからず、`track_downloads.sh` が即終了
- **根本原因**: launchd環境では `/opt/homebrew/bin` や `/usr/local/bin` がPATHに含まれていない

#### 切り分け検証
```bash
# PATH制限環境でテスト実行
PATH=/usr/bin:/bin:/usr/sbin:/sbin bash track_downloads.sh
# 結果: "GitHub CLI (gh) がインストールされていません" エラーで終了
```

#### 恒久対策実施
1. **track_downloads.sh修正**
   - 冒頭（`set -e`の直後）に以下を追加:
     ```bash
     export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
     ```
   - 構文チェック: `bash -n track_downloads.sh` → OK

2. **動作確認**
   - 手動実行: CSV生成成功（downloads_2025-11-14.csv）
   - launchd再読み込み: `launchctl unload && launchctl load`
   - 即時実行: `launchctl kickstart -k gui/$(id -u)/com.releases.download-tracker`
   - tracker.log: 正常なログ記録を確認
   - tracker_error.log: エラーなし（空）
   - Google Sheets: 2025-11-14データ追加確認（総行数 43→57行）

3. **ドキュメント更新**
   - README.mdトラブルシューティングに「launchd環境でHomebrewコマンドが見つからない」を追加
   - 作業ログに今回の修正内容を記録

#### 検証結果
- ✅ PATH問題解決
- ✅ launchd経由での自動実行正常化
- ✅ Google Sheetsへのデータアップロード確認
- ✅ システム本番稼働復旧

### 2025年11月14日 - GitHub Pages公開対応

#### 実装内容

**目的**: どこからでもアクセス可能なWeb版ダッシュボードを公開

**1. ディレクトリ構成変更**
- `docs/` ディレクトリ作成
- `dashboard.html` → `docs/index.html` に移設
- パスワード保護機能を追加

**2. 簡易パスワード保護実装**
- **パスワード**: `AccessLog20251114`（変更可能）
- **実装方法**: JavaScriptによるsessionStorage認証
- **動作**:
  1. ページアクセス時にプロンプト表示
  2. 正しいパスワード入力でダッシュボード表示
  3. セッション中は再入力不要
  4. 不正なパスワードでアクセス拒否画面

**3. セキュリティ考慮事項**
- パスワードはJavaScriptソースに平文保存（高度なセキュリティは提供しない）
- ダウンロード数データは元々GitHub上で公開情報
- Google Apps Script APIは読み取り専用
- 秘匿情報（credentials.json）は.gitignore済み

**4. GitHub Pages設定手順**

Yoshihitoさんが実施する手順:
1. GitHubリポジトリ > Settings > Pages
2. Source: **Deploy from a branch**
3. Branch: **main**, Folder: **/docs**
4. Save

公開URL: `https://yoshihito-tsuji.github.io/AccessLog/`

**5. ローカル動作確認**
```bash
cd docs
python3 -m http.server 8080
# http://localhost:8080/ でアクセス確認
```

#### 実装ファイル
- [docs/index.html](docs/index.html): パスワード保護付きダッシュボード
  - 11行目: `ACCESS_PASSWORD` 定数（パスワード設定）
  - 16行目: `API_URL` 定数（Google Apps Script URL）
  - 229-267行目: パスワード認証ロジック

#### READMEドキュメント更新
- **セットアップ手順**: GitHub Pages有効化方法追加
- **使用方法**: Web版アクセス手順追加（パスワード入力含む）
- **パスワード変更方法**: 手順記載

#### 次ステップ
Yoshihitoさんによる作業:
1. GitHubにコミット＆プッシュ
2. GitHub Pages設定（Settings > Pages）
3. 公開URL動作確認
4. iPhone/iPadでアクセステスト

#### メリット
- ✅ iPhone/iPadからアクセス可能
- ✅ Mac以外のデバイスから確認可能
- ✅ URLを共有するだけで他者も閲覧可能（パスワードあり）
- ✅ 完全無料（GitHub Pagesは無料）
- ✅ HTTPS対応（セキュア接続）

### 2025年11月15日 - launchd環境変数恒久対策

#### 問題背景
- 2025-11-14のPATH問題修正（track_downloads.sh内でPATH設定）は暫定対応
- スクリプト側とlaunchd側の二重設定で冗長性が高い
- より確実な対策として、launchd plist自体に環境変数を設定する恒久対策を実施

#### 実施内容

**1. com.releases.download-tracker.plist修正**
- `EnvironmentVariables`ブロックを追加（42-46行目）
  ```xml
  <key>EnvironmentVariables</key>
  <dict>
      <key>PATH</key>
      <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
  </dict>
  ```

**2. launchdへの反映**
```bash
launchctl unload ~/Library/LaunchAgents/com.releases.download-tracker.plist
launchctl load ~/Library/LaunchAgents/com.releases.download-tracker.plist
launchctl kickstart -k gui/$(id -u)/com.releases.download-tracker
```
- エラーなしで実行完了

**3. 動作検証結果**

tracker.log（2025-11-15 15:41:34実行分）:
- ✅ 「GitHub CLI (gh) がインストールされていません」警告なし
- ✅ GaQ (Mac): 4 DL、GaQ (Windows): 0 DL、PoPuP: 44 DL を正常取得
- ✅ downloads_2025-11-15.csv および downloads_all.csv を正常更新

Google Sheets反映:
- ✅ 手動で `upload_to_sheets.py` 実行後、11/15データ14件をアップロード
- ✅ 総行数: 57行 → 71行（+14行）

ダッシュボードAPI確認:
- ✅ Google Apps Script API経由で最新7日分のデータ取得成功
- ✅ 11/15日付が正常に含まれ、PoPuP: +1 DL、GaQ: 変化なしを確認

**4. READMEドキュメント更新**
- トラブルシューティング4番: 暫定対応と恒久対応を明記
- 作業ログ: 今回の恒久対策実施内容を記録

#### 効果
- ✅ launchd実行時も確実にHomebrewコマンド（gh、jq）が利用可能
- ✅ track_downloads.sh内のPATH設定との二重対策で高い信頼性
- ✅ 今後のトラブルシューティング時に参照可能なドキュメント整備

### 2025年11月15日 - 堅牢性向上とコード整理

#### 問題背景
- plistファイルが`~/Library/LaunchAgents/`のみに存在し、Git管理外で追跡困難
- track_downloads.sh内のPATH設定が完全上書き形式で冗長
- launchd設定の手動セットアップ手順が複雑でミスしやすい

#### 実施内容

**1. plistファイルのGit管理化**
- `~/Library/LaunchAgents/com.releases.download-tracker.plist`をリポジトリ直下にコピー
- リポジトリ直下のファイルをソースオブトゥルース（信頼できる唯一の情報源）として管理
- `~/Library/LaunchAgents/`配下は、このファイルをコピーして使用する運用に変更

**2. track_downloads.shのPATH設定を安全なロジックに改善**

変更前（完全上書き）:
```bash
export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
```

変更後（不足分のみ追加）:
```bash
# Homebrew PATHを安全に追加（既に含まれている場合はスキップ）
if [[ ":$PATH:" != *":/opt/homebrew/bin:"* ]]; then
    export PATH="/opt/homebrew/bin:$PATH"
fi
if [[ ":$PATH:" != *":/usr/local/bin:"* ]]; then
    export PATH="/usr/local/bin:$PATH"
fi
```

**理由**:
- launchd環境ではplist側で完全なPATHを設定済み（二重設定を回避）
- 手動実行時や異なる環境でも、不足分だけを前置することで既存のPATHを保持
- より安全で柔軟な設計

**3. scripts/setup_launchd.sh作成（自動化）**

実装内容:
- Git管理下のplistを`~/Library/LaunchAgents/`へコピー
- 既存登録のアンロード（存在チェック付き）
- launchdへのロード
- 即座にkickstart（動作確認）
- 登録状態の確認と成功・失敗の明示的な表示

実行方法:
```bash
bash scripts/setup_launchd.sh
```

実行結果（2025-11-15 15:51:35）:
```
========================================
launchd設定セットアップ
========================================

[1/4] plistファイルの確認
✅ plistファイルを確認: /Users/yoshihitotsuji/Claude_Code/AccessLog/com.releases.download-tracker.plist

[2/4] plistを~/Library/LaunchAgentsにコピー
✅ コピー成功: /Users/yoshihitotsuji/Library/LaunchAgents/com.releases.download-tracker.plist

[3/4] launchdへの登録
既存の登録を検出、アンロード中...
✅ アンロード完了
ロード中...
✅ ロード成功

[4/4] 動作確認（kickstart）
✅ kickstart成功（即座に実行されました）

========================================
登録確認
========================================
✅ launchdに正常に登録されています

登録情報:
7483	0	com.releases.download-tracker

次回実行予定: 毎日 00:05

ログファイル:
  - 標準出力: /Users/yoshihitotsuji/Claude_Code/AccessLog/tracker.log
  - エラー出力: /Users/yoshihitotsuji/Claude_Code/AccessLog/tracker_error.log

========================================
セットアップ完了
========================================
```

**4. 動作検証**

tracker.log（2025-11-15 15:51:35実行分）:
- ✅ 「GitHub CLI (gh) がインストールされていません」警告なし
- ✅ GaQ、PoPuP全リポジトリのダウンロード数を正常取得
- ✅ downloads_2025-11-15.csv および downloads_all.csv を正常更新

CSV更新確認:
```
-rw-r--r--  1 yoshihitotsuji  staff  7922 Nov 15 15:51 downloads_all.csv
-rw-r--r--  1 yoshihitotsuji  staff  2226 Nov 15 15:51 downloads_2025-11-15.csv
```

tracker_error.log: 空（エラーなし）

**5. READMEドキュメント更新**
- セットアップ手順: `scripts/setup_launchd.sh`の使い方を推奨方法として追記
- トラブルシューティング4番: plist側とスクリプト側の二重対策の理由を明記
- 作業ログ: 今回の改善内容を記録

#### 効果
- ✅ **plistのバージョン管理**: Git管理下でplistを追跡可能、変更履歴が明確
- ✅ **セットアップの自動化**: 1コマンドで確実にlaunchd設定完了、人的ミス削減
- ✅ **PATH設定の最適化**: 二重設定を回避しつつ、手動実行時も動作する柔軟性
- ✅ **堅牢性の向上**: plist側とスクリプト側の二重対策で高い信頼性
- ✅ **保守性の向上**: シンプルで明確なコード、トラブルシューティングが容易

### 2025年12月2日 - PoPuP Mac版追加とデータファイル整理

#### 背景
- PoPuP v1.3.0でMac版（.dmg）がリリース
- ルートディレクトリにCSVファイルが20日分（11/13〜12/02）蓄積し、管理が煩雑化

#### 実施内容

**1. PoPuP Mac/Windows分類の実装**

google_apps_script.js（74-78行目、268-276行目）:
- `PoPuP (Mac)` / `PoPuP (Windows)` の2系列に分離
- 判定ロジック（140-162行目）:
  - tag/releaseName/assetName に `mac`, `darwin`, `macos`, `universal`, `.dmg` を含めば Mac
  - `win`, `windows`, `.exe`, `.msi` を含めば Windows
  - どちらでもなければ安全側で Windows
- 空データレスポンスにも新キー追加（268-276行目）

docs/index.html（287-316行目）:
- カラーパレットに `PoPuP (Mac)` と `PoPuP (Windows)` を追加
  - PoPuP (Mac): 濃紺、ティール、スカイブルー、ライトブルー、ゴールド
  - PoPuP (Windows): 濃紺、インディゴ、バイオレット、オレンジ、ピンク
- サンプルデータ生成関数も4系列対応（354-370行目）

**2. データファイル整理（data/daily/構成）**

ディレクトリ構造:
```
AccessLog/
├── data/
│   ├── daily/              # 日別CSVファイル
│   │   ├── downloads_2025-11-13.csv
│   │   ├── downloads_2025-11-14.csv
│   │   └── ...
│   └── downloads_all.csv   # 全期間統合ファイル
├── track_downloads.sh
├── upload_to_sheets.py
└── tracker.log / tracker_error.log  # ルートに維持
```

track_downloads.sh（40-48、108-119行目）:
- `BASE_DIR="$(cd "$(dirname "$0")" && pwd)"` でスクリプトの絶対パス取得
- `OUTPUT_DIR="${BASE_DIR}/data"`, `DAILY_DIR="${OUTPUT_DIR}/daily"` 設定
- `DAILY_LOG="${DAILY_DIR}/downloads_${CURRENT_DATE}.csv"` に変更
- `mkdir -p "${DAILY_DIR}"` で日次ディレクトリ自動作成

upload_to_sheets.py（237行目）:
- `csv_path = Path(__file__).parent / "data" / "daily" / f'downloads_{today}.csv'` に変更

**3. ドキュメント更新**

README.md:
- 主要ファイルセクション: `data/daily/downloads_YYYY-MM-DD.csv`, `data/downloads_all.csv` に更新
- すぐ確認コマンド: `ls -t data/daily/downloads_*.csv`, `tail data/downloads_all.csv` に修正

docs/data-structure.md（54-68行目）:
- API レスポンス例に `PoPuP (Mac)` と `PoPuP (Windows)` を追加

docs/operations.md（87行目）:
- CSV確認コマンドを `data/daily/downloads_*.csv` に修正

#### 効果
- ✅ **PoPuP Mac版のカウント対応**: v1.3.0以降のMac/Windowsダウンロード数を正確に追跡
- ✅ **データファイル整理**: ルートディレクトリがすっきり、日別ファイルが `data/daily/` に集約
- ✅ **保守性向上**: ファイル構成が明確になり、バックアップやメンテナンスが容易に
- ✅ **拡張性確保**: 今後のアプリ追加やデータ形式変更に柔軟に対応可能

#### 追加改善（同日実施）

**ダッシュボードUX改善**:
- パスワード認証を削除（誰でもアクセス可能に）
- 統計カード表記を簡潔化:
  - 「GaQ (Mac) ダウンロード数」→「GaQ (Mac)」
  - 「合計ダウンロード数」→「合計」
- グラフタイトルを簡潔化:
  - 「GaQ (Mac) ダウンロード数推移」→「GaQ (Mac)」
- ヘッダーを簡潔化:
  - 「アプリダウンロード統計」→「ダウンロード統計」
  - サブタイトル「リリース別ダウンロード数の推移」を削除

効果:
- ✅ アクセス性向上（パスワード不要）
- ✅ 視認性向上（シンプルな表記）
- ✅ 一覧性向上（余分な文字を削減）

---
