# 次フェーズ: ダッシュボード公開方法の検討

**From: Claude Code, To: Codex**

Yoshihitoさんの要望「各PCでHTMLを開く方式ではなく、ウェブ上の情報を直接読みにいき、どこからでも確認できる仕組み」の実現方法を整理しました。

---

## 要件定義

### 現状の課題
- dashboard.htmlはローカルファイルとして存在
- 各デバイスで `file:///Users/yoshihitotsuji/...` のパスで開く必要がある
- iPhoneやiPad、他のPCからアクセス不可

### 目指す姿
1. **URLでアクセス可能**: `https://example.com/dashboard` のような形式
2. **デバイス非依存**: iPhone、iPad、Mac、Windowsどこからでもアクセス
3. **認証不要または簡易認証**: 個人利用なので複雑な認証は不要
4. **コスト最小**: できれば無料または低コスト
5. **Google Sheets連携維持**: 既存のGoogle Apps Script APIを活用

---

## 実現方法の候補

### ✅ 方法1: GitHub Pages（推奨）

#### 概要
- GitHubリポジトリの静的ファイルをWebホスティング
- dashboard.htmlをそのまま公開可能

#### メリット
- **完全無料**
- セットアップが簡単（数分で完了）
- HTTPSデフォルト対応
- GitHub Actionsで自動デプロイ可能
- カスタムドメイン設定可能

#### デメリット
- リポジトリがpublicの場合、誰でもアクセス可能
  - 対策: privateリポジトリ＋GitHub Pro（学生/教育者は無料）
  - または: 簡易的なパスワード認証をJavaScriptで実装

#### 必要な作業
1. AccessLogリポジトリを公開（またはGitHub Pro契約）
2. GitHub Pages有効化（Settings > Pages）
3. dashboard.htmlを `docs/` ディレクトリに配置
4. アクセスURL: `https://yoshihito-tsuji.github.io/AccessLog/`

#### セキュリティ考慮
- Google Apps Script URLは公開されるが、APIは読み取り専用
- 追加の簡易認証（オプション）:
  ```javascript
  // dashboard.html冒頭に追加
  const correctPassword = "your_password_here";
  const inputPassword = prompt("パスワードを入力してください:");
  if (inputPassword !== correctPassword) {
    document.body.innerHTML = "Access Denied";
    throw new Error("Authentication failed");
  }
  ```

---

### ⚠️ 方法2: Netlify / Vercel（次善策）

#### 概要
- 静的サイトホスティングサービス
- GitHubリポジトリと連携して自動デプロイ

#### メリット
- 無料プランあり
- カスタムドメイン対応
- 自動HTTPS
- 簡易的な認証機能あり（Netlify Identity）

#### デメリット
- セットアップがGitHub Pagesより複雑
- Netlify Identityは追加の学習コスト

#### 必要な作業
1. Netlify/Vercelアカウント作成
2. GitHubリポジトリ連携
3. デプロイ設定（ビルド不要、静的ファイルそのまま）
4. 認証設定（オプション）

---

### ❌ 方法3: Google Sites（非推奨）

#### 概要
- Googleの無料サイト作成サービス
- iframeで外部HTMLを埋め込む

#### メリット
- Googleアカウントで管理
- 完全無料

#### デメリット
- **iframe制限**: 外部HTMLの埋め込みが困難
- カスタムJavaScript実行に制約
- Chart.jsなどのライブラリ読み込みが複雑
- **推奨しない**

---

### ❌ 方法4: レンタルサーバー / VPS（過剰）

#### 概要
- さくらインターネット、ロリポップなど

#### メリット
- 完全な制御権

#### デメリット
- **有料**（月額数百円〜）
- セットアップ・管理コストが高い
- 静的サイトには過剰スペック
- **不要**

---

## 推奨アプローチ: GitHub Pages

### 実装ステップ（所要時間: 10分）

#### ステップ1: ディレクトリ構成変更
```
AccessLog/
├── docs/
│   ├── index.html（dashboard.htmlをリネーム）
│   └── README.md（オプション：説明ページ）
├── track_downloads.sh
├── upload_to_sheets.py
└── README.md
```

#### ステップ2: GitHub Pages有効化
1. GitHubリポジトリページ
2. Settings > Pages
3. Source: "Deploy from a branch"
4. Branch: "main", Folder: "/docs"
5. Save

#### ステップ3: アクセス確認
- URL: `https://yoshihito-tsuji.github.io/AccessLog/`
- または: `https://yoshihito-tsuji.github.io/AccessLog/index.html`

#### ステップ4: セキュリティ対策（オプション）
```javascript
// docs/index.html 冒頭に追加
(function() {
  const PASSWORD = "gaq_popup_2025"; // 任意のパスワード
  const stored = sessionStorage.getItem("auth");

  if (stored !== PASSWORD) {
    const input = prompt("パスワード:");
    if (input !== PASSWORD) {
      document.body.innerHTML = "<h1>Access Denied</h1>";
      throw new Error("Auth failed");
    }
    sessionStorage.setItem("auth", PASSWORD);
  }
})();
```

---

## セキュリティ分析

### 公開される情報
1. **dashboard.html（コード）**: 誰でも閲覧可能
2. **Google Apps Script URL**: HTML内に記載
3. **ダウンロード数データ**: APIを通じて取得可能

### リスク評価
- **低リスク**: ダウンロード数は既にGitHub上で公開情報
- **秘匿情報なし**: credentials.jsonはリポジトリに含まれない（.gitignore済み）
- **改ざんリスクなし**: Google Apps Scriptは読み取り専用API

### 追加セキュリティ対策
もし完全非公開を望む場合:
1. **GitHub Pro契約**: privateリポジトリでもGitHub Pages利用可能
2. **Basic認証**: Netlifyで設定（有料プラン）
3. **IP制限**: Cloudflare経由で特定IPのみ許可

---

## コスト比較

| 方法 | 初期費用 | 月額費用 | 総合評価 |
|------|----------|----------|----------|
| GitHub Pages (public) | ¥0 | ¥0 | ★★★★★ |
| GitHub Pages (private + Pro) | ¥0 | $4 | ★★★★☆ |
| Netlify Free | ¥0 | ¥0 | ★★★☆☆ |
| Netlify Pro（認証あり） | ¥0 | $19 | ★★☆☆☆ |
| レンタルサーバー | ¥0 | ¥500〜 | ★☆☆☆☆ |

---

## 次ステップの提案

### Codexへの質問事項
1. **公開範囲**: リポジトリをpublicにしてGitHub Pages無料版で良いか？
2. **認証の必要性**: 簡易パスワード認証を実装するか？
3. **カスタムドメイン**: 独自ドメイン（例: `stats.yoshihito.dev`）は必要か？

### Yoshihitoさんへの確認事項
1. ダウンロード統計を公開することに問題はないか？
2. 特定の人だけにアクセスを制限したいか？
3. どのデバイスから主にアクセスするか（iPhone、iPad、Mac）？

---

## まとめ

**推奨**: GitHub Pages（public）+ 簡易パスワード認証

**理由**:
- 完全無料
- セットアップ簡単（10分）
- HTTPSデフォルト
- モバイル対応
- 既存のGoogle Apps Script APIそのまま利用可能

**実装待ち**: Codexからの設計承認
