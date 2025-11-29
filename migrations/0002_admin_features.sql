-- 管理者テーブル
CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 出張不可日テーブル
CREATE TABLE IF NOT EXISTS unavailable_dates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT UNIQUE NOT NULL,  -- YYYY-MM-DD形式
  reason TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 予約枠設定テーブル（1日4枠固定だが、将来の拡張用）
CREATE TABLE IF NOT EXISTS daily_slots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,  -- YYYY-MM-DD形式
  slot_number INTEGER NOT NULL,  -- 1〜4
  time_slot TEXT NOT NULL,  -- 時間帯（10:00, 12:00, 14:00, 16:00）
  is_available INTEGER DEFAULT 1,  -- 1=利用可能, 0=利用不可
  reservation_id INTEGER,  -- 予約ID（外部キー）
  UNIQUE(date, slot_number),
  FOREIGN KEY (reservation_id) REFERENCES reservations(id)
);

-- インデックス作成
CREATE INDEX IF NOT EXISTS idx_unavailable_dates ON unavailable_dates(date);
CREATE INDEX IF NOT EXISTS idx_daily_slots_date ON daily_slots(date);
CREATE INDEX IF NOT EXISTS idx_daily_slots_reservation ON daily_slots(reservation_id);

-- デフォルト管理者アカウント（パスワード: admin123）
INSERT OR IGNORE INTO admins (username, password_hash) VALUES 
  ('admin', 'admin123');
