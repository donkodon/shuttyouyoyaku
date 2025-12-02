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
        customer_postal_code TEXT,
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
  
  // Add new columns if they don't exist (for existing databases)
  try {
    await db.prepare('ALTER TABLE reservations ADD COLUMN has_parking TEXT').run();
  } catch (e) {
    // Column already exists
  }
  try {
    await db.prepare('ALTER TABLE reservations ADD COLUMN has_elevator TEXT').run();
  } catch (e) {
    // Column already exists
  }
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
      customer_notes,
      has_parking,
      has_elevator
    } = body;
    
    // バリデーション（郵便番号は任意、エリアチェックなし）
    if (!customer_name || !customer_email || !customer_phone || 
        !customer_address ||
        !reservation_date || !reservation_time || !item_category ||
        !item_description || !estimated_quantity ||
        !has_parking || !has_elevator) {
      return c.json({
        success: false,
        error: '必須項目が入力されていません'
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
        customer_notes, has_parking, has_elevator, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `).bind(
      customer_name, customer_email, customer_phone,
      customer_postal_code || null, customer_address,
      reservation_date, reservation_time,
      item_category, item_description, estimated_quantity,
      customer_notes || null, has_parking, has_elevator
    ).run();
    
    const reservationId = result.meta.last_row_id;
    
    // メール送信（ログ出力）
    const timeSlotLabels = {
      '10:00': '10:00〜12:00',
      '12:00': '12:00〜14:00',
      '14:00': '14:00〜16:00',
      '16:00': '16:00〜18:00'
    };
    
    console.log('=== 予約確認メール送信 ===');
    console.log(`宛先: ${customer_email}`);
    console.log(`件名: 【出張買取予約システム】ご予約を承りました（予約ID: #${reservationId}）`);
    console.log(`本文:`);
    console.log(`
${customer_name} 様

この度は、出張買取予約システムをご利用いただき、誠にありがとうございます。
以下の内容でご予約を承りました。

━━━━━━━━━━━━━━━━━━━━━━━━━━
■ ご予約内容
━━━━━━━━━━━━━━━━━━━━━━━━━━
予約ID: #${reservationId}
予約日時: ${reservation_date} ${timeSlotLabels[reservation_time] || reservation_time}

■ お客様情報
お名前: ${customer_name}
電話番号: ${customer_phone}
メールアドレス: ${customer_email}
${customer_postal_code ? `郵便番号: 〒${customer_postal_code}\n` : ''}訪問先住所: ${customer_address}

■ 買取情報
買取品目: ${item_category}
品目の詳細: ${item_description}
概算点数: ${estimated_quantity}
駐車場: ${has_parking}
エレベーター: ${has_elevator}
${customer_notes ? `\nご要望・備考:\n${customer_notes}` : ''}

━━━━━━━━━━━━━━━━━━━━━━━━━━
【重要なご確認事項】
━━━━━━━━━━━━━━━━━━━━━━━━━━

★ ご予約当日、訪問先へ向かう前にお電話させていただきます。
  連絡が繋がらなかった場合、キャンセルとさせていただくことがございます。

★ ご本人様確認のため、運転免許証などの身分証明書をご用意ください。

━━━━━━━━━━━━━━━━━━━━━━━━━━

担当者より改めてご連絡させていただきます。
ご不明な点がございましたら、お気軽にお問い合わせください。

今後ともよろしくお願いいたします。

出張買取予約システム
    `);
    console.log('========================');
    
    return c.json({
      success: true,
      data: {
        id: reservationId,
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
// 管理者画面のルート
app.get('/admin', (c) => {
  c.header('Cache-Control', 'no-cache, no-store, must-revalidate');
  c.header('Pragma', 'no-cache');
  c.header('Expires', '0');
  return c.html(adminHTML);
});

// フロントエンドのルート
app.get('/', (c) => {
  c.header('Cache-Control', 'no-cache, no-store, must-revalidate');
  c.header('Pragma', 'no-cache');
  c.header('Expires', '0');
  return c.html(`
    <!DOCTYPE html>
    <html lang="ja">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">
        <meta http-equiv="Pragma" content="no-cache">
        <meta http-equiv="Expires" content="0">
        <title>出張買取予約システム</title>
        <script src="https://cdn.tailwindcss.com"></script>
        <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
        <style>
            .calendar-day {
                min-height: 140px;
                border: 1px solid #e5e7eb;
            }
            .calendar-day:hover {
                background-color: #f9fafb;
            }
            .has-reservation {
                background-color: #fef3c7;
            }
            @media (min-width: 768px) {
                .calendar-day {
                    min-height: 100px;
                }
            }
        </style>
    </head>
    <body class="bg-gray-50">
        <nav class="bg-blue-600 text-white p-4 shadow-lg">
            <div class="container mx-auto">
                <h1 class="text-2xl font-bold text-center">
                    <i class="fas fa-truck mr-2"></i>
                    出張買取予約システム
                </h1>
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
                            <li><i class="fas fa-phone mr-2"></i><span class="font-bold">ご予約当日、訪問先へ向かう前にお電話させていただきます</span><br><span class="text-sm">連絡が繋がらなかった場合、キャンセルとさせていただくことがございます</span></li>
                            <li><i class="fas fa-id-card mr-2"></i><span class="font-bold">ご本人様確認のため、運転免許証などの身分証明書をご用意ください</span></li>
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
                                    郵便番号
                                </label>
                                <input type="text" name="customer_postal_code"
                                    placeholder="100-0001"
                                    class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                            </div>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">
                                ご住所 <span class="text-red-500">*</span>
                            </label>
                            <input type="text" name="customer_address" required
                                placeholder="東京都千代田区千代田1-1-1 千代田マンション101号室"
                                class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                        </div>
                        
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">
                                    希望日 <span class="text-red-500">*</span>
                                </label>
                                <input type="date" id="reservation-date" name="reservation_date" required readonly
                                    class="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 cursor-not-allowed">
                            </div>
                            
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">
                                    希望時間帯 <span class="text-red-500">*</span>
                                </label>
                                <select id="reservation-time" name="reservation_time" required disabled
                                    class="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-100 cursor-not-allowed">
                                    <option value="">選択してください</option>
                                    <option value="10:00">10:00〜12:00</option>
                                    <option value="12:00">12:00〜14:00</option>
                                    <option value="14:00">14:00〜16:00</option>
                                    <option value="16:00">16:00〜18:00</option>
                                </select>
                            </div>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">
                                買取品目 <span class="text-red-500">*</span>（複数選択可）
                            </label>
                            <div class="grid grid-cols-2 md:grid-cols-4 gap-3 p-4 border border-gray-300 rounded-lg bg-gray-50">
                                <label class="flex items-center space-x-2 cursor-pointer">
                                    <input type="checkbox" name="item_category" value="家電" 
                                        class="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500">
                                    <span class="text-sm">家電</span>
                                </label>
                                <label class="flex items-center space-x-2 cursor-pointer">
                                    <input type="checkbox" name="item_category" value="家具"
                                        class="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500">
                                    <span class="text-sm">家具</span>
                                </label>
                                <label class="flex items-center space-x-2 cursor-pointer">
                                    <input type="checkbox" name="item_category" value="衣類"
                                        class="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500">
                                    <span class="text-sm">衣類</span>
                                </label>
                                <label class="flex items-center space-x-2 cursor-pointer">
                                    <input type="checkbox" name="item_category" value="ブランド品"
                                        class="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500">
                                    <span class="text-sm">ブランド品</span>
                                </label>
                                <label class="flex items-center space-x-2 cursor-pointer">
                                    <input type="checkbox" name="item_category" value="楽器"
                                        class="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500">
                                    <span class="text-sm">楽器</span>
                                </label>
                                <label class="flex items-center space-x-2 cursor-pointer">
                                    <input type="checkbox" name="item_category" value="おもちゃ"
                                        class="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500">
                                    <span class="text-sm">おもちゃ</span>
                                </label>
                                <label class="flex items-center space-x-2 cursor-pointer">
                                    <input type="checkbox" name="item_category" value="トレーディングカード"
                                        class="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500">
                                    <span class="text-sm">トレカ</span>
                                </label>
                                <label class="flex items-center space-x-2 cursor-pointer">
                                    <input type="checkbox" name="item_category" value="本"
                                        class="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500">
                                    <span class="text-sm">本</span>
                                </label>
                                <label class="flex items-center space-x-2 cursor-pointer">
                                    <input type="checkbox" name="item_category" value="ゲーム機本体"
                                        class="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500">
                                    <span class="text-sm">ゲーム機本体</span>
                                </label>
                                <label class="flex items-center space-x-2 cursor-pointer">
                                    <input type="checkbox" name="item_category" value="ゲームソフト"
                                        class="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500">
                                    <span class="text-sm">ゲームソフト</span>
                                </label>
                                <label class="flex items-center space-x-2 cursor-pointer">
                                    <input type="checkbox" name="item_category" value="携帯電話"
                                        class="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500">
                                    <span class="text-sm">携帯電話</span>
                                </label>
                                <label class="flex items-center space-x-2 cursor-pointer">
                                    <input type="checkbox" name="item_category" value="PC"
                                        class="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500">
                                    <span class="text-sm">PC</span>
                                </label>
                                <label class="flex items-center space-x-2 cursor-pointer">
                                    <input type="checkbox" name="item_category" value="バッグ"
                                        class="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500">
                                    <span class="text-sm">バッグ</span>
                                </label>
                                <label class="flex items-center space-x-2 cursor-pointer">
                                    <input type="checkbox" name="item_category" value="ジュエリー"
                                        class="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500">
                                    <span class="text-sm">ジュエリー</span>
                                </label>
                                <label class="flex items-center space-x-2 cursor-pointer">
                                    <input type="checkbox" name="item_category" value="貴金属"
                                        class="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500">
                                    <span class="text-sm">貴金属</span>
                                </label>
                                <label class="flex items-center space-x-2 cursor-pointer">
                                    <input type="checkbox" name="item_category" value="食器"
                                        class="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500">
                                    <span class="text-sm">食器</span>
                                </label>
                                <label class="flex items-center space-x-2 cursor-pointer">
                                    <input type="checkbox" name="item_category" value="雑貨"
                                        class="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500">
                                    <span class="text-sm">雑貨</span>
                                </label>
                                <label class="flex items-center space-x-2 cursor-pointer">
                                    <input type="checkbox" name="item_category" value="その他"
                                        class="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500">
                                    <span class="text-sm">その他</span>
                                </label>
                            </div>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">
                                概算点数 <span class="text-red-500">*</span>
                            </label>
                            <select name="estimated_quantity" required
                                class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                                <option value="">選択してください</option>
                                <option value="10点程度">10点程度</option>
                                <option value="10〜50点程度">10〜50点程度</option>
                                <option value="50〜100点程度">50〜100点程度</option>
                                <option value="100〜200点程度">100〜200点程度</option>
                                <option value="200点以上">200点以上</option>
                            </select>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">
                                品目の詳細 <span class="text-red-500">*</span>
                            </label>
                            <textarea name="item_description" rows="3" required
                                placeholder="例：テレビ1点、食器10点、ブランド品2点、本1箱など"
                                class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"></textarea>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-2">
                                建物情報 <span class="text-red-500">*</span>
                            </label>
                            <div class="grid grid-cols-2 gap-4 p-4 border border-gray-300 rounded-lg bg-gray-50">
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-2">駐車場</label>
                                    <div class="flex space-x-4">
                                        <label class="flex items-center space-x-2 cursor-pointer">
                                            <input type="radio" name="has_parking" value="あり" required
                                                class="w-4 h-4 text-blue-600 focus:ring-2 focus:ring-blue-500">
                                            <span class="text-sm">あり</span>
                                        </label>
                                        <label class="flex items-center space-x-2 cursor-pointer">
                                            <input type="radio" name="has_parking" value="なし" required
                                                class="w-4 h-4 text-blue-600 focus:ring-2 focus:ring-blue-500">
                                            <span class="text-sm">なし</span>
                                        </label>
                                    </div>
                                </div>
                                <div>
                                    <label class="block text-sm font-medium text-gray-700 mb-2">エレベーター</label>
                                    <div class="flex space-x-4">
                                        <label class="flex items-center space-x-2 cursor-pointer">
                                            <input type="radio" name="has_elevator" value="あり" required
                                                class="w-4 h-4 text-blue-600 focus:ring-2 focus:ring-blue-500">
                                            <span class="text-sm">あり</span>
                                        </label>
                                        <label class="flex items-center space-x-2 cursor-pointer">
                                            <input type="radio" name="has_elevator" value="なし" required
                                                class="w-4 h-4 text-blue-600 focus:ring-2 focus:ring-blue-500">
                                            <span class="text-sm">なし</span>
                                        </label>
                                    </div>
                                </div>
                            </div>
                        </div>
                        
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">
                                その他ご要望・備考
                            </label>
                            <textarea name="customer_notes" rows="3"
                                placeholder="搬出経路、その他ご要望など"
                                class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"></textarea>
                        </div>
                        
                        <div class="flex justify-between space-x-4">
                            <button type="button" onclick="showSection('calendar')"
                                class="px-6 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300">
                                <i class="fas fa-arrow-left mr-2"></i>
                                カレンダーに戻る
                            </button>
                            <div class="flex space-x-4">
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
            <div id="calendar-section" class="section hidden overflow-x-hidden">
                <div class="bg-white rounded-lg shadow-md overflow-x-hidden">
                    <!-- ヘッダー -->
                    <div class="p-4 border-b">
                        <div class="flex justify-between items-center mb-2">
                            <h2 class="text-xl font-bold text-gray-800">
                                <i class="fas fa-calendar mr-2 text-blue-600"></i>
                                予約カレンダー
                            </h2>
                        </div>
                        <p class="text-sm text-gray-600">
                            <i class="fas fa-info-circle mr-1"></i>
                            予約は4時間前まで受付可能です
                        </p>
                    </div>
                    
                    <!-- 月移動ボタン -->
                    <div class="p-4 border-b bg-gray-50">
                        <div class="flex justify-between items-center">
                            <button onclick="changeWeek(-1)" class="px-3 py-2 text-sm bg-white border rounded hover:bg-gray-100">
                                <i class="fas fa-chevron-left"></i> 前
                            </button>
                            <span id="current-week-label" class="text-sm font-semibold"></span>
                            <button onclick="changeWeek(1)" class="px-3 py-2 text-sm bg-white border rounded hover:bg-gray-100">
                                次 <i class="fas fa-chevron-right"></i>
                            </button>
                        </div>
                    </div>
                    
                    <!-- カレンダーテーブル -->
                    <div class="overflow-x-hidden">
                        <!-- 日付ヘッダー -->
                        <div class="border-b overflow-x-hidden">
                            <div id="date-header" class="flex w-full">
                                <!-- 日付ヘッダーがここに表示されます -->
                            </div>
                        </div>
                        
                        <!-- 時間帯スロット一覧 -->
                        <div class="overflow-y-auto overflow-x-hidden max-h-96">
                            <div id="time-slots-grid" class="w-full">
                                <!-- 時間帯スロットがここに表示されます -->
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 予約完了セクション -->
            <div id="confirmation-section" class="section hidden">
                <div class="max-w-3xl mx-auto bg-white rounded-lg shadow-md p-8">
                    <div class="text-center mb-6">
                        <div class="inline-block p-4 bg-green-100 rounded-full mb-4">
                            <i class="fas fa-check-circle text-6xl text-green-600"></i>
                        </div>
                        <h2 class="text-3xl font-bold text-gray-800 mb-2">予約が完了しました</h2>
                        <p class="text-gray-600 mb-4">ご予約ありがとうございます。確認メールを送信いたしました。</p>
                        
                        <!-- 重要事項 -->
                        <div class="mt-6 p-4 bg-yellow-50 border-l-4 border-yellow-500 text-left">
                            <h3 class="font-bold text-yellow-800 mb-2">
                                <i class="fas fa-exclamation-triangle mr-1"></i>重要なご確認事項
                            </h3>
                            <ul class="space-y-2 text-yellow-800">
                                <li class="flex items-start">
                                    <i class="fas fa-phone mt-1 mr-2"></i>
                                    <span><span class="font-bold">ご予約当日、訪問先へ向かう前にお電話させていただきます。</span><br>連絡が繋がらなかった場合、キャンセルとさせていただくことがございます。</span>
                                </li>
                                <li class="flex items-start">
                                    <i class="fas fa-id-card mt-1 mr-2"></i>
                                    <span><span class="font-bold">ご本人様確認のため、運転免許証などの身分証明書をご用意ください。</span></span>
                                </li>
                            </ul>
                        </div>
                    </div>
                    
                    <div class="border-t border-gray-200 pt-6">
                        <h3 class="text-xl font-bold text-gray-800 mb-4">
                            <i class="fas fa-clipboard-list mr-2 text-blue-600"></i>
                            ご予約内容
                        </h3>
                        
                        <div id="confirmation-details" class="space-y-4">
                            <!-- 予約詳細がここに表示されます -->
                        </div>
                    </div>
                    
                    <div class="mt-8 flex justify-center">
                        <button onclick="showSection('calendar')" 
                            class="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-lg">
                            <i class="fas fa-calendar mr-2"></i>
                            カレンダーに戻る
                        </button>
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
                
                // ページトップへスクロール
                window.scrollTo({ top: 0, behavior: 'smooth' });
                
                if (section === 'list') {
                    loadReservations();
                } else if (section === 'calendar') {
                    loadCalendar();
                }
            }

            // 予約フォーム送信
            document.getElementById('booking-form').addEventListener('submit', async (e) => {
                e.preventDefault();
                
                // チェックボックスの買取品目を取得
                const checkedCategories = Array.from(document.querySelectorAll('input[name="item_category"]:checked'))
                    .map(cb => cb.value);
                
                if (checkedCategories.length === 0) {
                    alert('買取品目を1つ以上選択してください。');
                    return;
                }
                
                // 送信前にdisabledを一時的に解除（FormDataに含めるため）
                const timeField = document.getElementById('reservation-time');
                timeField.removeAttribute('disabled');
                
                const formData = new FormData(e.target);
                const data = Object.fromEntries(formData.entries());
                
                // 複数選択された買取品目をカンマ区切りで結合
                data.item_category = checkedCategories.join(', ');
                
                // 再度disabledに戻す
                timeField.setAttribute('disabled', 'true');
                
                try {
                    const response = await axios.post('/api/reservations', data);
                    
                    if (response.data.success) {
                        // 完了画面を表示
                        showConfirmation(response.data.data);
                        e.target.reset();
                        // 日付と時間のフィールドをクリア
                        document.getElementById('reservation-date').value = '';
                        document.getElementById('reservation-time').value = '';
                    }
                } catch (error) {
                    alert('エラーが発生しました: ' + (error.response?.data?.error || error.message));
                    // エラー時もdisabledを維持
                    timeField.setAttribute('disabled', 'true');
                }
            });

            // 予約完了画面を表示
            function showConfirmation(reservationData) {
                const details = document.getElementById('confirmation-details');
                const timeSlotLabels = {
                    '10:00': '10:00〜12:00',
                    '12:00': '12:00〜14:00',
                    '14:00': '14:00〜16:00',
                    '16:00': '16:00〜18:00'
                };
                
                details.innerHTML = \`
                    <div class="bg-blue-50 p-4 rounded-lg">
                        <h4 class="font-bold text-gray-700 mb-3 text-lg">
                            <i class="fas fa-calendar-check mr-2 text-blue-600"></i>
                            予約日時
                        </h4>
                        <p class="text-2xl font-bold text-blue-700">
                            \${reservationData.reservation_date} \${timeSlotLabels[reservationData.reservation_time] || reservationData.reservation_time}
                        </p>
                    </div>
                    
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div class="bg-gray-50 p-4 rounded-lg">
                            <p class="text-sm text-gray-600 mb-1">お名前</p>
                            <p class="font-semibold text-gray-800">\${reservationData.customer_name}</p>
                        </div>
                        <div class="bg-gray-50 p-4 rounded-lg">
                            <p class="text-sm text-gray-600 mb-1">電話番号</p>
                            <p class="font-semibold text-gray-800">\${reservationData.customer_phone}</p>
                        </div>
                        <div class="bg-gray-50 p-4 rounded-lg">
                            <p class="text-sm text-gray-600 mb-1">メールアドレス</p>
                            <p class="font-semibold text-gray-800">\${reservationData.customer_email}</p>
                        </div>
                        \${reservationData.customer_postal_code ? \`
                            <div class="bg-gray-50 p-4 rounded-lg">
                                <p class="text-sm text-gray-600 mb-1">郵便番号</p>
                                <p class="font-semibold text-gray-800">〒\${reservationData.customer_postal_code}</p>
                            </div>
                        \` : ''}
                    </div>
                    
                    <div class="bg-green-50 p-4 rounded-lg">
                        <p class="text-sm text-gray-600 mb-2">
                            <i class="fas fa-map-marker-alt mr-1 text-green-600"></i>
                            訪問先住所
                        </p>
                        <p class="font-semibold text-gray-800 text-lg">\${reservationData.customer_address}</p>
                    </div>
                    
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div class="bg-gray-50 p-4 rounded-lg">
                            <p class="text-sm text-gray-600 mb-1">買取品目</p>
                            <p class="font-semibold text-gray-800">\${reservationData.item_category}</p>
                        </div>
                        <div class="bg-gray-50 p-4 rounded-lg">
                            <p class="text-sm text-gray-600 mb-1">概算点数</p>
                            <p class="font-semibold text-gray-800">\${reservationData.estimated_quantity}</p>
                        </div>
                        <div class="bg-gray-50 p-4 rounded-lg">
                            <p class="text-sm text-gray-600 mb-1">駐車場</p>
                            <p class="font-semibold text-gray-800">\${reservationData.has_parking}</p>
                        </div>
                        <div class="bg-gray-50 p-4 rounded-lg">
                            <p class="text-sm text-gray-600 mb-1">エレベーター</p>
                            <p class="font-semibold text-gray-800">\${reservationData.has_elevator}</p>
                        </div>
                    </div>
                    
                    <div class="bg-gray-50 p-4 rounded-lg">
                        <p class="text-sm text-gray-600 mb-2">品目の詳細</p>
                        <p class="font-semibold text-gray-800">\${reservationData.item_description}</p>
                    </div>
                    
                    \${reservationData.customer_notes ? \`
                        <div class="bg-yellow-50 p-4 rounded-lg">
                            <p class="text-sm text-gray-600 mb-2">
                                <i class="fas fa-comment mr-1 text-yellow-600"></i>
                                ご要望・備考
                            </p>
                            <p class="font-semibold text-gray-800">\${reservationData.customer_notes}</p>
                        </div>
                    \` : ''}
                    
                    <div class="bg-blue-50 p-4 rounded-lg text-center">
                        <p class="text-sm text-gray-600">予約ID</p>
                        <p class="text-2xl font-bold text-blue-700">#\${reservationData.id}</p>
                    </div>
                \`;
                
                showSection('confirmation');
                // ページトップへスクロール（確実に一番上から表示）
                setTimeout(() => window.scrollTo({ top: 0, behavior: 'instant' }), 100);
            }

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

            // 週の開始日を管理
            let weekStartDate = new Date();
            weekStartDate.setHours(0, 0, 0, 0);

            // カレンダー読み込み
            async function loadCalendar() {
                try {
                    // 週の開始日から7日分の日付を取得
                    const dates = [];
                    for (let i = 0; i < 7; i++) {
                        const date = new Date(weekStartDate);
                        date.setDate(weekStartDate.getDate() + i);
                        dates.push(date);
                    }
                    
                    // 表示期間のラベル更新
                    const startLabel = \`\${dates[0].getMonth() + 1}/\${dates[0].getDate()}\`;
                    const endLabel = \`\${dates[6].getMonth() + 1}/\${dates[6].getDate()}\`;
                    document.getElementById('current-week-label').textContent = \`\${startLabel} 〜 \${endLabel}\`;
                    
                    // APIから予約データを取得
                    const year = dates[0].getFullYear();
                    const month = dates[0].getMonth() + 1;
                    const response = await axios.get('/api/admin/calendar', {
                        params: { year, month }
                    });
                    
                    // 時間帯別予約マップ作成
                    const reservationMap = {};
                    response.data.data.reservations.forEach(item => {
                        if (!reservationMap[item.reservation_date]) {
                            reservationMap[item.reservation_date] = {};
                        }
                        reservationMap[item.reservation_date][item.reservation_time] = item.count;
                    });
                    
                    const unavailableMap = {};
                    response.data.data.unavailableDates.forEach(item => {
                        unavailableMap[item.date] = item.reason;
                    });
                    
                    renderCalendar(dates, reservationMap, unavailableMap);
                } catch (error) {
                    console.error('Error loading calendar:', error);
                }
            }

            // カレンダー描画（楽天ビューティー風）
            function renderCalendar(dates, reservationMap, unavailableMap) {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const now = new Date();
                
                const timeSlots = ['10:00', '12:00', '14:00', '16:00'];
                const slotLabels = ['10:00〜12:00', '12:00〜14:00', '14:00〜16:00', '16:00〜18:00'];
                const weekDays = ['日', '月', '火', '水', '木', '金', '土'];
                
                // 日付ヘッダーを生成
                let headerHtml = '<div style="width: 15%; min-width: 50px;" class="flex-shrink-0 p-1 border-r bg-gray-50"></div>'; // 左上の空白
                headerHtml += dates.map(date => {
                    const dateStr = date.toISOString().split('T')[0];
                    const isToday = date.getTime() === today.getTime();
                    const isPast = date < today;
                    const isUnavailable = dateStr in unavailableMap;
                    
                    return \`
                        <div style="width: 12.14%;" class="flex-shrink-0 p-1 text-center border-r \${isToday ? 'bg-pink-50' : 'bg-white'}">
                            <div class="text-xs text-gray-600">\${weekDays[date.getDay()]}</div>
                            <div class="text-xs font-bold \${isToday ? 'text-pink-600' : 'text-gray-800'}">
                                \${date.getMonth() + 1}/\${date.getDate()}
                            </div>
                            \${isUnavailable ? '<div class="text-xs text-red-600">×</div>' : ''}
                        </div>
                    \`;
                }).join('');
                
                document.getElementById('date-header').innerHTML = headerHtml;
                
                // 時間帯スロットを生成
                let slotsHtml = timeSlots.map((time, timeIdx) => {
                    let rowHtml = \`
                        <div class="flex border-b">
                            <div style="width: 15%; min-width: 50px;" class="flex-shrink-0 p-1 bg-gray-50 border-r text-xs font-medium flex items-center justify-center text-center">
                                \${slotLabels[timeIdx]}
                            </div>
                    \`;
                    
                    dates.forEach(date => {
                        const dateStr = date.toISOString().split('T')[0];
                        const isPast = date < today;
                        const isUnavailable = dateStr in unavailableMap;
                        const count = reservationMap[dateStr]?.[time] || 0;
                        const isBooked = count > 0;
                        
                        // 4時間前チェック
                        const [hour, minute] = time.split(':').map(Number);
                        const slotDateTime = new Date(date);
                        slotDateTime.setHours(hour, minute, 0, 0);
                        const fourHoursBefore = new Date(slotDateTime.getTime() - (4 * 60 * 60 * 1000));
                        const isTooLate = now >= fourHoursBefore;
                        
                        const isDisabled = isPast || isUnavailable || isBooked || isTooLate;
                        
                        let cellContent = '';
                        let cellClass = 'flex-shrink-0 p-2 border-r flex items-center justify-center';
                        
                        if (isDisabled) {
                            cellClass += ' bg-gray-100';
                            if (isBooked) {
                                cellContent = '<span class="text-red-500 font-bold text-lg">×</span>';
                            } else {
                                cellContent = '<span class="text-gray-400">−</span>';
                            }
                        } else {
                            cellClass += ' bg-white hover:bg-green-50 cursor-pointer';
                            cellContent = '<button class="text-green-600 font-bold text-xl w-full h-full" onclick="selectTimeSlot(&#39;' + dateStr + '&#39;, &#39;' + time + '&#39;)">○</button>';
                        }
                        
                        rowHtml += \`<div style="width: 12.14%;" class="\${cellClass}">\${cellContent}</div>\`;
                    });
                    
                    rowHtml += '</div>';
                    return rowHtml;
                }).join('');
                
                document.getElementById('time-slots-grid').innerHTML = slotsHtml;
            }
            
            // 時間帯選択時に予約フォームへ遷移
            window.selectTimeSlot = function(date, time) {
                // 予約フォームのタブに切り替え
                showSection('booking');
                
                // 日付と時間を自動入力（送信時のために一時的に有効化）
                const dateField = document.getElementById('reservation-date');
                const timeField = document.getElementById('reservation-time');
                
                dateField.removeAttribute('readonly');
                timeField.removeAttribute('disabled');
                
                dateField.value = date;
                timeField.value = time;
                
                // 再度読み取り専用に
                dateField.setAttribute('readonly', 'true');
                timeField.setAttribute('disabled', 'true');
            }

            // 週変更
            function changeWeek(delta) {
                weekStartDate.setDate(weekStartDate.getDate() + (delta * 7));
                loadCalendar();
            }

            // ステータスフィルター
            document.getElementById('status-filter')?.addEventListener('change', loadReservations);
            
            // 初期表示
            document.addEventListener('DOMContentLoaded', () => {
                // 最小日付を今日に設定
                const today = new Date().toISOString().split('T')[0];
                document.querySelector('input[name="reservation_date"]').setAttribute('min', today);
                
                // 初期表示はカレンダー
                showSection('calendar');
            });
        </script>
    </body>
    </html>
  `)
});

export default app
