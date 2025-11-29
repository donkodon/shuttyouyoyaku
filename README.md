# 出張買取予約システム

## プロジェクト概要
- **名前**: 出張買取予約システム
- **目的**: お客様からの出張買取の予約を受け付け、管理するWebアプリケーション
- **主な機能**:
  - オンライン予約フォーム
  - 予約一覧の表示と管理
  - カレンダービューで予約状況の確認
  - レスポンシブデザイン（モバイル対応）

## 公開URL
- **開発環境**: https://3000-iwit4ph3ayvjkvip51awx-6532622b.e2b.dev
- **本番環境**: （未デプロイ）

## 完成した機能

### ✅ 実装済み機能
1. **予約フォーム**
   - お客様情報入力（名前、メール、電話番号、住所）
   - 予約日時の選択
   - 買取品目の選択（家電/家具/衣類/ブランド品/その他）
   - 品目詳細と概算点数の入力
   - 備考・要望の入力

2. **予約一覧管理**
   - 全予約の一覧表示
   - ステータスフィルター（予約受付/確定/完了/キャンセル）
   - 予約詳細情報の表示
   - リアルタイム更新機能

3. **カレンダー表示**
   - 月単位のカレンダービュー
   - 日別の予約件数表示
   - 予約がある日の視覚的ハイライト
   - 月の切り替え機能

4. **バックエンドAPI**
   - `POST /api/reservations` - 予約登録
   - `GET /api/reservations` - 予約一覧取得（フィルター対応）
   - `GET /api/reservations/:id` - 予約詳細取得
   - `PUT /api/reservations/:id` - 予約更新
   - `DELETE /api/reservations/:id` - 予約削除
   - `GET /api/calendar` - カレンダー用データ取得

### 📋 APIエンドポイント一覧

| メソッド | パス | パラメータ | 説明 |
|---------|------|----------|------|
| POST | `/api/reservations` | Body: JSON | 新規予約を登録 |
| GET | `/api/reservations` | Query: status, date, limit, offset | 予約一覧を取得 |
| GET | `/api/reservations/:id` | Path: id | 特定の予約詳細を取得 |
| PUT | `/api/reservations/:id` | Path: id, Body: JSON | 予約情報を更新 |
| DELETE | `/api/reservations/:id` | Path: id | 予約を削除 |
| GET | `/api/calendar` | Query: year, month | カレンダー用の月別予約情報 |

### 📊 予約登録APIの例
```bash
curl -X POST https://3000-iwit4ph3ayvjkvip51awx-6532622b.e2b.dev/api/reservations \
  -H "Content-Type: application/json" \
  -d '{
    "customer_name": "田中太郎",
    "customer_email": "tanaka@example.com",
    "customer_phone": "090-1234-5678",
    "customer_postal_code": "100-0001",
    "customer_address": "東京都千代田区千代田1-1-1",
    "reservation_date": "2025-12-05",
    "reservation_time": "10:00",
    "item_category": "家電",
    "item_description": "テレビ、冷蔵庫、洗濯機",
    "estimated_quantity": 3,
    "customer_notes": "午前中希望です"
  }'
```

## 未実装の機能

### 🔜 今後の実装候補
1. **メール通知機能**
   - 予約完了時のお客様への自動メール送信
   - 管理者への新規予約通知

2. **認証・権限管理**
   - 管理者ログイン機能
   - お客様用マイページ
   - 予約内容の編集権限

3. **写真アップロード**
   - 買取品の事前写真アップロード機能
   - Cloudflare R2を使った画像保存

4. **出張エリアチェック**
   - 郵便番号による出張可能エリアの自動判定
   - 対応エリア外の場合の代替提案

5. **概算見積もり機能**
   - 品目と状態に基づく買取価格の概算表示
   - AI画像認識による自動査定

6. **予約のキャンセル・変更**
   - お客様による予約のキャンセル機能
   - 日時変更のリクエスト機能

