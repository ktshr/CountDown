# JST カウントダウンタイマー

名称と目標日時を登録し、日本標準時（`Asia/Tokyo`）で残り時間を整数時間として表示する、ホーム画面追加型の静的Webアプリです。データ送信、バックエンド、外部ライブラリは使用しません。

## 主な機能

- タイマーの登録・一覧・編集・確認付き削除（最大10件）
- 残り時間の四捨五入表示、期限後の「終了」表示、1分ごとの自動更新
- 目標日時順の表示、99暦年先までの入力検証
- 日本以外の端末タイムゾーンでも入力・計算・表示をJSTに固定
- `localStorage`への端末内保存と、不正データ・保存エラーへの安全な対処
- レスポンシブ表示、ダークモード、キーボード、セーフエリア対応
- Service Workerによるアプリ本体のオフラインキャッシュ

## ファイル構成

```text
index.html                 画面構造
css/styles.css             モバイルファーストの表示
js/app.js                  UIとイベント処理
js/countdown.js            JST日時・残り時間の純粋ロジック
js/storage.js              保存データの検証とlocalStorage処理
manifest.webmanifest       PWA設定
service-worker.js          オフラインキャッシュ
icons/                     Apple/PWA用PNGアイコン
tests/countdown.test.js     Node.js標準テスト
package.json               ES Modulesとテストコマンド
```

## テスト

Node.js 20以降を推奨します。追加パッケージのインストールは不要です。

```sh
npm test
```

または直接 `node --test` でも実行できます。

## GitHub Pagesへ公開する

1. このフォルダーをGitHubリポジトリへコミットしてpushします。
2. GitHubのリポジトリで **Settings → Pages** を開きます。
3. **Deploy from a branch** を選び、公開ブランチとルート（`/ (root)`）を指定します。
4. 表示されたHTTPSのURLへアクセスします。

URLは相対指定のため、`https://ユーザー名.github.io/リポジトリ名/` のようなサブディレクトリでも動作します。

このアプリの公開URLは次のとおりです。

<https://ktshr.github.io/CountDown/>

## ホーム画面から使う

### iPhone・iPad

1. アプリ内のQRコードをカメラで読み取るか、Safariで公開URLを開きます。
2. 共有ボタンをタップします。
3. 「ホーム画面に追加」を選びます。
4. 名前を確認して「追加」をタップします。

### Mac

Safariで公開URLを開き、「ファイル」→「Dockに追加」を選びます。通常のSafariタブでも全機能を利用できます。

## データとプライバシー

登録内容は利用中のブラウザーの`localStorage`だけに保存され、外部へ送信されません。異なる端末や異なるブラウザープロファイル間では同期されません。Safariの履歴・Webサイトデータを削除すると登録内容も失われます。プライベートブラウズや端末設定によって保存を利用できない場合は、画面にエラーを表示します。

## Service Workerを更新するとき

アプリ本体を変更したら、`service-worker.js`先頭の`CACHE_NAME`（例: `countdown-static-v3`）の末尾を`v4`のように必ず更新してください。新しいService Workerの有効化時に、このアプリの名前を持つ旧キャッシュだけを削除します。開発中に変更が見えない場合は、SafariのWebインスペクタでService Workerを登録解除して再読み込みするか、Webサイトデータを削除してください（後者は登録タイマーも消去します）。

オフライン動作の確認は、一度オンラインで全資産を読み込んだ後、ネットワークをオフラインにして再読み込みします。`localStorage`はキャッシュとは別なので、オフラインでも登録済みタイマーの閲覧・編集・削除ができます。
