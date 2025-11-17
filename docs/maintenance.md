# メンテナンス

リポジトリ追加やバックアップ、Apps Script更新など長期運用向けの手順です。

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
