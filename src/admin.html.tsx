export const adminHTML = `
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>管理者画面 - 出張買取予約システム</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link href="https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.4.0/css/all.min.css" rel="stylesheet">
    <style>
        .slot-button {
            min-width: 60px;
            padding: 8px 12px;
            margin: 2px;
            border-radius: 4px;
            font-size: 12px;
            cursor: pointer;
            transition: all 0.2s;
        }
        .slot-available {
            background-color: #10b981;
            color: white;
        }
        .slot-available:hover {
            background-color: #059669;
        }
        .slot-booked {
            background-color: #ef4444;
            color: white;
            cursor: not-allowed;
        }
        .slot-unavailable {
            background-color: #9ca3af;
            color: white;
            cursor: not-allowed;
        }
        .calendar-cell {
            min-height: 120px;
            border: 1px solid #e5e7eb;
            padding: 8px;
        }
        .calendar-cell.unavailable-day {
            background-color: #e5e7eb;
            opacity: 0.6;
        }
        .calendar-cell.today {
            border: 2px solid #3b82f6;
        }
        .login-container {
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
        }
    </style>
</head>
<body class="bg-gray-50">
    <!-- ログイン画面 -->
    <div id="login-screen" class="login-container">
        <div class="bg-white rounded-lg shadow-xl p-8 max-w-md w-full mx-4">
            <div class="text-center mb-8">
                <i class="fas fa-user-shield text-6xl text-blue-600 mb-4"></i>
                <h1 class="text-3xl font-bold text-gray-800">管理者ログイン</h1>
                <p class="text-gray-600 mt-2">出張買取予約システム</p>
            </div>
            
            <form id="login-form" class="space-y-6">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">
                        ユーザー名
                    </label>
                    <input type="text" name="username" required
                        class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                </div>
                
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-2">
                        パスワード
                    </label>
                    <input type="password" name="password" required
                        class="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent">
                </div>
                
                <button type="submit"
                    class="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold">
                    <i class="fas fa-sign-in-alt mr-2"></i>
                    ログイン
                </button>
            </form>
            
            <div class="mt-6 text-center text-sm text-gray-600">
                <p>デフォルト: admin / admin123</p>
            </div>
        </div>
    </div>

    <!-- 管理画面 -->
    <div id="admin-screen" class="hidden">
        <nav class="bg-purple-600 text-white p-4 shadow-lg">
            <div class="container mx-auto flex justify-between items-center">
                <h1 class="text-2xl font-bold">
                    <i class="fas fa-user-shield mr-2"></i>
                    管理者画面
                </h1>
                <div class="flex items-center space-x-4">
                    <span id="admin-username" class="text-sm"></span>
                    <button onclick="showSection('calendar')" class="hover:text-purple-200">
                        <i class="fas fa-calendar-alt mr-1"></i>カレンダー管理
                    </button>
                    <button onclick="showSection('reservations')" class="hover:text-purple-200">
                        <i class="fas fa-list mr-1"></i>予約一覧
                    </button>
                    <button onclick="logout()" class="hover:text-purple-200">
                        <i class="fas fa-sign-out-alt mr-1"></i>ログアウト
                    </button>
                </div>
            </div>
        </nav>

        <div class="container mx-auto p-6">
            <!-- カレンダー管理セクション -->
            <div id="calendar-section" class="section">
                <div class="bg-white rounded-lg shadow-md p-6">
                    <div class="flex justify-between items-center mb-6">
                        <h2 class="text-2xl font-bold text-gray-800">
                            <i class="fas fa-calendar-alt mr-2 text-purple-600"></i>
                            予約カレンダー管理
                        </h2>
                        <div class="flex items-center space-x-4">
                            <button onclick="changeMonth(-1)" class="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300">
                                <i class="fas fa-chevron-left"></i>
                            </button>
                            <span id="current-month" class="text-xl font-semibold min-w-[150px] text-center"></span>
                            <button onclick="changeMonth(1)" class="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300">
                                <i class="fas fa-chevron-right"></i>
                            </button>
                        </div>
                    </div>

                    <!-- 凡例と一括操作 -->
                    <div class="flex justify-between items-center mb-4">
                        <div class="flex items-center space-x-6 text-sm">
                            <div class="flex items-center">
                                <div class="w-4 h-4 bg-green-500 rounded mr-2"></div>
                                <span>空きあり</span>
                            </div>
                            <div class="flex items-center">
                                <div class="w-4 h-4 bg-red-500 rounded mr-2"></div>
                                <span>予約済み</span>
                            </div>
                            <div class="flex items-center">
                                <div class="w-4 h-4 bg-gray-400 rounded mr-2"></div>
                                <span>出張不可日</span>
                            </div>
                        </div>
                        
                        <div class="flex items-center space-x-2">
                            <button id="bulk-select-btn" onclick="toggleBulkSelectMode()" 
                                class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm">
                                <i class="fas fa-calendar-check mr-1"></i>
                                一括選択モード
                            </button>
                            <button id="bulk-close-btn" onclick="bulkCloseSelected()" 
                                class="hidden px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm">
                                <i class="fas fa-ban mr-1"></i>
                                選択日をクローズ
                            </button>
                            <button id="bulk-open-btn" onclick="bulkOpenSelected()" 
                                class="hidden px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm">
                                <i class="fas fa-check mr-1"></i>
                                選択日をオープン
                            </button>
                            <button id="bulk-cancel-btn" onclick="cancelBulkSelectMode()" 
                                class="hidden px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 text-sm">
                                <i class="fas fa-times mr-1"></i>
                                キャンセル
                            </button>
                        </div>
                    </div>
                    
                    <div id="calendar-grid" class="grid grid-cols-7 gap-1">
                        <!-- カレンダーがここに表示されます -->
                    </div>
                </div>
            </div>

            <!-- 予約一覧セクション -->
            <div id="reservations-section" class="section hidden">
                <div class="bg-white rounded-lg shadow-md p-6">
                    <div class="flex justify-between items-center mb-6">
                        <h2 class="text-2xl font-bold text-gray-800">
                            <i class="fas fa-list mr-2 text-purple-600"></i>
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
                            <button onclick="loadReservations()" class="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700">
                                <i class="fas fa-sync-alt mr-1"></i>更新
                            </button>
                        </div>
                    </div>
                    
                    <div id="reservations-list" class="space-y-4">
                        <!-- 予約リストがここに表示されます -->
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- 日付クリックモーダル -->
    <div id="date-modal" class="hidden fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div class="bg-white rounded-lg shadow-xl p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div class="flex justify-between items-center mb-4">
                <h3 class="text-xl font-bold" id="modal-date-title"></h3>
                <button onclick="closeDateModal()" class="text-gray-500 hover:text-gray-700">
                    <i class="fas fa-times text-2xl"></i>
                </button>
            </div>
            
            <div id="modal-content">
                <!-- モーダルコンテンツがここに表示されます -->
            </div>
        </div>
    </div>

    <script src="https://cdn.jsdelivr.net/npm/axios@1.6.0/dist/axios.min.js"></script>
    <script>
        let currentYear = new Date().getFullYear();
        let currentMonth = new Date().getMonth() + 1;
        let isLoggedIn = false;
        let currentDate = null;
        let calendarData = null;
        let bulkSelectMode = false;
        let selectedDates = new Set();

        // 時間帯の定義
        const timeSlots = ['10:00', '12:00', '14:00', '16:00'];
        const slotLabels = ['午前1', '午前2', '午後1', '午後2'];

        // ログイン処理
        document.getElementById('login-form').addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const formData = new FormData(e.target);
            const data = Object.fromEntries(formData.entries());
            
            try {
                const response = await axios.post('/api/admin/login', data);
                
                if (response.data.success) {
                    isLoggedIn = true;
                    document.getElementById('login-screen').classList.add('hidden');
                    document.getElementById('admin-screen').classList.remove('hidden');
                    document.getElementById('admin-username').textContent = response.data.data.username;
                    loadCalendar();
                }
            } catch (error) {
                alert('ログインに失敗しました: ' + (error.response?.data?.error || error.message));
            }
        });

        // ログアウト
        function logout() {
            isLoggedIn = false;
            document.getElementById('login-screen').classList.remove('hidden');
            document.getElementById('admin-screen').classList.add('hidden');
        }

        // セクション切り替え
        function showSection(section) {
            document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));
            document.getElementById(section + '-section').classList.remove('hidden');
            
            if (section === 'reservations') {
                loadReservations();
            } else if (section === 'calendar') {
                loadCalendar();
            }
        }

        // カレンダー読み込み
        async function loadCalendar() {
            document.getElementById('current-month').textContent = 
                \`\${currentYear}年\${currentMonth}月\`;
            
            try {
                const response = await axios.get('/api/admin/calendar', {
                    params: { year: currentYear, month: currentMonth }
                });
                
                calendarData = response.data.data;
                renderCalendar();
            } catch (error) {
                console.error('Error loading calendar:', error);
            }
        }

        // カレンダー描画
        function renderCalendar() {
            const grid = document.getElementById('calendar-grid');
            const firstDay = new Date(currentYear, currentMonth - 1, 1).getDay();
            const daysInMonth = new Date(currentYear, currentMonth, 0).getDate();
            const today = new Date().toISOString().split('T')[0];
            
            // 予約と不可日のマップ作成
            const reservationMap = {};
            calendarData.reservations.forEach(r => {
                if (!reservationMap[r.reservation_date]) {
                    reservationMap[r.reservation_date] = {};
                }
                reservationMap[r.reservation_date][r.reservation_time] = r.count;
            });
            
            const unavailableMap = {};
            calendarData.unavailableDates.forEach(d => {
                unavailableMap[d.date] = d.reason;
            });
            
            const weekDays = ['日', '月', '火', '水', '木', '金', '土'];
            let html = weekDays.map(day => 
                \`<div class="text-center font-bold p-2 bg-gray-100">\${day}</div>\`
            ).join('');
            
            for (let i = 0; i < firstDay; i++) {
                html += '<div class="calendar-cell"></div>';
            }
            
            for (let day = 1; day <= daysInMonth; day++) {
                const date = \`\${currentYear}-\${String(currentMonth).padStart(2, '0')}-\${String(day).padStart(2, '0')}\`;
                const isUnavailable = unavailableMap[date];
                const isToday = date === today;
                const isPast = new Date(date) < new Date(today);
                const isSelected = selectedDates.has(date);
                
                let cellClass = 'calendar-cell';
                if (isUnavailable) cellClass += ' unavailable-day';
                if (isToday) cellClass += ' today';
                if (isSelected && bulkSelectMode) cellClass += ' border-4 border-blue-500';
                
                const cellOnClick = bulkSelectMode && !isPast ? \`onclick="toggleDateSelection('\${date}')"\` : '';
                const cellStyle = bulkSelectMode && !isPast ? 'cursor-pointer' : '';
                
                html += \`
                    <div class="\${cellClass}" style="\${cellStyle}" \${cellOnClick}>
                        <div class="font-bold mb-2 flex justify-between items-center">
                            <span>\${day}</span>
                            \${!bulkSelectMode ? \`
                                \${!isUnavailable && !isPast ? \`
                                    <button onclick="event.stopPropagation(); toggleUnavailable('\${date}')" 
                                        class="text-xs px-2 py-1 bg-gray-200 hover:bg-gray-300 rounded"
                                        title="出張不可にする">
                                        <i class="fas fa-ban"></i>
                                    </button>
                                \` : ''}
                                \${isUnavailable ? \`
                                    <button onclick="event.stopPropagation(); toggleUnavailable('\${date}')" 
                                        class="text-xs px-2 py-1 bg-green-500 text-white hover:bg-green-600 rounded"
                                        title="出張可能にする">
                                        <i class="fas fa-check"></i>
                                    </button>
                                \` : ''}
                            \` : \`
                                \${isSelected ? '<i class="fas fa-check-circle text-blue-600"></i>' : ''}
                            \`}
                        </div>
                        \${isUnavailable ? \`
                            <div class="text-xs text-red-600 font-semibold">出張不可</div>
                            \${unavailableMap[date] ? \`<div class="text-xs text-gray-600">\${unavailableMap[date]}</div>\` : ''}
                        \` : \`
                            <div class="grid grid-cols-2 gap-1">
                                \${timeSlots.map((time, idx) => {
                                    const count = reservationMap[date]?.[time] || 0;
                                    const isBooked = count > 0;
                                    const slotClass = isPast ? 'slot-unavailable' : 
                                                     isBooked ? 'slot-booked' : 'slot-available';
                                    return \`
                                        <button class="slot-button \${slotClass}" 
                                            onclick="event.stopPropagation(); showSlotDetails('\${date}', '\${time}')"
                                            \${isPast ? 'disabled' : ''}>
                                            \${slotLabels[idx]}
                                        </button>
                                    \`;
                                }).join('')}
                            </div>
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

        // 出張不可日の切り替え
        async function toggleUnavailable(date) {
            const isCurrentlyUnavailable = calendarData.unavailableDates.some(d => d.date === date);
            
            try {
                if (isCurrentlyUnavailable) {
                    await axios.delete(\`/api/admin/unavailable-dates/\${date}\`);
                    alert('出張可能日に設定しました');
                } else {
                    const reason = prompt('出張不可の理由を入力してください（任意）', '');
                    if (reason !== null) {
                        await axios.post('/api/admin/unavailable-dates', { date, reason });
                        alert('出張不可日に設定しました');
                    } else {
                        return;
                    }
                }
                loadCalendar();
            } catch (error) {
                alert('エラーが発生しました: ' + (error.response?.data?.error || error.message));
            }
        }

        // スロット詳細表示
        async function showSlotDetails(date, time) {
            try {
                const response = await axios.get('/api/reservations', {
                    params: { date }
                });
                
                const reservations = response.data.data.filter(r => 
                    r.reservation_time === time && r.status !== 'cancelled'
                );
                
                const modal = document.getElementById('date-modal');
                document.getElementById('modal-date-title').textContent = \`\${date} \${time}\`;
                
                if (reservations.length === 0) {
                    document.getElementById('modal-content').innerHTML = \`
                        <p class="text-gray-600">この時間帯の予約はありません</p>
                    \`;
                } else {
                    document.getElementById('modal-content').innerHTML = reservations.map(r => \`
                        <div class="border-b pb-4 mb-4 last:border-b-0">
                            <div class="flex justify-between items-start mb-2">
                                <div class="font-bold text-lg">\${r.customer_name}</div>
                                <span class="px-2 py-1 rounded-full text-xs font-semibold \${getStatusClass(r.status)}">
                                    \${getStatusLabel(r.status)}
                                </span>
                            </div>
                            <div class="text-sm text-gray-600 space-y-1 mt-2">
                                <p><i class="fas fa-phone mr-2 text-blue-500"></i>\${r.customer_phone}</p>
                                <p><i class="fas fa-envelope mr-2 text-blue-500"></i>\${r.customer_email}</p>
                                <p><i class="fas fa-map-pin mr-2 text-blue-500"></i>〒\${r.customer_postal_code}</p>
                                <p><i class="fas fa-map-marker-alt mr-2 text-blue-500"></i>\${r.customer_address}</p>
                                <p><i class="fas fa-box mr-2 text-blue-500"></i>\${r.item_category}</p>
                                \${r.estimated_quantity ? \`<p><i class="fas fa-hashtag mr-2 text-blue-500"></i>概算点数: \${r.estimated_quantity}点</p>\` : ''}
                            </div>
                            \${r.item_description ? \`
                                <div class="mt-2 p-2 bg-gray-50 rounded">
                                    <p class="text-sm font-semibold text-gray-700">品目詳細</p>
                                    <p class="text-sm text-gray-600">\${r.item_description}</p>
                                </div>
                            \` : ''}
                            \${r.customer_notes ? \`
                                <div class="mt-2 p-2 bg-blue-50 rounded">
                                    <p class="text-sm font-semibold text-blue-700"><i class="fas fa-comment mr-1"></i>お客様からの備考</p>
                                    <p class="text-sm text-blue-600">\${r.customer_notes}</p>
                                </div>
                            \` : ''}
                            \${r.notes ? \`
                                <div class="mt-2 p-2 bg-yellow-50 rounded">
                                    <p class="text-sm font-semibold text-yellow-700"><i class="fas fa-sticky-note mr-1"></i>管理者メモ</p>
                                    <p class="text-sm text-yellow-600">\${r.notes}</p>
                                </div>
                            \` : ''}
                            <div class="mt-3 text-xs text-gray-500">
                                <p>予約ID: \${r.id} | 登録日時: \${new Date(r.created_at).toLocaleString('ja-JP')}</p>
                            </div>
                            <div class="mt-3 flex space-x-2">
                                <button onclick="updateStatus(\${r.id}, 'confirmed')" 
                                    class="px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600">
                                    確定
                                </button>
                                <button onclick="updateStatus(\${r.id}, 'completed')" 
                                    class="px-3 py-1 bg-green-500 text-white text-sm rounded hover:bg-green-600">
                                    完了
                                </button>
                                <button onclick="updateStatus(\${r.id}, 'cancelled')" 
                                    class="px-3 py-1 bg-red-500 text-white text-sm rounded hover:bg-red-600">
                                    キャンセル
                                </button>
                            </div>
                        </div>
                    \`).join('');
                }
                
                modal.classList.remove('hidden');
            } catch (error) {
                alert('エラーが発生しました');
            }
        }

        // モーダルを閉じる
        function closeDateModal() {
            document.getElementById('date-modal').classList.add('hidden');
        }

        // ステータス更新
        async function updateStatus(id, status) {
            try {
                await axios.put(\`/api/reservations/\${id}\`, { status });
                alert('ステータスを更新しました');
                closeDateModal();
                loadCalendar();
            } catch (error) {
                alert('エラーが発生しました');
            }
        }

        // 一括選択モードの切り替え
        function toggleBulkSelectMode() {
            bulkSelectMode = true;
            selectedDates.clear();
            
            document.getElementById('bulk-select-btn').classList.add('hidden');
            document.getElementById('bulk-close-btn').classList.remove('hidden');
            document.getElementById('bulk-open-btn').classList.remove('hidden');
            document.getElementById('bulk-cancel-btn').classList.remove('hidden');
            
            renderCalendar();
        }

        // 一括選択モードのキャンセル
        function cancelBulkSelectMode() {
            bulkSelectMode = false;
            selectedDates.clear();
            
            document.getElementById('bulk-select-btn').classList.remove('hidden');
            document.getElementById('bulk-close-btn').classList.add('hidden');
            document.getElementById('bulk-open-btn').classList.add('hidden');
            document.getElementById('bulk-cancel-btn').classList.add('hidden');
            
            renderCalendar();
        }

        // 日付選択の切り替え
        function toggleDateSelection(date) {
            if (!bulkSelectMode) return;
            
            if (selectedDates.has(date)) {
                selectedDates.delete(date);
            } else {
                selectedDates.add(date);
            }
            
            renderCalendar();
        }

        // 選択した日付を一括クローズ
        async function bulkCloseSelected() {
            if (selectedDates.size === 0) {
                alert('日付を選択してください');
                return;
            }
            
            const reason = prompt(\`\${selectedDates.size}日分を出張不可日に設定します。\\n理由を入力してください（任意）\`, '');
            if (reason === null) return;
            
            try {
                const promises = Array.from(selectedDates).map(date => 
                    axios.post('/api/admin/unavailable-dates', { date, reason })
                );
                
                await Promise.all(promises);
                alert(\`\${selectedDates.size}日分を出張不可日に設定しました\`);
                
                cancelBulkSelectMode();
                loadCalendar();
            } catch (error) {
                alert('エラーが発生しました: ' + (error.response?.data?.error || error.message));
            }
        }

        // 選択した日付を一括オープン
        async function bulkOpenSelected() {
            if (selectedDates.size === 0) {
                alert('日付を選択してください');
                return;
            }
            
            if (!confirm(\`\${selectedDates.size}日分を出張可能日に設定しますか？\`)) {
                return;
            }
            
            try {
                const promises = Array.from(selectedDates).map(date => 
                    axios.delete(\`/api/admin/unavailable-dates/\${date}\`)
                );
                
                await Promise.all(promises);
                alert(\`\${selectedDates.size}日分を出張可能日に設定しました\`);
                
                cancelBulkSelectMode();
                loadCalendar();
            } catch (error) {
                alert('エラーが発生しました: ' + (error.response?.data?.error || error.message));
            }
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
                        <div class="mt-3 flex space-x-2">
                            <button onclick="updateStatus(\${r.id}, 'confirmed')" 
                                class="px-3 py-1 bg-blue-500 text-white text-sm rounded hover:bg-blue-600">
                                確定
                            </button>
                            <button onclick="updateStatus(\${r.id}, 'completed')" 
                                class="px-3 py-1 bg-green-500 text-white text-sm rounded hover:bg-green-600">
                                完了
                            </button>
                            <button onclick="updateStatus(\${r.id}, 'cancelled')" 
                                class="px-3 py-1 bg-red-500 text-white text-sm rounded hover:bg-red-600">
                                キャンセル
                            </button>
                        </div>
                    </div>
                \`).join('');
            } catch (error) {
                console.error('Error loading reservations:', error);
            }
        }

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

        // ステータスフィルター
        document.getElementById('status-filter')?.addEventListener('change', loadReservations);
    </script>
</body>
</html>
`;
