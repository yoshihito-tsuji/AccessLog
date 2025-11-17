# トラブルシューティング

エラー別の確認ポイントと復旧手順です。

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

4. **launchd環境でHomebrewコマンドが見つからない**
   - **症状**: tracker_error.logに「GitHub CLI (gh) がインストールされていません」と記録される
   - **原因**: launchd環境ではPATHに `/opt/homebrew/bin` や `/usr/local/bin` が含まれていない
   - **解決策（現在の実装・2025-11-15最終版）**:
     - **plist側**: `com.releases.download-tracker.plist`に`EnvironmentVariables`ブロックを追加（Git管理下）
       ```xml
       <key>EnvironmentVariables</key>
       <dict>
           <key>PATH</key>
           <string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
       </dict>
       ```
     - **スクリプト側**: `track_downloads.sh`で不足分のみを安全に追加（手動実行時にも対応）
       ```bash
       # Homebrew PATHを安全に追加（既に含まれている場合はスキップ）
       if [[ ":$PATH:" != *":/opt/homebrew/bin:"* ]]; then
           export PATH="/opt/homebrew/bin:$PATH"
       fi
       if [[ ":$PATH:" != *":/usr/local/bin:"* ]]; then
           export PATH="/usr/local/bin:$PATH"
       fi
       ```
     - **理由**: plist側で設定することで確実性を担保しつつ、スクリプト側でも冗長性を持たせることで、手動実行時や異なる環境でも動作する堅牢な設計
   - **plist更新後の反映方法**:
     ```bash
     # 自動セットアップスクリプト使用（推奨）
     bash scripts/setup_launchd.sh

     # または手動で
     launchctl unload ~/Library/LaunchAgents/com.releases.download-tracker.plist
     launchctl load ~/Library/LaunchAgents/com.releases.download-tracker.plist
     launchctl kickstart -k gui/$(id -u)/com.releases.download-tracker
     ```
   - **確認方法**:
     ```bash
     # tracker.logで最新実行を確認
     tail -50 tracker.log

     # エラーログ確認
     cat tracker_error.log
     ```

### 5. ダッシュボードが表示されない

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

### 6. データが0件

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

### 7. GaQデータが表示されない

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
