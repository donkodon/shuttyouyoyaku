-- 出張買取予約テーブル
CREATE TABLE IF NOT EXISTS reservations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  -- お客様情報
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  customer_postal_code TEXT NOT NULL,
  customer_address TEXT NOT NULL,
  
  -- 予約情報
  reservation_date TEXT NOT NULL,  -- YYYY-MM-DD形式
  reservation_time TEXT NOT NULL,  -- HH:MM形式
  
  -- 買取品目情報
  item_category TEXT NOT NULL,  -- 家電/家具/衣類/ブランド品/その他
  item_description TEXT,  -- 品目の詳細説明
  estimated_quantity INTEGER,  -- 概算点数
  
  -- ステータス管理
  status TEXT NOT NULL DEFAULT 'pending',  -- pending/confirmed/completed/cancelled
  
  -- メモ
  notes TEXT,  -- 管理者メモ
  customer_notes TEXT,  -- お客様からの備考
  
  -- タイムスタンプ
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_reservation_date ON reservations(reservation_date);
CREATE INDEX IF NOT EXISTS idx_customer_email ON reservations(customer_email);
CREATE INDEX IF NOT EXISTS idx_status ON reservations(status);
CREATE INDEX IF NOT EXISTS idx_created_at ON reservations(created_at);
