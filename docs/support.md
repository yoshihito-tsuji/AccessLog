# サポート・デバッグ

ログ確認や環境変数の確認などデバッグ時に参照する情報です。

## 📞 サポート・デバッグ

### ログファイル確認

```bash
# 標準出力ログ
cat /Users/yoshihitotsuji/Claude_Code/AccessLog/tracker.log

# エラーログ
cat /Users/yoshihitotsuji/Claude_Code/AccessLog/tracker_error.log
```

### launchd状態確認

```bash
# 登録状態
launchctl list | grep releases

# plist内容
cat ~/Library/LaunchAgents/com.releases.download-tracker.plist
```

### 環境変数確認

```bash
# 環境変数（オプション設定の場合）
env | grep SPREADSHEET
env | grep GOOGLE_SHEETS
```

### Google Sheets直接確認

スプレッドシートURL:
```
https://docs.google.com/spreadsheets/d/1-n-CpA9U8kwqTRxhbKBhNOj0-lcZjLG1MJXLhxgdQPs/edit
```

### API動作テスト（ブラウザコンソール）

```javascript
fetch('https://script.google.com/macros/s/AKfycbxZx9xCYNYVepuxRsPpWwd4k4zpuq1yivyC6P3nWEEnbYHaIyelOdgVAGvHhi7-rzYeYw/exec?type=timeline&days=7')
  .then(r => r.json())
  .then(data => {
    console.log('Status:', data.status);
    console.log('Dates count:', data.dates.length);
    console.log('First 5 dates:', data.dates.slice(0, 5));
    console.log('Last 5 dates:', data.dates.slice(-5));
  });
```

---
