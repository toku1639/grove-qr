# Phase 1 — 季節の木（magic-tree ベース）

更新日: 2026-10-21

本体は Vite + React + three.js の magic-tree です。以前の Next.js 試作と every-qrcode 同梱物は削除済み。

## 入っているもの

- 地面のタイルそのものが QR。暗いモジュールは少し高く、タップすると葉がモジュールへ降りる。
- 木の種類: Oak / Pine / Willow / Birch
- 季節: Spring / Summer / Autumn / Winter
- 気候: 季節に応じた Calm / Wind / Rain（冬は Snow）
- 春の花色・秋の紅葉色のチップ
- URL から誤り訂正 H の QR。同じ URL は同じ木

## 起動

```bash
npm install
npm run dev
```

ブラウザで表示されるローカル URL（通常は `http://127.0.0.1:5173`）を開く。

## テスト

```bash
npm test
```
