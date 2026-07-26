# 希望休申請アプリ（Firebase版）セットアップ手順

## 1. Firebaseプロジェクトを作る
1. https://console.firebase.google.com にアクセスし、Googleアカウントでログイン
2. 「プロジェクトを追加」→ プロジェクト名を入力（例: kibokyu-app）→ 作成
3. 左メニュー「構築」→「Firestore Database」→「データベースの作成」
   - ロケーションは `asia-northeast1`（東京）を推奨
   - セキュリティルールは「本番環境モード」を選択（後で `firestore.rules` の内容に置き換えます）
4. 左メニューの歯車アイコン →「プロジェクトの設定」→ 下の方の「マイアプリ」→ `</>`（ウェブ）アイコンをクリックしてアプリを登録
5. 表示された `firebaseConfig` の値（apiKey, authDomain, projectId など）をコピー

## 2. コードに設定値を入れる
`src/firebase.js` を開き、`firebaseConfig` の中の `"YOUR_API_KEY"` などを、手順1でコピーした値に書き換えてください。

## 3. Firestoreのセキュリティルールを設定する
Firebaseコンソール →「Firestore Database」→「ルール」タブを開き、このプロジェクト内の `firestore.rules` の内容を貼り付けて「公開」してください。

※ このルールは「社内で使うことを前提に、誰でも読み書きできる」設定です。公開URLを社外に知られないよう注意してください。より厳密に守りたい場合は、Firebase Authentication（ログイン機能）の追加も可能です。ご希望があればお申し付けください。

## 4. ローカルで動作確認する
ターミナル（コマンドプロンプト）で、このフォルダに移動してから:

```bash
npm install
npm run dev
```

表示されたURL（例: http://localhost:5173）をブラウザで開いて動作を確認してください。

## 5. 公開する（Vercelの場合・無料）
1. https://vercel.com にアクセスし、GitHubアカウントなどでサインアップ
2. このフォルダをGitHubリポジトリにアップロード（GitHub Desktopなどが簡単です）
3. Vercelで「Add New Project」→ そのリポジトリを選択 → そのまま「Deploy」
4. 数分で `https://(プロジェクト名).vercel.app` のようなURLが発行されます。これを社員に共有してください

### Netlifyの場合
1. https://app.netlify.com でサインアップ
2. 「Add new site」→「Import an existing project」→ GitHubリポジトリを選択
3. ビルドコマンド: `npm run build` / 公開ディレクトリ: `dist` を指定してデプロイ

## 6. 初期設定
- 公開後、まず「管理者」タブを開き、初期PIN `1234` でログイン
- 「社員リストの管理」から、初期サンプル名を削除し、実際の社員名を登録
- 「管理者PINコードの変更」から、必ずPINを変更してください

## フォルダ構成
```
kibokyu-firebase/
  index.html          … アプリの入り口
  src/
    main.jsx          … Reactの起動処理
    firebase.js        … Firebase接続設定（★ここを書き換える）
    App.jsx            … アプリ本体（社員画面・管理者画面）
  firestore.rules       … Firestoreのセキュリティルール
  package.json
```

## 困ったときは
- 「Firebaseへの接続に失敗しました」と出る → `src/firebase.js` の設定値が正しいか確認してください
- データが保存されない → Firestoreの「ルール」タブで、上記ルールが公開済みか確認してください
