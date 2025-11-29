import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { serveStatic } from 'hono/cloudflare-workers'
import { adminHTML } from './admin.html'

type Bindings = {
  DB: D1Database;
}

const app = new Hono<{ Bindings: Bindings }>()

// CORS設定
app.use('/api/*', cors())

// 静的ファイル配信
app.use('/static/*', serveStatic({ root: './' }))

// データベース初期化関数
async function initializeDatabase(db: D1Database) {
  await db.batch([
    db.prepare(`
      CREATE TABLE IF NOT EXISTS reservations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_name TEXT NOT NULL,
        customer_email TEXT NOT NULL,
        customer_phone TEXT NOT NULL,
        customer_postal_code TEXT NOT NULL,
        customer_address TEXT NOT NULL,
        reservation_date TEXT NOT NULL,
        reservation_time TEXT NOT NULL,
        item_category TEXT NOT NULL,
        item_description TEXT,
        estimated_quantity INTEGER,
        status TEXT NOT NULL DEFAULT 'pending',
        notes TEXT,
        customer_notes TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_reservation_date ON reservations(reservation_date)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_customer_email ON reservations(customer_email)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_status ON reservations(status)'),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_created_at ON reservations(created_at)'),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS admins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `),
    db.prepare(`
      CREATE TABLE IF NOT EXISTS unavailable_dates (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date TEXT UNIQUE NOT NULL,
        reason TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `),
    db.prepare('CREATE INDEX IF NOT EXISTS idx_unavailable_dates ON unavailable_dates(date)'),
    db.prepare("INSERT OR IGNORE INTO admins (username, password_hash) VALUES ('admin', 'admin123')")
  ]);
}

// エリアチェック関数（都内・横浜市）
function isValidArea(postalCode: string, address: string): boolean {
  // 東京都の郵便番号範囲: 100-0000 〜 199-9999, 200-0000 〜 209-9999
  const tokyoPostalPattern = /^(1[0-9]{2}|20[0-9])-\d{4}$/;
  
  // 横浜市の郵便番号範囲: 220-0000 〜 247-9999
  const yokohamaPostalPattern = /^(22[0-9]|23[0-9]|24[0-7])-\d{4}$/;
  
  // 住所チェック
  const isTokyoAddress = address.includes('東京都');
  const isYokohamaAddress = address.includes('横浜市');
  
  return (tokyoPostalPattern.test(postalCode) && isTokyoAddress) ||
         (yokohamaPostalPattern.test(postalCode) && isYokohamaAddress);
}

// 時間帯のマッピング
const TIME_SLOTS = {
  '1': '10:00',
  '2': '12:00',
  '3': '14:00',
  '4': '16:00'
};

