# @imgly/background-removal Vite（Cloudflare Pages）移行時のトラブルシューティング引き継ぎ資料

## 現在の状況
おはVメーカーをVite環境に移行し、AI背景除去ライブラリ `@imgly/background-removal` (v1.7.0) を npm インポートに変更しました。
ローカル開発環境（`npm run dev`）では正常に背景画像のAI除去が動作しますが、**本番環境（Cloudflare Pagesへの npm run build デプロイ後）でAI推論が実行できずエラー**になります。

### エラー内容
本番環境で画像をアップロードすると開発者ツールのConsoleに以下が出力されます。
```
[おはVメーカー] AI除去エラー: Error: Resource /models/isnet_fp16 not found. Ensure that the config.publicPath is configured correctly.
    at loadAsBlob (resource.ts:47:11)
...
```

## これまで試した事と失敗の理由

### ❌ 1. `publicPath: "https://cdn.jsdelivr.net/npm/@imgly/background-removal@1.7.0/dist/"` を指定
- **結果**: ローカル・本番ともにエラー。
- **理由**: jsdelivr のような一般 CDN はファイルサイズが巨大なモデルファイル（約100MBの`.wasm` や `.onnx`）の配信上限に引っかかるため、モデル自体が存在しない（404）。

### ❌ 2. `publicPath` の指定を完全に削除してライブラリのデフォルトに任せる
- **結果**: ローカル（`npm run dev`）では成功するが、本番環境でエラー。
- **理由**: ライブラリ内部にハードコードされているデフォルトのURL設定👇
  `"https://staticimgly.com/@imgly/background-removal-data/${PACKAGE_VERSION}/dist/"`
  が原因。ローカル環境では `$PACKAGE_VERSION` が解決されるが、**Viteのプロダクションビルド時にこの変数解決のコードが最適化で欠落・破壊される**。
  その結果、文字通り `${PACKAGE_VERSION}` などの無効なURLに fetch を行い、Cloudflare側が 404 フォールバックとして `index.html` を返してしまい、ライブラリ内部ファイルのロードに失敗する。

### ❌ 3. `publicPath: "https://staticimgly.com/@imgly/background-removal-data/1.7.0/dist/"` を直書きで指定
- **結果**: 依然として本番環境で `Resource /models/isnet_fp16 not found` となる。
- **理由**: `@imgly/background-removal` の内部仕様上、`publicPath` はベースURLとして扱われ、取得されるチャンク名は `/models/isnet_fp16` などの「先頭にスラッシュがつく絶対パス」の文字列になっている。（`resources.json`で定義されている）
  JavaScriptのURL解決 `new URL("/models/isnet_fp16", "https://staticimgly.com/@imgly/background-removal-data/1.7.0/dist/")`
  を実行すると、ホスト名ルートまで遡ってしまい **`https://staticimgly.com/models/isnet_fp16`** に解決される。
  このURL自体にはファイルが存在しない（正しくは `.../1.7.0/dist/models/isnet_fp16` になるべき）ため、再度 404 になるというバグ（罠）が発生している。

## 参考事例：InspirationCat はなぜ動いているのか？
`InspirationCat` (vite + @imgly/background-removal構成) では、**`publicPath` を指定せずに動いています**。
考えられる理由：
- InspirationCat が使用している Vite のバージョンやプラグインの構成が、おはVメーカーと微妙に異なり、パブリックパスの変数評価が破損しない。
- あるいは `@imgly/background-removal` には Vite 専用の Vite Plugin プラグイン（`@imgly/background-removal/vite` のような静的ファイルをコピーする仕組み）が存在し、それを導入する必要があるかもしれない。

## 次のAI（または再開時）への提案アプローチ

ローカルにモデルファイルを内包させる**「ローカルホスティング構成」**に変更するのが最も確実です。

1. **パッケージのインストール**
   `npm install @imgly/background-removal-data` を実行し、モデルデータをプロジェクトに含める。
2. **モデルファイルのコピー**
   `node_modules/@imgly/background-removal-data/dist/` にある `models/` と `onnxruntime-web/` を `public/` ディレクトリ直下に置く。（ビルドプロセスで自動コピーするスクリプトを `package.json` に組むとベター）。
3. **パスの指定**
   `public/` 直下に配置することで、クライアントからは相対パスでアクセスできるため、
   ```javascript
   const resultBlob = await removeBackground(file, {
     publicPath: "/",  // ← public フォルダからの絶対パス
     // ...
   });
   ```
   と指定すれば、CDN由来のルーティング問題やViteでのバージョン変数破壊に一切影響されずに確実にモデルが読み込まれるようになります。（※ただし、Viteのビルド成果物のサイズは大きくなります）
