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

#### お客様向け機能
1. **予約フォーム**
   - お客様情報入力（名前、メール、電話番号、住所）
   - 予約日時の選択
   - 買取品目の選択（家電/家具/衣類/ブランド品/その他）
   - 品目詳細と概算点数の入力
   - 備考・要望の入力
   - **出張エリア自動チェック（都内・横浜市のみ対応）**
   - **予約枠の自動チェック（1日4枠まで）**

2. **予約一覧管理（お客様用）**
   - 全予約の一覧表示
   - ステータスフィルター（予約受付/確定/完了/キャンセル）
   - 予約詳細情報の表示
   - リアルタイム更新機能

3. **カレンダー表示（お客様用）**
   - 月単位のカレンダービュー
   - 日別の予約件数表示
   - 予約がある日の視覚的ハイライト
   - 月の切り替え機能

#### 管理者向け機能
4. **管理者認証システム**
   - ログイン機能（ユーザー名: admin, パスワード: admin123）
   - セッション管理
   - アクセス制限

5. **管理者専用カレンダー**
   - **1日4枠のスロット管理（10:00/12:00/14:00/16:00）**
   - 各枠の予約状況を視覚的に表示
   - 空き枠：緑色
   - 予約済み：赤色（グレーアウト）
   - 出張不可日：グレー背景

6. **出張不可日の設定機能**
   - カレンダーから直接設定・解除
   - 不可理由のメモ機能
   - 設定した日はグレーで表示され予約不可

7. **予約管理機能**
   - 予約詳細の確認
   - ステータス更新（確定/完了/キャンセル）
   - 予約一覧のフィルタリング
   - スロットクリックで予約詳細表示

8. **自動制御機能**
   - **出張エリアチェック（都内・横浜市）**
     - 郵便番号と住所の両方でバリデーション
     - エリア外の予約を自動拒否
   - **予約枠制限（1日4枠まで）**
     - 同じ時間帯に重複予約不可
     - 1日の予約が4件に達すると自動的に受付停止
   - **過去日の予約不可**
     - 当日より前の日付は自動的に予約不可

9. **バックエンドAPI**
   - `POST /api/reservations` - 予約登録
   - `GET /api/reservations` - 予約一覧取得（フィルター対応）
   - `GET /api/reservations/:id` - 予約詳細取得
   - `PUT /api/reservations/:id` - 予約更新
   - `DELETE /api/reservations/:id` - 予約削除
   - `GET /api/calendar` - カレンダー用データ取得
   - `POST /api/admin/login` - 管理者ログイン
   - `GET /api/admin/calendar` - 管理者用カレンダーデータ取得
   - `POST /api/admin/unavailable-dates` - 出張不可日の追加
   - `DELETE /api/admin/unavailable-dates/:date` - 出張不可日の削除
   - `POST /api/check-area` - エリアチェック

### 📋 APIエンドポイント一覧

#### お客様向けAPI
| メソッド | パス | パラメータ | 説明 |
|---------|------|----------|------|
| POST | `/api/reservations` | Body: JSON | 新規予約を登録（エリア・枠チェック含む） |
| GET | `/api/reservations` | Query: status, date, limit, offset | 予約一覧を取得 |
| GET | `/api/reservations/:id` | Path: id | 特定の予約詳細を取得 |
| GET | `/api/calendar` | Query: year, month | カレンダー用の月別予約情報 |
| POST | `/api/check-area` | Body: postal_code, address | 出張エリアチェック |

#### 管理者向けAPI
| メソッド | パス | パラメータ | 説明 |
|---------|------|----------|------|
| POST | `/api/admin/login` | Body: username, password | 管理者ログイン |
| GET | `/api/admin/calendar` | Query: year, month | 管理者用カレンダーデータ（スロット詳細含む） |
| POST | `/api/admin/unavailable-dates` | Body: date, reason | 出張不可日を追加 |
| DELETE | `/api/admin/unavailable-dates/:date` | Path: date | 出張不可日を削除 |
| PUT | `/api/reservations/:id` | Path: id, Body: JSON | 予約情報を更新（ステータス変更等） |
| DELETE | `/api/reservations/:id` | Path: id | 予約を削除 |

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
   - 予約リマインダー