// API: 予約一覧取得
app.get('/api/reservations', async (c) => {
  try {
    const { env } = c;
    await initializeDatabase(env.DB);

    const { status, date, limit = '50', offset = '0' } = c.req.query();
    
    let query = 'SELECT * FROM reservations WHERE 1=1';
    const params: any[] = [];
    
    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }
    
    if (date) {
      query += ' AND reservation_date = ?';
      params.push(date);
    }
    
    query += ' ORDER BY reservation_date DESC, reservation_time DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));
    
    const { results } = await env.DB.prepare(query).bind(...params).all();
    
    return c.json({
      success: true,
      data: results,
      count: results.length
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

// API: 予約詳細取得
app.get('/api/reservations/:id', async (c) => {
  try {
    const { env } = c;
    await initializeDatabase(env.DB);
    
    const id = c.req.param('id');
    const { results } = await env.DB.prepare(
      'SELECT * FROM reservations WHERE id = ?'
    ).bind(id).all();
    
    if (results.length === 0) {
      return c.json({
        success: false,
        error: '予約が見つかりません'
      }, 404);
    }
    
    return c.json({
      success: true,
      data: results[0]
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

// API: 予約登録
app.post('/api/reservations', async (c) => {
  try {
    const { env } = c;
    await initializeDatabase(env.DB);
    
    const body = await c.req.json();
    const {
      customer_name,
      customer_email,
      customer_phone,
      customer_postal_code,
      customer_address,
      reservation_date,
      reservation_time,
      item_category,
      item_description,
      estimated_quantity,
      customer_notes
    } = body;
    
    // バリデーション
    if (!customer_name || !customer_email || !customer_phone || 
        !customer_postal_code || !customer_address ||
        !reservation_date || !reservation_time || !item_category) {
      return c.json({
        success: false,
        error: '必須項目が入力されていません'
      }, 400);
    }
    
    // エリアチェック
    if (!isValidArea(customer_postal_code, customer_address)) {
      return c.json({
        success: false,
        error: '申し訳ございません。ご指定のエリアは出張対応エリア外です。（対応エリア：東京都内、横浜市）'
      }, 400);
    }
    
    // 不可日チェック
    const { results: unavailableCheck } = await env.DB.prepare(
      'SELECT * FROM unavailable_dates WHERE date = ?'
    ).bind(reservation_date).all();
    
    if (unavailableCheck.length > 0) {
      return c.json({
        success: false,
        error: 'その日は出張対応できません。別の日付をお選びください。'
      }, 400);
    }
    
    // 同日同時間帯の予約数チェック（1日4枠まで）
    const { results: sameTimeReservations } = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM reservations
      WHERE reservation_date = ? AND reservation_time = ?
      AND status != 'cancelled'
    `).bind(reservation_date, reservation_time).all();
    
    if (sameTimeReservations[0].count >= 1) {
      return c.json({
        success: false,
        error: 'その時間帯は既に予約が埋まっています。別の時間帯をお選びください。'
      }, 400);
    }
    
    // 同日の総予約数チェック
    const { results: sameDateReservations } = await env.DB.prepare(`
      SELECT COUNT(*) as count FROM reservations
      WHERE reservation_date = ?
      AND status != 'cancelled'
    `).bind(reservation_date).all();
    
    if (sameDateReservations[0].count >= 4) {
      return c.json({
        success: false,
        error: 'その日は既に予約が満員です。別の日付をお選びください。'
      }, 400);
    }
    
    const result = await env.DB.prepare(`
      INSERT INTO reservations (
        customer_name, customer_email, customer_phone,
        customer_postal_code, customer_address,
        reservation_date, reservation_time,
        item_category, item_description, estimated_quantity,
        customer_notes, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `).bind(
      customer_name, customer_email, customer_phone,
      customer_postal_code, customer_address,
      reservation_date, reservation_time,
      item_category, item_description || null, estimated_quantity || null,
      customer_notes || null
    ).run();
    
    return c.json({
      success: true,
      data: {
        id: result.meta.last_row_id,
        ...body
      }
    }, 201);
  } catch (error: any) {
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

// API: 予約更新（ステータス変更など）
app.put('/api/reservations/:id', async (c) => {
  try {
    const { env } = c;
    await initializeDatabase(env.DB);
    
    const id = c.req.param('id');
    const body = await c.req.json();
    
    const {
      status,
      notes,
      reservation_date,
      reservation_time
    } = body;
    
    let query = 'UPDATE reservations SET updated_at = CURRENT_TIMESTAMP';
    const params: any[] = [];
    
    if (status) {
      query += ', status = ?';
      params.push(status);
    }
    
    if (notes !== undefined) {
      query += ', notes = ?';
      params.push(notes);
    }
    
    if (reservation_date) {
      query += ', reservation_date = ?';
      params.push(reservation_date);
    }
    
    if (reservation_time) {
      query += ', reservation_time = ?';
      params.push(reservation_time);
    }
    
    query += ' WHERE id = ?';
    params.push(id);
    
    await env.DB.prepare(query).bind(...params).run();
    
    return c.json({
      success: true,
      message: '予約を更新しました'
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

// API: 予約削除
app.delete('/api/reservations/:id', async (c) => {
  try {
    const { env } = c;
    await initializeDatabase(env.DB);
    
    const id = c.req.param('id');
    await env.DB.prepare('DELETE FROM reservations WHERE id = ?').bind(id).run();
    
    return c.json({
      success: true,
      message: '予約を削除しました'
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

// API: カレンダー用の日付別予約数取得
app.get('/api/calendar', async (c) => {
  try {
    const { env } = c;
    await initializeDatabase(env.DB);
    
    const { year, month } = c.req.query();
    
    if (!year || !month) {
      return c.json({
        success: false,
        error: 'year と month パラメータが必要です'
      }, 400);
    }
    
    // 月の最初と最後の日を計算
    const startDate = `${year}-${month.padStart(2, '0')}-01`;
    const nextMonth = parseInt(month) === 12 ? 1 : parseInt(month) + 1;
    const nextYear = parseInt(month) === 12 ? parseInt(year) + 1 : parseInt(year);
    const endDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
    
    const { results } = await env.DB.prepare(`
      SELECT 
        reservation_date,
        COUNT(*) as count,
        GROUP_CONCAT(reservation_time) as times
      FROM reservations
      WHERE reservation_date >= ? AND reservation_date < ?
      AND status != 'cancelled'
      GROUP BY reservation_date
      ORDER BY reservation_date
    `).bind(startDate, endDate).all();
    
    return c.json({
      success: true,
      data: results
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

// ========== 管理者用API ==========

// API: 管理者ログイン
app.post('/api/admin/login', async (c) => {
  try {
    const { env } = c;
    await initializeDatabase(env.DB);
    
    const { username, password } = await c.req.json();
    
    const { results } = await env.DB.prepare(
      'SELECT * FROM admins WHERE username = ? AND password_hash = ?'
    ).bind(username, password).all();
    
    if (results.length === 0) {
      return c.json({
        success: false,
        error: 'ユーザー名またはパスワードが間違っています'
      }, 401);
    }
    
    return c.json({
      success: true,
      data: {
        username: results[0].username
      }
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

// API: 管理者用カレンダー（スロット詳細込み）
app.get('/api/admin/calendar', async (c) => {
  try {
    const { env } = c;
    await initializeDatabase(env.DB);
    
    const { year, month } = c.req.query();
    
    if (!year || !month) {
      return c.json({
        success: false,
        error: 'year と month パラメータが必要です'
      }, 400);
    }
    
    const startDate = `${year}-${month.padStart(2, '0')}-01`;
    const nextMonth = parseInt(month) === 12 ? 1 : parseInt(month) + 1;
    const nextYear = parseInt(month) === 12 ? parseInt(year) + 1 : parseInt(year);
    const endDate = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
    
    // 予約データ取得
    const { results: reservations } = await env.DB.prepare(`
      SELECT 
        reservation_date,
        reservation_time,
        COUNT(*) as count
      FROM reservations
      WHERE reservation_date >= ? AND reservation_date < ?
      AND status != 'cancelled'
      GROUP BY reservation_date, reservation_time
      ORDER BY reservation_date, reservation_time
    `).bind(startDate, endDate).all();
    
    // 不可日取得
    const { results: unavailableDates } = await env.DB.prepare(`
      SELECT date, reason FROM unavailable_dates
      WHERE date >= ? AND date < ?
    `).bind(startDate, endDate).all();
    
    return c.json({
      success: true,
      data: {
        reservations,
        unavailableDates
      }
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

// API: 出張不可日の追加
app.post('/api/admin/unavailable-dates', async (c) => {
  try {
    const { env } = c;
    await initializeDatabase(env.DB);
    
    const { date, reason } = await c.req.json();
    
    await env.DB.prepare(
      'INSERT OR REPLACE INTO unavailable_dates (date, reason) VALUES (?, ?)'
    ).bind(date, reason || '').run();
    
    return c.json({
      success: true,
      message: '出張不可日を設定しました'
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

// API: 出張不可日の削除
app.delete('/api/admin/unavailable-dates/:date', async (c) => {
  try {
    const { env } = c;
    await initializeDatabase(env.DB);
    
    const date = c.req.param('date');
    
    await env.DB.prepare(
      'DELETE FROM unavailable_dates WHERE date = ?'
    ).bind(date).run();
    
    return c.json({
      success: true,
      message: '出張不可日を削除しました'
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

// API: エリアチェック
app.post('/api/check-area', async (c) => {
  try {
    const { postal_code, address } = await c.req.json();
    
    const isValid = isValidArea(postal_code, address);
    
    return c.json({
      success: true,
      isValid,
      message: isValid 
        ? '出張可能エリアです' 
        : '申し訳ございません。ご指定のエリアは出張対応エリア外です。（対応エリア：東京都内、横浜市）'
    });
  } catch (error: any) {
    return c.json({
      success: false,
      error: error.message
    }, 500);
  }
});

// 管理者画面のルート
app.get('/admin', (c) => {
  return c.html(adminHTML);
});

// フロントエンドのルート
app.get('/', (c) => {
  return c.html(`
    <!DOCTYPE html>
    <html lang="ja">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>出張買取予約システム</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
        <style>
            .calendar-day {
                min-height: 100px;
                border: 1px solid #e5e7eb;
            }
            .calendar-day:hover {
                background-color: #f9fafb;
            }
            .has-reservation {
                background-color: #fef3c7;
            }
        </style>
    </head>
    <body class="bg-gray-50">
        <nav class="bg-blue-600 text-white p-4 shadow-lg">
            <div class="container mx-auto flex justify-between items-center">
                <h1 class="text-2xl font-bold">
                    <i class="fas fa-truck mr-2"></i>
                    出張買取予約システム
                </h1>
                <div class="space-x-4">
                    <button onclick="showSection('booking')" class="hover:text-blue-200">
                        <i class="fas fa-calendar-plus mr-1"></i>予約する
                    </button>
                    <button onclick="showSection('list')" class="hover:text-blue-200">
                        <i class="fas fa-list mr-1"></i>予約一覧
                    </button>
                    <button onclick="showSection('calendar')" class="hover:text-blue-200">
                        <i class="fas fa-calendar mr-1"></i>カレンダー
                    </button>
                </div>
            </div>
        </nav>

        <div class="container mx-auto p-6">
            <!-- 予約フォームセクション -->
            <div id="booking-section" class="section">
                <div class="bg-white rounded-lg shadow-md p-6">
                    <h2 class="text-2xl font-bold mb-6 text-gray-800">
                        <i class="fas fa-calendar-plus mr-2 text-blue-600"></i>
                        出張買取のご予約
                    </h2>
                    
                    <!-- 注意事項 -->
                    <div class="mb-6 p-4 bg-blue-50 border-l-4 border-blue-500 text-sm">
                        <h3 class="font-bold text-blue-800 mb-2">
                            <i class="fas fa-info-circle mr-1"></i>ご予約前にご確認ください
                        </h3>
                        <ul class="space-y-1 text-blue-700">
                            <li><i class="fas fa-check mr-2"></i>対応エリア：東京都内、横浜市</li>
                            <li><i class="fas fa-check mr-2"></i>1日4枠限定での受付となります</li>
                            <li><i class="fas fa-check mr-2"></i>予約状況によりご希望に添えない場合がございます</li>
                        </ul>
                    </div>
                    
                    <form id="booking-form" class="space-y-4">
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">
                                    お名前 <span class="text-red-500">*</span>
                                </label>
                                <input type="text" name="customer_name" required
                                    class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                            </div>
                            
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">
                                    メールアドレス <span class="text-red-500">*</span>
                                </label>
                                <input type="email" name="customer_email" required
                                    class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                            </div>
                            
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">
                                    電話番号 <span class="text-red-500">*</span>
                                </label>
                                <input type="tel" name="customer_phone" required
                                    placeholder="090-1234-5678"
                                    class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                            </div>
                            
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">
                                    郵便番号 <span class="text-red-500">*</span>
                                </label>
                                <input type="text" name="customer_postal_code" required
                                    placeholder="100-0001"
                                    class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                            </div>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">
                                ご住所 <span class="text-red-500">*</span>
                            </label>
                            <input type="text" name="customer_address" required
                                placeholder="東京都千代田区千代田1-1-1"
                                class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                        </div>
                        
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">
                                    希望日 <span class="text-red-500">*</span>
                                </label>
                                <input type="date" name="reservation_date" required
                                    class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                            </div>
                            
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">
                                    希望時間帯 <span class="text-red-500">*</span>
                                </label>
                                <select name="reservation_time" required
                                    class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                                    <option value="">選択してください</option>
                                    <option value="10:00">10:00〜12:00</option>
                                    <option value="14:00">14:00〜16:00</option>
                                    <option value="16:00">16:00〜18:00</option>
                                </select>
                            </div>
                        </div>
                        
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">
                                    買取品目 <span class="text-red-500">*</span>
                                </label>
                                <select name="item_category" required
                                    class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                                    <option value="">選択してください</option>
                                    <option value="家電">家電</option>
                                    <option value="家具">家具</option>
                                    <option value="衣類">衣類</option>
                                    <option value="ブランド品">ブランド品</option>
                                    <option value="その他">その他</option>
                                </select>
                            </div>
                            
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">
                                    概算点数
                                </label>
                                <input type="number" name="estimated_quantity" min="1"
                                    class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                            </div>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">
                                品目の詳細
                            </label>
                            <textarea name="item_description" rows="3"
                                placeholder="例：テレビ（40型）、冷蔵庫、洗濯機など"
                                class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"></textarea>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">
                                ご要望・備考
                            </label>
                            <textarea name="customer_notes" rows="3"
                                placeholder="駐車場の有無、搬出経路、その他ご要望など"
                                class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"></textarea>
                        </div>
                        
                        <div class="flex justify-end space-x-4">
                            <button type="reset"
                                class="px-6 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50">
                                クリア
                            </button>
                            <button type="submit"
                                class="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                                <i class="fas fa-paper-plane mr-2"></i>
                                予約を送信
                            </button>
                        </div>
                    </form>
                </div>
            </div>

            <!-- 予約一覧セクション -->
            <div id="list-section" class="section hidden">
                <div class="bg-white rounded-lg shadow-md p-6">
                    <div class="flex justify-between items-center mb-6">
                        <h2 class="text-2xl font-bold text-gray-800">
                            <i class="fas fa-list mr-2 text-blue-600"></i>
                            予約一覧
                        </h2>
                        <div class="space-x-2">
                            <select id="status-filter" class="px-4 py-2 border border-gray-300 rounded-lg">
                                <option value="">全てのステータス</option>
                                <option value="pending">予約受付</option>
                                <option value="confirmed">確定</option>
                                <option value="completed">完了</option>
                                <option value="cancelled">キャンセル</option>
                            </select>
                            <button onclick="loadReservations()" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                                <i class="fas fa-sync-alt mr-1"></i>更新
                            </button>
                        </div>
                    </div>
                    
                    <div id="reservations-list" class="space-y-4">
                        <!-- 予約リストがここに表示されます -->
                    </div>
                </div>
            </div>

            <!-- カレンダーセクション -->
            <div id="calendar-section" class="section hidden">
                <div class="bg-white rounded-lg shadow-md p-6">
                    <div class="flex justify-between items-center mb-6">
                        <h2 class="text-2xl font-bold text-gray-800">
                            <i class="fas fa-calendar mr-2 text-blue-600"></i>
                            予約カレンダー
                        </h2>
                        <div class="flex items-center space-x-4">
                            <button onclick="changeMonth(-1)" class="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300">
                                <i class="fas fa-chevron-left"></i>
                            </button>
                            <span id="current-month" class="text-xl font-semibold"></span>
                            <button onclick="changeMonth(1)" class="px-3 py-1 bg-gray-200 rounded hover:bg-gray-300">
                                <i class="fas fa-chevron-right"></i>
                            </button>
                        </div>
                    </div>
                    
                    <div id="calendar-grid" class="grid grid-cols-7 gap-1">
                        <!-- カレンダーがここに表示されます -->
                    </div>
                </div>
            </div>
        </div>

        <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
        <script>
            let currentYear = new Date().getFullYear();
            let currentMonth = new Date().getMonth() + 1;

            // セクション切り替え
            function showSection(section) {
                document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));
                document.getElementById(section + '-section').classList.remove('hidden');
                
                if (section === 'list') {
                    loadReservations();
                } else if (section === 'calendar') {
                    loadCalendar();
                }
            }

            // 予約フォーム送信
            document.getElementById('booking-form').addEventListener('submit', async (e) => {
                e.preventDefault();
                
                const formData = new FormData(e.target);
                const data = Object.fromEntries(formData.entries());
                
                try {
                    const response = await axios.post('/api/reservations', data);
                    
                    if (response.data.success) {
                        alert('予約を受け付けました！\\n予約ID: ' + response.data.data.id);
                        e.target.reset();
                    }
                } catch (error) {
                    alert('エラーが発生しました: ' + (error.response?.data?.error || error.message));
                }
            });

            // 予約一覧読み込み
            async function loadReservations() {
                const status = document.getElementById('status-filter').value;
                const params = status ? { status } : {};
                
                try {
                    const response = await axios.get('/api/reservations', { params });
                    const list = document.getElementById('reservations-list');
                    
                    if (response.data.data.length === 0) {
                        list.innerHTML = '<p class="text-gray-500 text-center py-8">予約がありません</p>';
                        return;
                    }
                    
                    list.innerHTML = response.data.data.map(r => \`
                        <div class="border border-gray-200 rounded-lg p-4 hover:shadow-md transition">
                            <div class="flex justify-between items-start mb-2">
                                <div>
                                    <h3 class="text-lg font-bold">\${r.customer_name}</h3>
                                    <p class="text-sm text-gray-600">
                                        <i class="fas fa-calendar mr-1"></i>
                                        \${r.reservation_date} \${r.reservation_time}
                                    </p>
                                </div>
                                <span class="px-3 py-1 rounded-full text-sm font-semibold \${getStatusClass(r.status)}">
                                    \${getStatusLabel(r.status)}
                                </span>
                            </div>
                            <div class="grid grid-cols-2 gap-2 text-sm">
                                <p><i class="fas fa-phone mr-1 text-gray-400"></i>\${r.customer_phone}</p>
                                <p><i class="fas fa-envelope mr-1 text-gray-400"></i>\${r.customer_email}</p>
                                <p><i class="fas fa-map-marker-alt mr-1 text-gray-400"></i>\${r.customer_address}</p>
                                <p><i class="fas fa-box mr-1 text-gray-400"></i>\${r.item_category}</p>
                            </div>
                            \${r.item_description ? \`<p class="mt-2 text-sm text-gray-600">\${r.item_description}</p>\` : ''}
                            \${r.customer_notes ? \`<p class="mt-2 text-sm text-blue-600"><i class="fas fa-comment mr-1"></i>\${r.customer_notes}</p>\` : ''}
                        </div>
                    \`).join('');
                } catch (error) {
                    console.error('Error loading reservations:', error);
                }
            }

            // ステータスのクラスとラベル
            function getStatusClass(status) {
                const classes = {
                    pending: 'bg-yellow-100 text-yellow-800',
                    confirmed: 'bg-blue-100 text-blue-800',
                    completed: 'bg-green-100 text-green-800',
                    cancelled: 'bg-red-100 text-red-800'
                };
                return classes[status] || 'bg-gray-100 text-gray-800';
            }

            function getStatusLabel(status) {
                const labels = {
                    pending: '予約受付',
                    confirmed: '確定',
                    completed: '完了',
                    cancelled: 'キャンセル'
                };
                return labels[status] || status;
            }

            // カレンダー読み込み
            async function loadCalendar() {
                document.getElementById('current-month').textContent = 
                    \`\${currentYear}年\${currentMonth}月\`;
                
                try {
                    const response = await axios.get('/api/admin/calendar', {
                        params: { year: currentYear, month: currentMonth }
                    });
                    
                    const reservationMap = {};
                    response.data.data.reservations.forEach(item => {
                        if (!reservationMap[item.reservation_date]) {
                            reservationMap[item.reservation_date] = 0;
                        }
                        reservationMap[item.reservation_date] += item.count;
                    });
                    
                    const unavailableMap = {};
                    response.data.data.unavailableDates.forEach(item => {
                        unavailableMap[item.date] = item.reason;
                    });
                    
                    renderCalendar(reservationMap, unavailableMap);
                } catch (error) {
                    console.error('Error loading calendar:', error);
                }
            }

            // カレンダー描画
            function renderCalendar(reservationMap, unavailableMap) {
                const grid = document.getElementById('calendar-grid');
                const firstDay = new Date(currentYear, currentMonth - 1, 1).getDay();
                const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
                const today = new Date().toISOString().split('T')[0];
                
                const weekDays = ['日', '月', '火', '水', '木', '金', '土'];
                let html = weekDays.map(day => 
                    \`<div class="text-center font-bold p-2 bg-gray-100">\${day}</div>\`
                ).join('');
                
                for (let i = 0; i < firstDay; i++) {
                    html += '<div class="calendar-day"></div>';
                }
                
                for (let day = 1; day <= daysInMonth; day++) {
                    const date = \`\${currentYear}-\${String(currentMonth).padStart(2, '0')}-\${String(day).padStart(2, '0')}\`;
                    const count = reservationMap[date] || 0;
                    const isUnavailable = date in unavailableMap;  // 🔥 空文字列でもtrueになる
                    const isPast = new Date(date) < new Date(today);
                    
                    let cellClass = 'calendar-day p-2';
                    let cellStyle = '';
                    
                    if (isUnavailable) {
                        cellClass += ' bg-gray-300';
                        cellStyle = 'opacity: 0.7;';
                    } else if (count > 0) {
                        cellClass += ' has-reservation';
                    }
                    
                    html += \`
                        <div class="\${cellClass}" style="\${cellStyle}">
                            <div class="font-bold">\${day}</div>
                            \${isUnavailable ? \`
                                <div class="text-xs text-red-600 font-semibold mt-1">
                                    <i class="fas fa-ban"></i> 予約不可
                                </div>
                            \` : \`
                                \${count > 0 ? \`<div class="text-xs text-orange-600 mt-1">
                                    <i class="fas fa-calendar-check"></i> \${count}件
                                </div>\` : ''}
                            \`}
                        </div>
                    \`;
                }
                
                grid.innerHTML = html;
            }

            // 月変更
            function changeMonth(delta) {
                currentMonth += delta;
                if (currentMonth > 12) {
                    currentMonth = 1;
                    currentYear++;
                } else if (currentMonth < 1) {
                    currentMonth = 12;
                    currentYear--;
                }
                loadCalendar();
            }

            // ステータスフィルター
            document.getElementById('status-filter')?.addEventListener('change', loadReservations);
            
            // 初期表示
            document.addEventListener('DOMContentLoaded', () => {
                // 最小日付を今日に設定
                const today = new Date().toISOString().split('T')[0];
                document.querySelector('input[name="reservation_date"]').setAttribute('min', today);
            });
        </script>
    </body>
    </html>
  `)
});

export default app
