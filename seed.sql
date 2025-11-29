-- テストデータ挿入
INSERT OR IGNORE INTO reservations (
  customer_name, customer_email, customer_phone, 
  customer_postal_code, customer_address,
  reservation_date, reservation_time,
  item_category, item_description, estimated_quantity,
  status, customer_notes
) VALUES 
  (
    '山田太郎', 'yamada@example.com', '090-1234-5678',
    '100-0001', '東京都千代田区千代田1-1',
    '2025-12-01', '10:00',
    '家電', 'テレビ、冷蔵庫、洗濯機', 3,
    'pending', '午前中希望です'
  ),
  (
    '佐藤花子', 'sato@example.com', '080-9876-5432',
    '150-0002', '東京都渋谷区渋谷2-2-2',
    '2025-12-02', '14:00',
    'ブランド品', 'バッグ、財布、時計など', 5,
    'confirmed', '玄関先での対応でお願いします'
  ),
  (
    '田中一郎', 'tanaka@example.com', '070-1111-2222',
    '160-0023', '東京都新宿区西新宿3-3-3',
    '2025-12-03', '16:00',
    '家具', 'ソファー、テーブル、椅子', 4,
    'pending', '2階からの搬出が必要です'
  );
