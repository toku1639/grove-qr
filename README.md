# GroveQR

URL を立体の小さな木立（grove）にし、真上から見ると読み取れる QR コードになるアプリです。

![夏の木](docs/shots/tree.png)

## 起動

```bash
npm install
npm run dev
```

```bash
npm test
npm run build
```

## GitHub Pages

公開 URL: https://toku1639.github.io/grove-qr/

`main` への push で Actions が本番ビルドし、`gh-pages` ブランチへ公開します。

**Pages 設定（重要）**

1. Settings → Pages → **Build and deployment → Source**
2. **Deploy from a branch** を選ぶ
3. Branch: **`gh-pages`** / folder: **`/ (root)`** → Save

※ Source を GitHub Actions のまま、または `main` 直出しにすると、ビルド前のソースが配信されて真っ白になります。

## 構成

```text
src/
  App.tsx
  sections/
    TreeSection.tsx    木（気候・樹種・季節）
  scene/               3D / QR
  audio/  ui/
docs/  docs/shots/  public/
```

## ライセンス

MIT — 詳細は [LICENSE](LICENSE)。
