# 麻雀試合記録

4人麻雀の試合結果、節間成績、全体成績を記録する静的Webアプリです。

## 機能

- 選手の追加、編集、削除
- 4人固定の試合結果入力
- 東南西北の席登録
- 30000点返し、順位点 `+30 / +10 / -10 / -30`
- 同着時の順位点折半
- 16試合ごとの節管理
- 試合一覧、試合詳細
- 節間ランキング、全体ランキング
- 個人成績、平均順位、順位回数

## ローカル確認

```bash
python3 -m http.server 5173
```

ブラウザで `http://localhost:5173` を開きます。

`config.js` が未設定の場合は端末内保存で動きます。この状態では他の人とはデータ共有されません。

## Supabase設定

1. Supabaseでプロジェクトを作成
2. SQL Editorで `schema.sql` の内容を実行
3. `config.example.js` を参考に `config.js` を編集

```js
window.MAJAN_CONFIG = {
  supabaseUrl: "https://YOUR_PROJECT.supabase.co",
  supabaseAnonKey: "YOUR_SUPABASE_ANON_KEY"
};
```

GitHub Pagesで公開する場合は `config.js` も公開されます。Supabaseの anon key は公開前提ですが、このアプリはログインなしで全員が読み書きできるポリシーになっています。URLを知っている人だけに共有する前提で使ってください。

## GitHub Pages

GitHubのリポジトリ設定から Pages を有効にし、branch を `main`、folder を `/root` に設定すると公開できます。
