# EVEN Anki — Even Realities G2 SRSアプリ

## 概要
G2スマートグラスでAnki式フラッシュカード学習ができるアプリ。
スマホ画面に管理UI、G2グラスに学習画面を表示する。

## 技術スタック
- Vite + TypeScript
- `@evenrealities/even_hub_sdk` (v0.0.10)
- `sql.js` (WASM SQLite — apkgインポート用)
- `jszip` (apkg解凍用)

## プロジェクト構造
```
src/
  main.ts      — エントリポイント、状態マシン、G2イベント処理
  display.ts   — G2グラスへの画面描画（576×288px）
  manage.ts    — スマホ画面の管理UI（デッキ・カードCRUD、インポート）
  store.ts     — ストレージ（localStorage + SDKストレージ永続化）
  sm2.ts       — SM-2間隔反復アルゴリズム
  types.ts     — Card, Deck, Rating型定義
public/
  deck.json    — デフォルトデッキ（698枚の日本語単語）
  sql-wasm.wasm — SQLite WASM（apkgパース用）
app.json       — Even Hubマニフェスト
```

## ビルド・デプロイ
```bash
npm run dev           # 開発サーバー
npm run build         # ビルド（dist/）
npm run preview -- --host 0.0.0.0 --port 4173  # ローカルサーブ
evenhub qr --url "http://192.168.11.9:4173/"   # QR生成
evenhub pack app.json dist -o even-anki.ehpk   # パッケージ化
git push origin main  # GitHub Pages自動デプロイ
```

## アーキテクチャ上の注意

### ページ描画
- `createStartUpPageContainer` は初回1回のみ。以降は `rebuildPageContainer`
- 1ページに `isEventCapture: 1` は1つだけ

### イベント
- リングタップの eventType は `undefined` → `CLICK_EVENT` として扱う
- `textEvent` と `sysEvent` の両方をチェックする

### ストレージ
- WebViewの localStorage は `.ehpk` パッケージでは揮発する
- `bridge.setLocalStorage` / `getLocalStorage`（SDKストレージ）で永続化
- 起動時: SDKストレージ → localStorage に同期
- 保存時: localStorage + SDKストレージの両方に書く

### やってはいけないこと
- `history.replaceState` → ブリッジが壊れる
- `createStartUpPageContainer` を複数回呼ぶ → イベント消える
- iOSでファイル入力の `accept` に `.apkg` を指定 → グレーアウトされる（`*/*` を使う）

## G2操作フロー
```
起動 → デッキ選択（複数時）→ 学習セッション → 復習完了
        ↑ 2tap                 ↑ 2tap(裏面=キャンセル)
        ↓ tap                  ↓ tap(表面=めくる, 裏面=確定)
        終了(shutDownPageContainer)
```
