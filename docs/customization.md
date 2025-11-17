# カスタマイズ

ダッシュボードの色やグラフ形式を変更したいときのメモです。

## 🎨 カスタマイズ

### ダッシュボードの色変更

`dashboard.html`の9-18行目（CSS変数）:

```css
:root {
    --navy: #1a365d;           /* メインカラー */
    --navy-light: #2c5282;     /* ライトバージョン */
    --navy-dark: #0f2642;      /* ダークバージョン */
    --gray-bg: #f7fafc;        /* 背景色 */
    --gray-light: #edf2f7;     /* ライトグレー */
    --text-primary: #2d3748;   /* テキスト（濃） */
    --text-secondary: #718096; /* テキスト（薄） */
}
```

### グラフの色変更

`dashboard.html`の229-250行目:

```javascript
const APP_COLOR_PALETTES = {
    'GaQ (Mac)': [
        { bg: 'rgba(26, 54, 93, 0.85)', border: 'rgba(26, 54, 93, 1)' },  // 濃紺
        // ... 他の色
    ],
    // ...
};
```

### グラフの種類変更

`dashboard.html`の391行目:

```javascript
type: 'bar',  // 'line', 'pie', 'doughnut'なども可能
```

---
