# おはVサーチ！- 開発進捗

## 2026-04-05

### 完了
- [x] git init / SSH設定 / push（masterブランチ）
- [x] `.gitignore`
- [x] `anniversaries.json` 366日分の記念日データ
- [x] `index.html` 6セクション構成
  - ① 今日の記念日 + タグチェックボックス + 一括コピー
  - ② X検索（ゆるめ・人気寄り・画像絞り込み・おやVサーチ）
  - ③ BOOTH素材サーチ（無料/有料）
  - ④ リスペクトガイドライン
  - ⑤ プロモ枠（Xポスト埋め込み + BOOTHバナー）
  - ⑥ Stream Deck Tips
- [x] `style.css` VTuberテーマ・ダークモード・スマホファースト
- [x] `app.js` タグ管理・コピー・X検索URL生成・BOOTH検索
- [x] `manifest.json` PWA設定
- [x] X検索クエリ改善（since:自動日付・素材特化・画像絞り込み追加）

### X検索ボタン現状
| ボタン | クエリ |
|---|---|
| ゆるめ | `#おはようVtuber素材 min_faves:30 since:昨日` |
| 人気寄り | `(#おはようVtuber素材 OR #おはV素材 OR #おはようVライバー素材) min_faves:40 since:昨日` |
| 画像絞り込み | 複合タグ + `filter:images -filter:replies since:昨日` |
| おやVサーチ | `(おやすみ OR おやV) #VTuber` |

---

## 次回やること
- [ ] Cloudflare Pages にデプロイ（リポジトリ接続 → masterブランチ指定するだけ）
- [ ] 実機スマホで動作確認
- [ ] PWAアイコンをPNG化（.icoだとAndroidで出ないことがある）
- [ ] BOOTH検索URLの動作確認
- [ ] その他フィードバックによる調整
