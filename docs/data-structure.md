# データ構造

CSV・Google Sheets・Apps Script API の構成を記載しています。

## 📈 データ構造

### CSVフォーマット

#### ヘッダー
```csv
記録日時,リポジトリ,リリース名,タグ,アセット名,ダウンロード数
```

#### データ例
```csv
"2025-11-13 16:36:04","GaQ","GaQ Transcriber v1.1.1 (macOS)","v1.1.1-mac","GaQ_Transcriber_v1.1.1_mac.dmg",4
"2025-11-13 16:36:04","GaQ","GaQ Transcriber v1.1.1 (macOS)","v1.1.1-mac","GaQ_Transcriber_v1.1.1_mac.dmg.sha256",0
"2025-11-13 16:36:04","GaQ","Windows v1.1.1","windows-v1.1.1","GaQ_Transcriber_Windows_v1.1.1_Portable.zip",0
"2025-11-13 16:36:04","PoPuP","PoPuP v1.2.0","v1.2.0","PoPuP_Portable_v1.2.0.zip",37
```

### Google Sheetsシート構成

#### DailyData
- **カラム**: 記録日時, リポジトリ, リリース名, タグ, アセット名, ダウンロード数
- **用途**: 累積データの生データ保存
- **データ処理**: Apps Scriptが日付ごとに最新タイムスタンプのレコードを選択

### Google Apps Script APIレスポンス

#### エンドポイント
```
GET https://script.google.com/macros/s/.../exec?type=timeline&days=30
```

#### レスポンス例（JSON）
```json
{
  "status": "success",
  "dates": ["2025-11-07", "2025-11-08", "...", "2025-11-13"],
  "apps": {
    "GaQ (Mac)": {
      "versions": {
        "v1.1.1-mac": [0, 0, 0, 0, 0, 0, 4]
      },
      "total": [0, 0, 0, 0, 0, 0, 4]
    },
    "GaQ (Windows)": {
      "versions": {
        "windows-v1.1.1": [0, 0, 0, 0, 0, 0, 0]
      },
      "total": [0, 0, 0, 0, 0, 0, 0]
    },
    "PoPuP (Mac)": {
      "versions": {
        "v1.3.0": [0, 0, 0, 0, 0, 0, 5]
      },
      "total": [0, 0, 0, 0, 0, 0, 5]
    },
    "PoPuP (Windows)": {
      "versions": {
        "v1.3.0": [0, 0, 0, 0, 0, 0, 10],
        "v1.2.0": [0, 0, 0, 0, 0, 0, 37],
        "v1.1.0": [0, 0, 0, 0, 0, 0, 2],
        "v1.0.0": [0, 0, 0, 0, 0, 0, 1]
      },
      "total": [0, 0, 0, 0, 0, 0, 50]
    }
  }
}
```

**データの解釈**:
- `dates`: 指定期間の日付配列
- `versions`: バージョン別の日次増分配列
- `total`: 全バージョン合計の日次増分配列
- 累積値から前日との差分を計算して増分表示

---
