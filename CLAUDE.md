# EVEN Anki

Even Realities G2スマートグラスで動くAnki式フラッシュカード学習アプリ。

## プロジェクト情報

| 項目 | 値 |
|---|---|
| パス | `~/project/even-g2/even-g2-app` |
| package_id | `io.github.takakachan.evensrs` |
| GitHub | https://github.com/takakachan/even-g2-app |
| GitHub Pages | https://takakachan.github.io/even-g2-app/ |
| デプロイ | `git push origin main` → GitHub Actions → Pages |

## 技術スタック
- Vite + TypeScript
- `@evenrealities/even_hub_sdk` v0.0.10
- `sql.js` (WASM SQLite — apkgインポート用)
- `jszip` (apkg解凍用)

## ファイル構成
```
src/
  main.ts      — エントリポイント、状態マシン（deck-select / review / no-decks）
  display.ts   — G2グラス画面描画（showDeckSelect / showFront / showBack / showDone / showNoDecks）
  manage.ts    — スマホ管理UI（デッキCRUD、カードCRUD、JSON/CSV/APKGインポート）
  store.ts     — ストレージ（localStorage + SDK永続化、setBridge / syncFromBridge / syncToBridge）
  sm2.ts       — SM-2間隔反復アルゴリズム（review / isDue）
  types.ts     — Card, Deck, Rating 型
app.json       — Even Hubマニフェスト
```

## ビルド・デプロイ
```bash
npm run build                                    # ビルド（dist/）
npm run preview -- --host 0.0.0.0 --port 4173   # ローカルサーブ
evenhub qr --url "http://<YOUR_IP>:<port>/"      # QR生成
evenhub pack app.json dist -o even-anki.ehpk    # パッケージ化
git push origin main                             # GitHub Pagesデプロイ
```

## G2グラス操作フロー
```
起動
 ├─ デッキ0件 → 「デッキがありません」(2tap=終了)
 ├─ デッキ1件 → 直接学習開始
 └─ デッキ2件以上 → デッキ選択画面
                     scroll=移動, tap=開始, 2tap=終了

学習セッション:
  表面 → tap=裏面へ, 2tap=デッキ選択(複数時) or 終了(1件時)
  裏面 → scroll=評価変更(下=Easy方向,上=Again方向), tap=確定, 2tap=表面に戻る
  完了 → 2tap=デッキ選択に戻る
```

## ストレージ設計
```
localStorage:
  'even-srs-decks'  → { [deckName: string]: Deck }
  'even-srs-active' → deckName
```
- デッキIDは `deck.name` をキーに使用
- 旧キー `even-srs-deck` からのマイグレーション処理あり
- 起動時: SDKストレージ → localStorage に復元
- 保存時: localStorage + SDKストレージの両方に書く

## 管理UI機能（スマホ画面）
- デッキ一覧（USE / NAME / DEL）、復習完了デッキに ✓ マーク
- デッキ追加: JSON / CSV / APKG ファイルインポート、空デッキ作成
- カード一覧: 検索、ページネーション、EDIT / 削除
- カード追加・編集（進捗リセットオプション）
- RELOAD G2 ボタン（location.reload）

## デザイン
- 白背景・ダークテキスト・モノスペースフォント
- ミニマルなピルボタン（アウトラインスタイル）
- モーダルはボトムシート形式

## apkgインポート
- `.apkg` = ZIPファイル内に `collection.anki2` or `collection.anki21`（SQLite DB）
- `SELECT flds FROM notes` でフィールド取得、`\x1f` 区切りで分割
- HTMLタグを `stripHtml()` で除去
- Vite WASM: `import sqlWasmUrl from 'sql.js/dist/sql-wasm.wasm?url'`

## iOS固有の対策
- viewport: `maximum-scale=1.0, user-scalable=no`（ズーム防止）
- inputのfont-size: 16px以上（iOSズーム閾値）
- ファイル選択: `accept="*/*"`（`.apkg` はiOSにグレーアウトされる）
- file input: `<input>` を `<label>` 外に出して `for` 属性で紐付け
