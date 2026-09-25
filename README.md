# ことばカルテ

聞いたことある言葉の、出どころと背景。

意味や人物があいまいな有名フレーズから教養を学ぶためのWebアプリです。Tailscale内の同期サーバーを使い、端末間で進捗を共有できます。

## 利用URL

```text
https://mac-mini.tailec7e85.ts.net/
```

利用端末をTailscaleへ接続して開きます。GitHub Pages版は廃止し、GitHubリポジトリはソースコードと更新履歴の保管にのみ使用します。

現在、基礎教養として優先度の高いフレーズを500件収録しています。

## 実行方法

このフォルダで同期サーバーを起動します。

```bash
node server.mjs
```

ブラウザで以下を開きます。

```text
http://localhost:5174/
```

Tailscale Serveを設定した端末では、Tailnet内のHTTPS URLから開きます。進捗・お気に入り・文字サイズは操作のたびに `data/sync-state.json` へ即時保存されます。接続できないときは端末内のlocalStorageを使い、次回接続時にサーバーの状態を読み込みます。

このMacでは `deploy/com.kotoba-karute.sync.plist` をLaunchAgentとして登録し、ログイン時に同期サーバーを自動起動します。Tailscale Serveは `https://mac-mini.tailec7e85.ts.net/` をローカルの5174番へ接続します。

## データ検証

カードを追加したあとは、以下でデータ構造を確認します。

```bash
node scripts/validate-phrases.mjs
```

必須項目、ID重複、カテゴリ、status、fame、解説文の最低文字数をチェックします。

300件などの節目では、以下でカテゴリ分布や説明文量も確認します。

```bash
node scripts/audit-phrases.mjs
```

## データを追加する場所

カードデータは [phrases.js](/Users/gue1971/MyWorks/ブック・ノート/phrase-atlas/phrases.js) の `PHRASES` 配列に追加します。

検索対象は `phrase`, `original`, `person`, `person_en`, `summary`, `explanation`, `note`, `tags`, `fields`, `category` です。

## 追加テンプレート

```js
{
  id: "unique_id_here",
  phrase: "日本語でよく知られる言葉",
  original: "原語。なければ null",
  person: "人物名または出典",
  person_en: "英語名。なければ null",
  year: 1900,
  work: "関連著作。なければ null",
  category: "哲学・思想",
  fields: ["分野1", "分野2"],
  fame: 5,
  status: "原典に近い",
  summary: "一般的な説明を入れます。",
  explanation: "500〜700字程度の初学者向け解説を入れます。",
  note: "直引用ではない場合、伝承、定訳、後世の要約、誤解されやすい点を必ず書きます。",
  tags: ["検索タグ1", "検索タグ2"],
}
```

`status` は以下から選びます。

- 原典に近い
- 定訳
- 要約表現
- 伝承
- 概念語
- 誤解注意

`fame` は1から5の数値です。5がもっとも有名です。

## 実装済み機能

- フレーズ検索
- カテゴリフィルター
- 進捗フィルター
- 有名度順、年代順、人物名順の並び替え
- ランダムカード表示
- 詳細モーダル
- 進捗チェック
- localStorageへの自己評価保存
- スマホ向けレスポンシブ表示
