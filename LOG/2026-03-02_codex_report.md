# Claude Code → Codex 完了報告 / 追加問題報告（2026-03-02）

From: Claude Code / To: Codex

---

## 1. 本日の実施内容（Prompt 1〜3 完了）

### Prompt 1・2: maxSeenCount 修正（実装完了）

- `config/google_apps_script.js` v1.2.0 に以下を実装（コミット `71f4d25`）：
  - `maxSeenCount` 導入: `effectivePrev = Math.max(prevCount, maxSeenCount)` で二重計上防止
  - `cleanupDuplicateSpikeDates()` 追加: 2/24・2/27 行の一括削除関数
  - `testIncrementBaseline()` にケースF・F-2 追加（10テスト体制）

### Prompt 3: 運用復旧（完了）

- launchd: 別マシンが担当（本日の自動実行成功確認）
- `scripts/migrate_drive_folder.py` 削除（コミット `1b36138`）

### Yoshihitoさんによる手動操作（完了）

| 手順 | 結果 |
|------|------|
| Apps Script に v1.2.0 コードをデプロイ・保存 | ✅ 完了 |
| `testIncrementBaseline()` 実行 | ✅ 10/10 PASS |
| `cleanupDuplicateSpikeDates()` 実行 | ✅ 172行削除（2/24・2/27） |

---

## 2. 未解決の問題：2/28 に新たなスパイク

### 観測値（30日ビュー、クリーンアップ後）

```
2026-02-16: GaQ(Mac)=41, GaQ(Win)=50, PoPuP(Mac)=30, PoPuP(Win)=113 = +234  ← 正常
2026-02-24: +0  ✅ 解消（2/23→2/24 の重複スパイク）
2026-02-27: +0  ✅ 解消（2/26→2/27 の重複スパイク）
2026-02-28: GaQ(Mac)=41, GaQ(Win)=50, PoPuP(Mac)=30, PoPuP(Win)=117 = +238  ← 新問題
```

- クリーンアップ前の 2/28: `PoPuP(Win)=4 のみ = +4`（正常値）
- クリーンアップ後の 2/28: `+238`（ほぼ 2/16 と同一の増分パターン）

### 2/28 バージョン別内訳 vs 2/16 の比較

| バージョン | 2/16 増分 | 2/28 増分 | 差分 |
|-----------|----------|----------|------|
| GaQ(Mac) v1.2.10 | +14 | +14 | 0 |
| GaQ(Mac) v1.2.2 | +6 | +6 | 0 |
| GaQ(Mac) v1.2.1 | +1 | +1 | 0 |
| GaQ(Mac) v1.2.0 | +6 | +6 | 0 |
| GaQ(Mac) v1.1.1-mac | +14 | +14 | 0 |
| GaQ(Win) v1.2.10 | +22 | +22 | 0 |
| GaQ(Win) v1.2.2 | +7 | +7 | 0 |
| GaQ(Win) v1.2.1 | +1 | +1 | 0 |
| GaQ(Win) v1.2.0 | +10 | +10 | 0 |
| GaQ(Win) windows-v1.1.1 | +10 | +10 | 0 |
| PoPuP(Mac) v1.3.1 | +20 | +20 | 0 |
| PoPuP(Mac) v1.3.0 | +7 | +7 | 0 |
| PoPuP(Mac) v0.0.10-test | +3 | +3 | 0 |
| PoPuP(Win) v1.3.1 | +23 | +23 | 0 |
| PoPuP(Win) v1.3.0 | +7 | +7 | 0 |
| PoPuP(Win) v0.0.10-test | +2 | +2 | 0 |
| **PoPuP(Win) v1.2.0** | **+78** | **+82** | **+4** |
| PoPuP(Win) v1.1.0 | +2 | +2 | 0 |
| PoPuP(Win) v1.0.0 | +1 | +1 | 0 |

**事実**: 2/28 の各バージョン増分が 2/16 と完全一致（PoPuP Win v1.2.0 のみ +4 多い）。
これは 2/28 の DailyData 累積値 = 2/16 の DailyData 累積値（+ PoPuP Win v1.2.0 の +4）であることを示す。

### maxSeenCount が機能していない理由の仮説

**仮説 A: Apps Script の API デプロイが旧バージョンのまま**

- `testIncrementBaseline()` はエディタの最新コードで実行 → PASS
- しかし Web API の URL は古い**デプロイメント**を参照している可能性
- Apps Script は「保存」と「デプロイ更新」が独立している
- 対処: エディタで「デプロイ → デプロイメントの管理 → 編集 → 新バージョン → デプロイ」

**仮説 B: 2/28 のDailyDataに追加の重複行が残っている**

- 2/28 の DailyData に複数のタイムスタンプ（例: 23:59 と 00:00 等）の行があり、
  `latestRecordsByDate` の選別で 2/16 と同一の古いタイムスタンプ行が選ばれている
- 対処: DailyData の 2/28 行を実際に確認・不正タイムスタンプ行を削除

**仮説 C: 実は 2/28 に実際のダウンロードが 234+ 件発生した（正常）**

- 2/28 の実際 GitHub 累積が 2/16 より +234 高い場合、正当な新規スパイク
- ただし GitHub API 現在値（GaQ=91, PoPuP=145, 合計 236 DL）と Apps Script 30日合計（480 DL）の大幅な乖離から考えると可能性は低い

---

## 3. 現在のデータ状況

```
GitHub API 現在値:  GaQ=91 DL, PoPuP=145 DL, 合計=236 DL
Apps Script 30日合計: GaQ(Mac)=83, GaQ(Win)=100, PoPuP(Mac)=61, PoPuP(Win)=236, 合計=480 DL
```

- 480 > 236: Apps Script の 30日計上が GitHub 合計の約 2 倍 → まだ過大計上が残っている

---

## 4. Codexへの依頼

以下のいずれかの調査・判断をお願いします：

1. **デプロイ更新の要否**: Apps Script の API URL が旧バージョンを参照しているか否か、
   確認方法と対処法を指示してください。

2. **2/28 データの扱い**: 2/28 の DailyData が 2/16 と同一累積値の重複データならば、
   `cleanupDuplicateSpikeDates()` の対象に 2/28 を追加すべきか判断してください。

3. **根本的な再設計の要否**: 今回の問題を見て、DailyData 蓄積のアーキテクチャや
   増分計算ロジックに根本的な改善が必要と判断される場合は、再設計案を提案してください。

---

## 5. 添付情報

- 修正済みコード: `config/google_apps_script.js`（v1.2.0、リポジトリにコミット済み）
- 本日ログ: `LOG/2026-03-02.md`
- コミット履歴: `71f4d25`（修正）→ `1b36138`（運用復旧）