2. **お客様用マイページ**
   - 予約履歴の確認
   - 予約内容の編集・キャンセル
   - お問い合わせ機能

3. **写真アップロード**
   - 買取品の事前写真アップロード機能
   - Cloudflare R2を使った画像保存
   - 画像プレビュー機能

4. **概算見積もり機能**
   - 品目と状態に基づく買取価格の概算表示
   - AI画像認識による自動査定
   - 見積もり履歴の管理

5. **レポート・分析機能**
   - 月別/日別の予約統計ダッシュボード
   - 品目別の買取実績分析
   - 売上レポート
   - CSV/PDFエクスポート

6. **高度な管理機能**
   - スタッフ管理（複数管理者）
   - 担当者の割り当て
   - 移動ルートの最適化
   - 売上管理

## データアーキテクチャ

### データモデル

**reservations テーブル（予約情報）**
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

**admins テーブル（管理者アカウント）**
```sql
- id (INTEGER, PRIMARY KEY) - 管理者ID
- username (TEXT, UNIQUE) - ユーザー名
- password_hash (TEXT) - パスワードハッシュ
- created_at (DATETIME) - 作成日時
```

**unavailable_dates テーブル（出張不可日）**
```sql
- id (INTEGER, PRIMARY KEY) - ID
- date (TEXT, UNIQUE) - 日付 (YYYY-MM-DD)
- reason (TEXT) - 理由
- created_at (DATETIME) - 作成日時
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

### お客様向け（トップページ）
1. **予約する**ボタンをクリック
2. 必要事項を入力
   - お客様情報（名前、メール、電話番号）
   - 住所（郵便番号、住所）※都内・横浜市のみ対応
   - 希望日時（利用可能な日時から選択）
   - 買取品目
3. 「予約を送信」ボタンをクリック
4. 予約完了のメッセージを確認

### 管理者向け（/admin）
#### ログイン
- URL: `/admin`
- ユーザー名: `admin`
- パスワード: `admin123`

#### カレンダー管理
1. カレンダーで月別の予約状況を確認
2. 各日に4つの時間枠が表示
   - **緑色ボタン**: 予約可能
   - **赤色ボタン**: 予約済み（クリックで詳細表示）
   - **グレー背景**: 出張不可日
3. 出張不可日の設定
   - カレンダーの日付右上のボタンをクリック
   - 禁止アイコン：出張不可に設定
   - チェックアイコン：出張可能に戻す

#### 予約管理
1. スロットをクリックして予約詳細を確認
2. ステータス更新ボタンで状態を変更
   - **確定**: 予約を確定
   - **完了**: 作業完了
   - **キャンセル**: 予約をキャンセル
3. 予約一覧タブで全予約を確認・管理

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

## 主な制約事項

### 出張対応エリア
- **東京都内全域**（郵便番号: 100-0000〜209-9999）
- **横浜市内全域**（郵便番号: 220-0000〜247-9999）

※上記以外のエリアからの予約は自動的に拒否されます

### 予約枠の制限
- **1日最大4枠まで**
  - 10:00〜12:00（1枠）
  - 12:00〜14:00（1枠）
  - 14:00〜16:00（1枠）
  - 16:00〜18:00（1枠）
- 各時間帯は1予約まで
- 過去の日付は予約不可
- 管理者が設定した出張不可日は予約不可

## 推奨される次のステップ

1. **本番環境へのデプロイ**
   - Cloudflare Pagesへの本番デプロイ
   - 独自ドメインの設定
   - 環境変数の設定

2. **メール通知機能の実装**
   - SendGridやResendなどのメールAPIと連携
   - 予約完了時の自動メール送信
   - 管理者への新規予約通知

3. **セキュリティ強化**
   - 管理者パスワードのハッシュ化（bcryptなど）
   - JWTによるトークン認証
   - CSRF対策

4. **お客様用マイページ**
   - 予約履歴の確認機能
   - 予約内容の変更・キャンセル機能

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
