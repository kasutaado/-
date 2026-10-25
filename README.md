# Void Studio — Multi-agent Web Builder

Node.js + Express で動く日本語Webアプリです。チャットで開発を依頼し、既存のテキストファイルやZIP形式のプロジェクトを添付し、AIが生成したコードZIPをダウンロードできます。追加のチャットで既存プロジェクトを段階的に改善できます。

## 機能

- モダンなチャットUI、会話履歴、複数ターンでの改善
- 複数AIエージェントによる計画・並列タスク・QA・統合
- テキストファイルとZIPプロジェクトのアップロード
- ZIPをAPIへ直接送らず、サーバー側で安全な範囲のテキストファイルを抽出してプロンプトへ含める方式
- コードZIP内に使い方の `README.md` を含める
- AWS PostgreSQLへの会話・実行結果・生成ZIPの保存（Renderの一時ファイルシステムに依存しない）
- Renderへのデプロイ用 `render.yaml`

## ローカルで実行

Node.js 20以上を用意し、プロジェクトルートで実行します。

```bash
npm install
cp .env.example .env
# .env を編集し、APIキーとDATABASE_URLを設定
npm start
```

ブラウザで `http://localhost:3000` を開きます。CLIを使う場合は `npm run cli` を使用できます。

## 環境変数

- `API_BASE_URL`: OpenAI互換APIのベースURL
- `API_KEY`: APIキー
- `DATABASE_URL`: AWS RDS PostgreSQL接続URL（本番では必須）
- `PGSSLMODE`: 通常 `require`。TLS証明書を検証しないSSL設定を使うため、接続先を信頼できるAWS RDSに限定してください
- `MODEL_PLANNER`, `MODEL_RESEARCHER`, `MODEL_CODER`, `MODEL_CRITIC`, `MODEL_SYNTHESIZER`: 各エージェントのモデル名
- `REQUEST_TIMEOUT_MS`: APIリクエストのタイムアウト（ミリ秒）
- `MAX_UPLOAD_MB`: 1ファイルあたりのアップロード上限（既定20MB）
- `PORT`: Webサーバーポート（Renderが自動設定）

## ZIPアップロードの仕組みと制限

ZIPバイナリをAI APIへ送るのではなく、Node.jsサーバー上でZIPを展開し、対応するテキストファイルの内容をプロンプトに含めます。ファイルの安全な相対パスを検証し、`node_modules`、`.git`、`dist`、`build`、`.venv` 等は除外します。1 ZIP内300エントリまで、ZIPから抽出するテキストは合計5MBまで、1ファイル1MBまでです。添付ファイルはAIのコンテキスト上限により一部が切り詰められる場合があります。画像・PDF等は現在内容を解析せず、ファイル名のみ共有します。

## Renderへデプロイ

1. このプロジェクトをGitHubリポジトリへpushします。
2. Renderで **New + → Blueprint** を選び、リポジトリを接続して `render.yaml` を読み込みます。通常のWeb Serviceを作成する場合は Build Command=`npm install`、Start Command=`npm start`、Health Check Path=`/api/health` を指定します。
3. Renderのサービス設定で環境変数を設定します。最低限 `API_BASE_URL`、`API_KEY`、`DATABASE_URL` が必要です。モデル名はAPI提供元で利用可能な値を設定してください。
4. AWS RDS側でDBとユーザーを作成し、Renderから接続できるようにします。RDSをPublicly accessibleにする場合でも、セキュリティグループは可能な限りRenderの送信元に限定し、DBポートをインターネット全体へ無制限に開放しないでください。Renderの送信元IPが固定でないプランでは、Private networking/VPN等の安全な接続方式を検討してください。
5. RenderのデプロイログでDB初期化と `Web app listening on port ...` を確認し、`https://<service>.onrender.com/api/health` が `{"ok":true,...}` を返すことを確認します。

初回起動時に必要なテーブルは自動作成します。AWS PostgreSQLで接続に失敗する場合、DBのホスト名、ポート5432、DB名、ユーザー権限、TLS、VPC/セキュリティグループを確認してください。`DATABASE_URL` は秘密情報なので、ソースコードや公開リポジトリに書かないでください。

## 生成物と永続化

実行ごとに `data/runs/<run-id>/result.json` と `code_artifacts.zip` をローカルに生成します。Webアプリでは、完成ZIPと実行結果もPostgreSQLに保存するため、Renderのインスタンス再起動後もダウンロードできます。コードを生成しなかった実行ではZIPボタンは表示されません。

## 注意

- AIが出力したコードは未検証の可能性があります。実行前にレビューとテストを行ってください。
- Webアプリにはユーザー認証を組み込んでいません。公開運用する場合は、アクセス制御やレート制限を追加してから利用してください。
- API処理は同期HTTPリクエストです。長時間タスクがRenderのリクエスト制限を超える場合は、ジョブキューとステータスのポーリングへ拡張してください。
