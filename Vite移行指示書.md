# おはVメーカー Vite 移行指示書

## 背景・目的

おはVメーカーの AI 背景除去機能（`@imgly/background-removal`）が CDN からの動的インポートで動作しないため、
InspirationCat（https://github.com/nyanko3141592/InspirationCat）と同様に
Vite + npm パッケージ構成に移行する。

---

## 現状

```
ohaV/
  index.html       # メインページ（おはVサーチ）
  app.js           # メインページのJS
  style.css        # メインページのCSS
  maker.html       # おはVメーカー
  maker.js         # おはVメーカーのJS（1288行、バニラJS）
  maker.css        # おはVメーカーのCSS
  anniversaries.json
  manifest.json
  ohaV.ico
```

ビルドツールなし。`maker.js` で CDN（jsDelivr）から `@imgly/background-removal` を動的インポートしているが 404 エラーで動かない。

---

## 移行後の構成

```
ohaV/
  index.html           # Vite エントリ（メインページ）
  maker.html           # Vite エントリ（おはVメーカー）
  src/
    app.js             # メインページのJS（変更なし）
    maker.js           # おはVメーカーのJS（import文修正のみ）
  public/
    ohaV.ico
    manifest.json
    anniversaries.json
  style.css            # 変更なし
  maker.css            # 変更なし
  package.json
  vite.config.js
```

---

## 手順

### 1. npm 初期化とパッケージインストール

```bash
npm init -y
npm install --save-dev vite
npm install @imgly/background-removal
```

### 2. vite.config.js を作成

マルチページ構成（index.html と maker.html を両方エントリに設定する）。

```js
import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        maker: 'maker.html',
      },
    },
  },
})
```

### 3. package.json にスクリプト追加

`package.json` の `scripts` に以下を追加：

```json
"scripts": {
  "dev": "vite",
  "build": "vite build",
  "preview": "vite preview"
}
```

### 4. src/ ディレクトリの作成とファイル移動

- `app.js` → `src/app.js`
- `maker.js` → `src/maker.js`

### 5. maker.js の修正（最重要）

**削除する箇所（maker.js の 392〜400行目付近）：**

```js
// 削除対象
const IMGLY_CDN = 'https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/dist/';
let _removeBackground = null;

async function loadRemoveBackground() {
  if (_removeBackground) return _removeBackground;
  const mod = await import(`${IMGLY_CDN}index.mjs`);
  _removeBackground = mod.removeBackground;
  return _removeBackground;
}
```

**ファイル先頭（1行目）に追加：**

```js
import { removeBackground } from '@imgly/background-removal';
```

**applyAiRemoval 関数内を修正（417行目付近）：**

変更前：
```js
const removeBackground = await loadRemoveBackground();

const resultBlob = await removeBackground(file, {
  publicPath: IMGLY_CDN,
  progress: ...
```

変更後：
```js
const resultBlob = await removeBackground(file, {
  progress: ...
```

（`publicPath` の指定も不要なので削除する）

### 6. index.html の修正

`app.js` の script タグを変更：

```html
<!-- 変更前 -->
<script src="app.js"></script>

<!-- 変更後 -->
<script type="module" src="src/app.js"></script>
```

### 7. maker.html の修正

`maker.js` の script タグを変更：

```html
<!-- 変更前 -->
<script type="module" src="maker.js"></script>

<!-- 変更後 -->
<script type="module" src="src/maker.js"></script>
```

### 8. .gitignore 更新

`.gitignore` に以下を追加：

```
node_modules/
dist/
```

---

## 動作確認

```bash
npm run dev
```

ローカルサーバーが起動したら、おはVメーカーで背景ありの画像をキャラにセットし、AI背景除去が完走することを確認する。

---

## 注意点

- `anniversaries.json`、`manifest.json`、`ohaV.ico` は `public/` に移動することで Vite のビルド後も静的ファイルとして配信される
- InspirationCat と同様、`@imgly/background-removal` は AGPL-3.0 ライセンスのため、ソースコードを公開している限り問題なし（すでに GitHub で公開済み）
- ビルド成果物（`dist/`）を GitHub Pages や Cloudflare Pages にデプロイする場合、ビルドコマンドを `npm run build`、出力ディレクトリを `dist` に設定する