7. **レポート機能**
   - 月別/日別の予約統計
   - 品目別の買取実績分析
   - CSV/PDFエクスポート

## データアーキテクチャ

### データモデル
**reservations テーブル**
```sql
- id (INTEGER, PRIMARY KEY) - 予約ID
- customer_name (TEXT) - お客様名
- customer_email (TEXT) - メールアドレス
- customer_phone (TEXT) - 電話番号
- customer_postal_code (TEXT) - 郵便番号
- customer_address (TEXT) - 住所
- reservation_date (TEXT) - 予約日 (YYYY-MM-DD)
- reservation_time (TEXT) - 予約時間 (HH:MM)
- item_category (TEXT) - 品目カテゴリ
- item_description (TEXT) - 品目詳細
- estimated_quantity (INTEGER) - 概算点数
- status (TEXT) - ステータス (pending/confirmed/completed/cancelled)
- notes (TEXT) - 管理者メモ
- customer_notes (TEXT) - お客様からの備考
- created_at (DATETIME) - 作成日時
- updated_at (DATETIME) - 更新日時
```

### ストレージサービス
- **Cloudflare D1 Database**: SQLiteベースのグローバル分散データベース
  - 予約情報の永続化
  - ローカル開発環境では自動的にローカルSQLiteを使用
  - 本番環境ではCloudflare D1を使用

### データフロー
1. お客様がWebフォームから予約情報を入力
2. フロントエンドがAPI経由でバックエンドに送信
3. Honoバックエンドがバリデーション実行
4. D1データベースに予約データを保存
5. 成功レスポンスをフロントエンドに返却
6. 予約完了メッセージをお客様に表示

## 利用方法

### お客様向け
1. **予約する**ボタンをクリック
2. 必要事項を入力（名前、連絡先、住所、希望日時、買取品目）
3. 「予約を送信」ボタンをクリック
4. 予約完了のメッセージを確認

### 管理者向け
1. **予約一覧**で全ての予約を確認
2. ステータスフィルターで絞り込み
3. **カレンダー**で月別の予約状況を視覚的に確認
4. 各予約の詳細情報を確認

## デプロイ情報

### プラットフォーム
- **開発**: Cloudflare Pages (ローカル開発環境)
- **本番**: Cloudflare Pages（未デプロイ）
- **データベース**: Cloudflare D1

### 技術スタック
- **フレームワーク**: Hono (TypeScript)
- **フロントエンド**: TailwindCSS, Font Awesome, Axios
- **バックエンド**: Hono + Cloudflare Workers
- **データベース**: Cloudflare D1 (SQLite)
- **ビルドツール**: Vite
- **プロセス管理**: PM2

### ステータス
- ✅ 開発環境: 稼働中
- ❌ 本番環境: 未デプロイ

### 最終更新日
2025-11-29

## 推奨される次のステップ

1. **メール通知機能の実装**
   - SendGridやResendなどのメールAPIと連携
   - 予約完了時の自動メール送信

2. **管理者認証の追加**
   - 予約一覧へのアクセス制限
   - Cloudflare Access等の認証機能導入

3. **本番環境へのデプロイ**
   - Cloudflare Pagesへの本番デプロイ
   - 独自ドメインの設定
   - 環境変数の設定

4. **予約編集機能の実装**
   - お客様による予約変更・キャンセル
   - 管理者によるステータス更新UI

5. **データバックアップの設定**
   - 定期的なデータエクスポート
   - D1データベースのバックアップ運用

## ローカル開発

### セットアップ
```bash
cd /home/user/webapp
npm install
npm run build
```

### 開発サーバー起動
```bash
# PM2で起動
pm2 start ecosystem.config.cjs

# ログ確認
pm2 logs webapp --nostream

# 停止
pm2 stop webapp
```

### データベース操作
```bash
# マイグレーション実行
npm run db:migrate:local

# テストデータ投入
npm run db:seed

# データベースリセット
npm run db:reset
```

## ライセンス
All rights reserved.
