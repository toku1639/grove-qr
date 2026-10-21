# Morphing QR（Magic Tree）

URL を立体の木にし、タップすると読み取れる QR コードになるアプリです。

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

## 構成

```text
src/
  App.tsx              ハンバーガーでセクション切替
  sections/
    TreeSection.tsx    木（気候・樹種・季節）
    BuildingSection.tsx シンプルな建物
  scene/               木用の 3D / QR
  building/            建物用の 3D（木と分離）
  audio/  ui/
docs/  docs/shots/  public/
```

## ライセンス

MIT — 詳細は [LICENSE](LICENSE)。
