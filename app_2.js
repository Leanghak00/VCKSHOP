// Firebase Configuration
const firebaseConfig = {
    apiKey: "AIzaSyAw0owrI_MjRPJmQLzd9zNFyjcdgRc7H4I",
    authDomain: "vckshop-b951b.firebaseapp.com",
    databaseURL: "https://vckshop-b951b-default-rtdb.firebaseio.com",
    projectId: "vckshop-b951b",
    storageBucket: "vckshop-b951b.firebasestorage.app",
    messagingSenderId: "39230962959",
    appId: "1:39230962959:web:bc2fde1b4f8e9b3c7ed27a"
};

if (!firebase.apps.length) firebase.initializeApp(firebaseConfig);
const database = firebase.database();
const auth = firebase.auth();

let productsData = [], currentUser = null, salesData = [], deliveryData = [], currentInvoiceItems = [], attendanceData = [];
let myChartInstance = null, comparisonChartInstance = null, locationChartInstance = null, qrcodeInstance = null;
let currentInvoiceGrandTotal = 0;
let html5QrCodeScanner = null, html5AttendanceScanner = null;

// Telegram Bot Configuration
const TELEGRAM_BOT_TOKEN = "8839366312:AAFIDVQrCvb36nAfZc3AzYZ7PHCBo5pQmgU";

// បញ្ជីបុគ្គលិក (លាងហាក់ និង វិច្ឆិកា មានសិទ្ធិជា Admin ពេញលេញ)
const STAFF_ACCOUNTS = {
    'vicheka': { name: 'វិច្ឆិកា', role: 'Admin' },
    'leanghak': { name: 'លាងហាក់', role: 'Admin' },
    'phanny': { name: 'ផាន់នី', role: 'Cashier' },
    'sopheap': { name: 'សុភាព', role: 'Cashier' },
    'phellin': { name: 'ផល្លីន', role: 'Cashier' }
};

// កូអរដោនេទីតាំងហាង VCK SHOP (សម្រាប់ Geofencing GPS)
const STORE_LOCATION = {
    lat: 11.5564, 
    lng: 104.9282, 
    maxDistanceMeter: 100 
};

window.addEventListener('DOMContentLoaded', () => {
    startClock();
    initTheme();
    requestNotificationPermission();
    
    auth.onAuthStateChanged((user) => {
        if (user) {
            database.ref('users/' + user.uid).once('value').then(snapshot => {
                const userData = snapshot.val();
                const usernameKey = user.email.split('@')[0].toLowerCase();
                const staffInfo = STAFF_ACCOUNTS[usernameKey];

                currentUser = {
                    name: userData ? userData.name : (staffInfo ? staffInfo.name : usernameKey),
                    role: userData ? userData.role : (staffInfo ? staffInfo.role : 'Cashier'),
                    email: user.email
                };
                initSystemAfterLogin();
            });
        }
    });
});

function requestNotificationPermission() {
    if ("Notification" in window && Notification.permission !== "granted") {
        Notification.requestPermission();
    }
}

async function getTelegramChatId() {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        if (data.ok && data.result.length > 0) {
            const lastUpdate = data.result[data.result.length - 1];
            return lastUpdate.message?.chat?.id || lastUpdate.my_chat_member?.chat?.id;
        }
    } catch (error) {
        console.error("Error fetching Chat ID:", error);
    }
    return null;
}

async function sendTelegramNotification(invCode, customer, phone, location, total, items) {
    const chatId = await getTelegramChatId();
    if (!chatId) return;

    const itemsListStr = items.map(i => `▪️ <b>${i.name}</b> (x${i.qty}) : <b>$${i.totalPrice.toFixed(2)}</b>`).join('\n');
    const message = `🚨 <b>មានការបញ្ជាទិញថ្មី! (VCK SHOP)</b>\n\n` +
                    `━━━━━━━━━━━━━━━━━━━\n` +
                    `🧾 លេខវិក្កយបត្រ: <b>${invCode}</b>\n` +
                    `👤 អតិថិជន: <b>${customer}</b> (${phone})\n` +
                    `📍 ទីតាំងដឹក: <b>${location}</b>\n` +
                    `━━━━━━━━━━━━━━━━━━━\n` +
                    `🛒 <b>បញ្ជីទំនិញ៖</b>\n${itemsListStr}\n` +
                    `━━━━━━━━━━━━━━━━━━━\n` +
                    `💰 <b>ទឹកប្រាក់សរុប: $${total.toFixed(2)}</b>`;

    try {
        await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' })
        });
    } catch (error) {
        console.error("Telegram Error:", error);
    }
}

function sendDirectCustomerTelegramModal() {
    if (currentInvoiceItems.length === 0) return alert("⚠️ សូមបញ្ចូលមុខទំនិញក្នុងវិក្កយបត្រជាមុនសិន!");
    document.getElementById('targetCustomerPhone').value = document.getElementById('invoicePhone').value || '';
    document.getElementById('telegramModal').classList.remove('hidden');
}

function closeTelegramModal() {
    document.getElementById('telegramModal').classList.add('hidden');
}

function shareDirectToTelegramLink() {
    const customer = document.getElementById('invoiceCustomer').value || 'អតិថិជន';
    const phone = document.getElementById('invoicePhone').value || '-';
    const location = document.getElementById('invoiceLocation').value || '-';
    const itemsTotal = currentInvoiceItems.reduce((sum, item) => sum + item.totalPrice, 0);
    const deliveryFee = parseFloat(document.getElementById('invoiceDeliveryFee').value) || 0;
    const discount = parseFloat(document.getElementById('invoiceDiscount').value) || 0;
    const grandTotal = Math.max(0, itemsTotal + deliveryFee - discount);
    const itemsListStr = currentInvoiceItems.map(i => `▪️ ${i.name} (x${i.qty}) ➔ $${i.totalPrice.toFixed(2)}`).join('\n');

    const message = `🛍️ **VCK SHOP - វិក្កយបត្រទិញទំនិញ**\n` +
                    `━━━━━━━━━━━━━━━━━━━\n` +
                    `👤 ឈ្មោះ: ${customer} (${phone})\n` +
                    `📍 ទីតាំង: ${location}\n` +
                    `━━━━━━━━━━━━━━━━━━━\n` +
                    `🛒 **បរិយាយទំនិញ៖**\n${itemsListStr}\n\n` +
                    `🚚 សេវាដឹក: $${deliveryFee.toFixed(2)}\n` +
                    (discount > 0 ? `🎁 បញ្ចុះតម្លៃ: -$${discount.toFixed(2)}\n` : '') +
                    `━━━━━━━━━━━━━━━━━━━\n` +
                    `💰 **ទឹកប្រាក់សរុប: $${grandTotal.toFixed(2)}**\n` +
                    `━━━━━━━━━━━━━━━━━━━\n` +
                    `🙏 សូមអរគុណចំពោះការគាំទ្រផលិតផលប្រណិតពី VCK SHOP! ✨`;

    window.open(`https://t.me/share/url?url=&text=${encodeURIComponent(message)}`, '_blank');
    closeTelegramModal();
}

async function confirmSendTelegramByPhone() {
    const phone = document.getElementById('targetCustomerPhone').value.trim();
    if (!phone) return alert("⚠️ សូមបញ្ចូលលេខទូរស័ព្ទអតិថិជន!");
    const chatId = await getTelegramChatId(); 
    if (!chatId) return alert("⚠️ រកមិនឃើញ Chat ID ស្វ័យប្រវត្តិទេ!");

    const customer = document.getElementById('invoiceCustomer').value || 'អតិថិជន';
    const location = document.getElementById('invoiceLocation').value || '-';
    const itemsTotal = currentInvoiceItems.reduce((sum, item) => sum + item.totalPrice, 0);
    const deliveryFee = parseFloat(document.getElementById('invoiceDeliveryFee').value) || 0;
    const discount = parseFloat(document.getElementById('invoiceDiscount').value) || 0;
    const grandTotal = Math.max(0, itemsTotal + deliveryFee - discount);
    const itemsListStr = currentInvoiceItems.map(i => `▪️ <b>${i.name}</b> (x${i.qty}) ➔ <b>$${i.totalPrice.toFixed(2)}</b>`).join('\n');

    const message = `🛍️ <b>VCK SHOP - វិក្កយបត្រទិញទំនិញ</b>\n` +
                    `━━━━━━━━━━━━━━━━━━━\n` +
                    `👤 អតិថិជន: <b>${customer}</b> (${phone})\n` +
                    `📍 ទីតាំង: <b>${location}</b>\n` +
                    `━━━━━━━━━━━━━━━━━━━\n` +
                    `🛒 <b>បញ្ជីទំនិញ៖</b>\n${itemsListStr}\n\n` +
                    `🚚 សេវាដឹក: $${deliveryFee.toFixed(2)}\n` +
                    (discount > 0 ? `🎁 បញ្ចុះតម្លៃ: -$${discount.toFixed(2)}\n` : '') +
                    `━━━━━━━━━━━━━━━━━━━\n` +
                    `💰 <b>ទឹកប្រាក់សរុប: $${grandTotal.toFixed(2)}</b>\n` +
                    `━━━━━━━━━━━━━━━━━━━\n` +
                    `🙏 សូមអរគុណចំពោះការគាំទ្រផលិតផលប្រណិតពី VCK SHOP! ✨`;

    try {
        const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' })
        });
        const data = await response.json();
        if (data.ok) {
            alert("✅ បានផ្ញើវិក្កយបត្រជូនអតិថិជនជោគជ័យ!");
            closeTelegramModal();
        }
    } catch (error) {
        console.error("Error:", error);
    }
}

async function sendDeliverySuccessNotice(customerPhone, invCode, customerName) {
    const noticeText = `🎉 ✨ **អបអរសាទរ និងសូមអរគុណ ${customerName} (${customerPhone})!** ✨ 🎉\n` +
                       `━━━━━━━━━━━━━━━━━━━\n` +
                       `📦 វិក្កយបត្រលេខ: ${invCode}\n` +
                       `🚚 ឥឡូវនេះទំនិញរបស់អ្នកត្រូវបានដឹកជញ្ជូនដល់ដៃដោយសុវត្ថិភាព និងភាពប្រណិតរួចរាល់ហើយ!\n` +
                       `━━━━━━━━━━━━━━━━━━━\n` +
                       `🙏 ថែរក្សា និងកុំភ្លេចបម្រើសេវាកម្មយើងខ្ញុំម្ដងទៀតនៅពេលក្រោយ!\n` +
                       `🌟 **VCK SHOP** - ផ្គត់ផ្គង់សម្ភារៈតុការចានប្រណិតទាន់សម័យ។`;
    window.open(`https://t.me/share/url?url=&text=${encodeURIComponent(noticeText)}`, '_blank');
}

function applyUserRolePermissions() {
    if (!currentUser) return;
    const role = currentUser.role;
    const dashCards = document.getElementById('dash-cards-container');
    const stockForm = document.getElementById('stock-entry-form');

    if (role === 'Cashier') {
        if (dashCards) dashCards.classList.add('hidden');
        if (stockForm) stockForm.classList.add('hidden');
    } else {
        if (dashCards) dashCards.classList.remove('hidden');
        if (stockForm) stockForm.classList.remove('hidden');
    }
}

function initTheme() {
    const savedTheme = localStorage.getItem('vck_theme');
    if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
        const icon = document.getElementById('darkModeIcon');
        if (icon) icon.innerText = '☀️';
    }
}

function toggleDarkMode() {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('vck_theme', isDark ? 'dark' : 'light');
    const icon = document.getElementById('darkModeIcon');
    if (icon) icon.innerText = isDark ? '☀️' : '🌙';
}

function startClock() {
    const clockEl = document.getElementById('liveClockDisplay');
    if (!clockEl) return;
    setInterval(() => {
        const now = new Date();
        clockEl.innerText = now.toLocaleDateString('km-KH') + ' | ' + now.toLocaleTimeString('en-US', { hour12: true });
    }, 1000);
}

async function handleLogin() {
    const userIn = document.getElementById('loginUsername').value.trim().toLowerCase();
    const passIn = document.getElementById('loginPassword').value;
    const errorEl = document.getElementById('loginError');

    if (!userIn || !passIn) {
        errorEl.innerText = "⚠️ សូមបំពេញឈ្មោះអ្នកប្រើប្រាស់ និងលេខសម្ងាត់!";
        errorEl.classList.remove('hidden');
        return;
    }

    const emailFormat = userIn.includes('@') ? userIn : `${userIn}@vckshop.com`;

    try {
        const userCredential = await auth.signInWithEmailAndPassword(emailFormat, passIn);
        const user = userCredential.user;
        const staffInfo = STAFF_ACCOUNTS[userIn];

        currentUser = {
            name: staffInfo ? staffInfo.name : userIn,
            role: staffInfo ? staffInfo.role : 'Cashier',
            email: user.email
        };

        errorEl.classList.add('hidden');
        initSystemAfterLogin();
    } catch (error) {
        console.error("Login Error:", error);
        errorEl.innerText = "⚠️ ឈ្មោះអ្នកប្រើប្រាស់ ឬ លេខសម្ងាត់មិនត្រឹមត្រូវឡើយ!";
        errorEl.classList.remove('hidden');
    }
}

function initSystemAfterLogin() {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('main-application').classList.remove('hidden');
    document.getElementById('topNavUser').innerText = currentUser.name;
    document.getElementById('topNavRole').innerText = currentUser.role;
    document.getElementById('userAvatar').innerText = currentUser.name.charAt(0).toUpperCase();

    const today = new Date().toISOString().split('T')[0];
    const currentMonth = today.substring(0, 7);

    if (document.getElementById('searchMonth')) document.getElementById('searchMonth').value = currentMonth;
    if (document.getElementById('invoiceDate')) document.getElementById('invoiceDate').value = today;
    if (document.getElementById('pdfDate')) document.getElementById('pdfDate').innerText = today;
    if (document.getElementById('deliveryStatDate')) document.getElementById('deliveryStatDate').value = today;
    if (document.getElementById('attendanceFilterDate')) document.getElementById('attendanceFilterDate').value = today;

    applyUserRolePermissions();
    setupLivePreviewInputs();
    listenToFirebaseData();
    switchTab('dashboard');
}

async function handleLogout() {
    try {
        await auth.signOut();
        currentUser = null;
        localStorage.removeItem('vck_current_user');
        location.reload();
    } catch (error) {
        console.error("Logout Error:", error);
    }
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    const targetTab = document.getElementById('tab-' + tabId);
    if (targetTab) {
        targetTab.classList.remove('hidden');
        targetTab.classList.add('animate-fade-in');
    }

    document.querySelectorAll('nav button').forEach(btn => btn.classList.remove('active-menu', 'bg-indigo-600', 'text-white'));
    const targetBtn = document.getElementById('btn-' + tabId);
    if (targetBtn) {
        targetBtn.classList.add('active-menu', 'bg-indigo-600', 'text-white');
    }
    
    const titles = { 
        'dashboard': '📊 ផ្ទាំងគ្រប់គ្រងទូទៅ', 
        'sales': '📄 វិក្កយបត្រលក់សម្ភារៈ', 
        'delivery': '🚚 ប្រព័ន្ធដឹកជញ្ជូន', 
        'stock': '📦 គ្រប់គ្រងឃ្លាំងស្តុក',
        'attendance': '⏰ ស្កេនវត្តមានធ្វើការ',
        'customer-history': '👥 ប្រវត្តិទិញរបស់អតិថិជន'
    };
    document.getElementById('pageTitle').innerText = titles[tabId] || 'VCK System';

    if (window.innerWidth < 768) {
        const menu = document.getElementById('sidebarMenu');
        const footer = document.getElementById('userFooter');
        if (menu) menu.classList.add('hidden');
        if (footer) {
            footer.classList.add('hidden');
            footer.classList.remove('flex');
        }
    }
}

function listenToFirebaseData() {
    database.ref('products').on('value', (snapshot) => {
        const data = snapshot.val();
        productsData = data ? Object.values(data) : [];
        setupInvoiceProductSelect();
        renderAll();
    });
    database.ref('sales').on('value', (snapshot) => {
        const data = snapshot.val();
        salesData = data ? Object.values(data) : [];
        renderAll();
    });
    database.ref('deliveries').on('value', (snapshot) => {
        const data = snapshot.val();
        deliveryData = data ? Object.values(data) : [];
        renderAll();
    });
    database.ref('attendance').on('value', (snapshot) => {
        const data = snapshot.val();
        attendanceData = data ? Object.values(data) : [];
        renderAttendanceTable();
    });
}

// 📌 គណនាចម្ងាយ GPS (Haversine Formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;
    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// 📷 បើកកាមេរ៉ាស្កេន QR វត្តមាន (ផ្ទៀងផ្ទាត់អត្ថបទ VCK-SHOP-OFFICIAL)
function startAttendanceScanner() {
    const readerEl = document.getElementById('attendanceReader');
    const closeBtn = document.getElementById('closeAttendanceCam');
    readerEl.classList.remove('hidden');
    closeBtn.classList.remove('hidden');

    html5AttendanceScanner = new Html5QrcodeScanner("attendanceReader", { fps: 10, qrbox: { width: 250, height: 250 } }, false);
    
    html5AttendanceScanner.render((decodedText) => {
        if (decodedText.trim() === "VCK-SHOP-OFFICIAL") {
            verifyAndSubmitAttendance();
            stopAttendanceScanner();
        } else {
            alert("⚠️ QR Code មិនត្រឹមត្រូវសម្រាប់ស្កេនវត្តមានហាងទេ!");
        }
    }, (error) => {});
}

function stopAttendanceScanner() {
    if (html5AttendanceScanner) {
        html5AttendanceScanner.clear().catch(error => console.error("Failed to clear scanner. ", error));
    }
    document.getElementById('attendanceReader').classList.add('hidden');
    document.getElementById('closeAttendanceCam').classList.add('hidden');
}

// 📍 ផ្ទៀងផ្ទាត់ GPS មុននឹងបញ្ជូនវត្តមាន
function verifyAndSubmitAttendance() {
    const statusEl = document.getElementById('geoStatus');
    if (!navigator.geolocation) return alert("⚠️ Browser របស់អ្នកមិនគាំទ្រ Geolocation ទេ!");

    statusEl.innerText = "⏳ កំពុងពិនិត្យទីតាំង GPS...";

    navigator.geolocation.getCurrentPosition(async (position) => {
        const distance = calculateDistance(position.coords.latitude, position.coords.longitude, STORE_LOCATION.lat, STORE_LOCATION.lng);

        if (distance > STORE_LOCATION.maxDistanceMeter) {
            statusEl.innerText = `❌ អ្នកនៅឆ្ងាយពីហាងពេក (${Math.round(distance)} ម៉ែត្រ)!`;
            alert(`⚠️ អ្នកនៅក្រៅបរិវេណហាង (${Math.round(distance)}m)! សូមមកស្កេនក្នុងហាង។`);
            return;
        }

        statusEl.innerText = `✅ ទីតាំងត្រឹមត្រូវ (ស្ថិតក្នុងចម្ងាយ ${Math.round(distance)} ម៉ែត្រពីហាង)`;
        const now = new Date();
        const type = now.getHours() < 12 ? 'Check-in' : 'Check-out';
        await saveAttendanceRecord(type);
    }, (error) => {
        statusEl.innerText = "❌ មិនអាចទាញយកទីតាំង GPS បានទេ!";
        alert("⚠️ សូមបើក GPS / Location នៅលើទូរស័ព្ទរបស់អ្នកជាមុនសិន!");
    }, { enableHighAccuracy: true });
}

async function saveAttendanceRecord(type) {
    if (!currentUser) return;
    const now = new Date();
    const dateStr = now.toISOString().split('T')[0];
    const timeStr = now.toLocaleTimeString('en-US', { hour12: true });

    const alreadyDone = attendanceData.some(a => a.staffName === currentUser.name && a.date === dateStr && a.type === type);
    if (alreadyDone && type === 'Check-in') {
        return alert(`⚠️ ${currentUser.name} បាន Check-in រួចរាល់ហើយសម្រាប់ថ្ងៃនេះ!`);
    }

    try {
        await database.ref('attendance').push({
            staffName: currentUser.name,
            type: type,
            date: dateStr,
            time: timeStr,
            timestamp: Date.now()
        });
        alert(`🎉 ${currentUser.name} បាន ${type} ជោគជ័យនៅម៉ោង ${timeStr}!`);
    } catch (error) {
        console.error("Attendance Error:", error);
        alert("❌ មិនអាចកត់ត្រាវត្តមានបានទេ!");
    }
}

function renderAttendanceTable() {
    const tbody = document.getElementById('attendanceTableBody');
    if (!tbody) return;
    const selectedDate = document.getElementById('attendanceFilterDate')?.value || new Date().toISOString().split('T')[0];
    const filtered = attendanceData.filter(a => a.date === selectedDate);

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="p-4 text-center text-xs text-slate-400 font-bold">📝 គ្មានទិន្នន័យវត្តមានសម្រាប់ថ្ងៃនេះទេ</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(a => `
        <tr class="text-xs border-b border-slate-100 dark:border-slate-800">
            <td class="p-3 pl-4 font-bold dark:text-white">${a.staffName}</td>
            <td class="p-3"><span class="px-2 py-1 rounded-lg text-[10px] font-bold ${a.type === 'Check-in' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}">${a.type}</span></td>
            <td class="p-3 text-slate-500">${a.date}</td>
            <td class="p-3 text-right font-bold text-slate-700 dark:text-slate-300">${a.time}</td>
        </tr>
    `).join('');
}

function setupLivePreviewInputs() {
    ['Customer', 'Phone', 'Location', 'Date'].forEach(id => {
        const el = document.getElementById('invoice' + id);
        if (el) el.addEventListener('input', (e) => {
            const pdfEl = document.getElementById('pdf' + id);
            if (pdfEl) pdfEl.innerText = e.target.value || '-';
        });
    });
}

function setupInvoiceProductSelect() {
    const dataList = document.getElementById('productList');
    if (!dataList) return;
    let html = '';
    productsData.forEach(p => {
        html += `<option value="${p.name}" data-price="${p.price}" data-id="${p.id}" data-avail="${p.avail}">${p.name} (សល់: ${p.avail})</option>`;
    });
    dataList.innerHTML = html;
}

function autoFillProductPrice() {
    const input = document.getElementById('invoiceProductInput');
    const dataList = document.getElementById('productList');
    const selectedOption = Array.from(dataList.options).find(opt => opt.value === input.value);
    
    if (selectedOption) {
        document.getElementById('invoiceUnitPrice').value = selectedOption.getAttribute('data-price');
        document.getElementById('invoiceProductIdHidden').value = selectedOption.getAttribute('data-id');
        document.getElementById('invoiceQty').max = selectedOption.getAttribute('data-avail');
    } else {
        document.getElementById('invoiceUnitPrice').value = '';
        document.getElementById('invoiceProductIdHidden').value = '';
    }
}

function startBarcodeScanner() {
    document.getElementById('barcodeModal').classList.remove('hidden');
    html5QrCodeScanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: { width: 250, height: 250 } }, false);
    html5QrCodeScanner.render((decodedText) => {
        const matchedProd = productsData.find(p => p.id == decodedText || p.name.toLowerCase().includes(decodedText.toLowerCase()));
        if (matchedProd) {
            document.getElementById('invoiceProductInput').value = matchedProd.name;
            autoFillProductPrice();
            stopBarcodeScanner();
            alert(`✅ បានស្កែនរកឃើញទំនិញ: ${matchedProd.name}`);
        }
    }, (error) => {});
}

function stopBarcodeScanner() {
    if (html5QrCodeScanner) html5QrCodeScanner.clear().catch(e => {});
    document.getElementById('barcodeModal').classList.add('hidden');
}

function startVoiceOrdering() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) return alert("⚠️ Browser របស់អ្នកមិនគាំទ្រ Web Speech API ទេ!");
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'km-KH';
    recognition.start();

    recognition.onresult = (event) => {
        const speechResult = event.results[0][0].transcript.trim();
        const matchedProd = productsData.find(p => speechResult.toLowerCase().includes(p.name.toLowerCase()));
        if (matchedProd) {
            document.getElementById('invoiceProductInput').value = matchedProd.name;
            autoFillProductPrice();
        }
    };
}

function addItemToCurrentInvoice() {
    const productId = document.getElementById('invoiceProductIdHidden').value;
    const qty = parseInt(document.getElementById('invoiceQty').value);
    const price = parseFloat(document.getElementById('invoiceUnitPrice').value);
    const product = productsData.find(p => p.id == productId);

    if (!product || isNaN(qty) || qty <= 0) return alert("⚠️ សូមបំពេញព័ត៌មានទំនិញឱ្យបានត្រឹមត្រូវ!");
    if (qty > product.avail) return alert(`⚠️ ស្តុកមិនគ្រប់គ្រាន់! សល់តែ ${product.avail} ទេ។`);

    const existingItem = currentInvoiceItems.find(item => item.productId == productId);
    if (existingItem) {
        existingItem.qty += qty;
        existingItem.totalPrice = existingItem.qty * existingItem.price;
    } else {
        currentInvoiceItems.push({ productId: product.id, name: product.name, qty, price, totalPrice: qty * price });
    }

    document.getElementById('invoiceProductInput').value = '';
    document.getElementById('invoiceUnitPrice').value = '';
    document.getElementById('invoiceQty').value = '1';
    renderInvoicePreviewTable();
}

function removeInvoiceItem(index) {
    currentInvoiceItems.splice(index, 1);
    renderInvoicePreviewTable();
}

function renderInvoicePreviewTable() {
    const tbody = document.getElementById('invoiceItemsTableBody');
    if (!tbody) return;
    let html = '', itemsTotal = 0;
    
    currentInvoiceItems.forEach((item, index) => {
        itemsTotal += item.totalPrice;
        html += `<tr class="border-b dark:border-slate-800 text-xs"><td class="p-2 text-center">${index + 1}</td><td class="p-2 font-medium">${item.name}</td><td class="p-2 text-center">${item.qty}</td><td class="p-2 text-right">$${item.price.toFixed(2)}</td><td class="p-2 text-right font-bold">$${item.totalPrice.toFixed(2)}</td><td class="p-2 text-center"><button onclick="removeInvoiceItem(${index})" class="text-rose-500 cursor-pointer">❌</button></td></tr>`;
    });
    tbody.innerHTML = html;

    const deliveryFee = parseFloat(document.getElementById('invoiceDeliveryFee').value) || 0;
    const discount = parseFloat(document.getElementById('invoiceDiscount').value) || 0;
    const grandTotal = Math.max(0, itemsTotal + deliveryFee - discount);
    currentInvoiceGrandTotal = grandTotal;

    document.getElementById('pdfDeliveryFeeText').innerText = `$${deliveryFee.toFixed(2)}`;
    document.getElementById('invoiceGrandTotal').innerHTML = `$${grandTotal.toFixed(2)} <span class="text-xs font-normal text-slate-500">(${Math.round(grandTotal * 4000).toLocaleString('km-KH')} ៛)</span>`;
    
    generateDynamicKHQR(grandTotal);
    calculateChange();
}

function calculateChange() {
    const cash = parseFloat(document.getElementById('cashReceived').value) || 0;
    const change = cash - currentInvoiceGrandTotal;
    document.getElementById('changeDue').value = cash <= 0 ? '$0.00' : (change < 0 ? `ខ្វះ $${Math.abs(change).toFixed(2)}` : `$${change.toFixed(2)} (${Math.round(change * 4000).toLocaleString('km-KH')} ៛)`);
}

function generateDynamicKHQR(amount) {
    const container = document.getElementById('qrcode');
    if (!container) return;
    container.innerHTML = '';
    qrcodeInstance = new QRCode(container, {
        text: `00020101021230380016bakong@vckshop0108VCK_SHOP5204599953038405405${amount.toFixed(2)}5802KH5910VCK SHOP6010Phnom Penh6304`,
        width: 80, height: 80, colorDark: "#0f172a", colorLight: "#ffffff"
    });
}

async function saveFinalInvoice() {
    const customer = document.getElementById('invoiceCustomer').value.trim();
    const phone = document.getElementById('invoicePhone').value.trim();
    const location = document.getElementById('invoiceLocation').value.trim();
    const date = document.getElementById('invoiceDate').value;
    const driver = document.getElementById('invoiceDriverSelect')?.value || 'មិនទាន់ចាត់ចែង';
    const deliveryFee = parseFloat(document.getElementById('invoiceDeliveryFee').value) || 0;
    const discount = parseFloat(document.getElementById('invoiceDiscount')?.value) || 0;

    if (!customer || !location || currentInvoiceItems.length === 0) return alert("⚠️ សូមបំពេញព័ត៌មានឱ្យបានគ្រប់គ្រាន់!");

    const invCode = 'INV-' + Math.floor(100000 + Math.random() * 900000);
    const total = Math.max(0, currentInvoiceItems.reduce((s, i) => s + i.totalPrice, 0) + deliveryFee - discount);

    currentInvoiceItems.forEach(i => {
        const p = productsData.find(prod => prod.id === i.productId);
        if (p) p.avail -= i.qty;
    });

    try {
        await database.ref('sales').child(invCode).set({ invCode, customer, phone, location, date, total, items: currentInvoiceItems });
        await database.ref('deliveries').child(invCode).set({ invCode, customer, phone, location, driver, status: "កំពុងរៀបចំ" });
        
        const productsObj = {};
        productsData.forEach(p => { productsObj[p.id] = p; });
        await database.ref('products').set(productsObj);

        await sendTelegramNotification(invCode, customer, phone, location, total, currentInvoiceItems);
        alert(`🎉 រក្សាទុកវិក្កយបត្រ ${invCode} ជោគជ័យ!`);
        resetInvoiceForm();
        switchTab('delivery');
    } catch (e) {
        alert("❌ មានបញ្ហាក្នុងការរក្សាទុក!");
    }
}

function resetInvoiceForm() {
    currentInvoiceItems = [];
    ['invoiceCustomer', 'invoicePhone', 'invoiceLocation'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('invoiceDeliveryFee').value = '0.00';
    document.getElementById('invoiceDiscount').value = '0.00';
    renderInvoicePreviewTable();
}

function addNewProductToStock() {
    if (currentUser?.role === 'Cashier') return alert("⚠️ អ្នកគ្មានសិទ្ធិទេ!");
    const name = document.getElementById('newProdName').value.trim();
    const cat = document.getElementById('newProdCat').value.trim();
    const total = parseInt(document.getElementById('newProdTotal').value);
    const price = parseFloat(document.getElementById('newProdPrice').value);
    if (!name || isNaN(total) || isNaN(price)) return alert("⚠️ សូមបំពេញទិន្នន័យឱ្យគ្រប់!");

    const id = Date.now();
    database.ref('products').child(id).set({ id, name, cat, total, avail: total, price }).then(() => {
        ['newProdName', 'newProdCat', 'newProdTotal', 'newProdPrice'].forEach(id => document.getElementById(id).value = '');
    });
}

function autoSaveProduct(id) {
    if (currentUser && currentUser.role === 'Cashier') return;
    const total = parseInt(document.getElementById(`inline-total-${id}`).value);
    const avail = parseInt(document.getElementById(`inline-avail-${id}`).value);
    const price = parseFloat(document.getElementById(`inline-price-${id}`).value);
    if (isNaN(total) || isNaN(avail) || isNaN(price)) return;
    database.ref('products').child(id).update({ total, avail, price });
}

function deleteProductFromStock(id) {
    if (!currentUser || currentUser.role !== 'Admin') return alert("⚠️ អ្នកគ្មានសិទ្ធិលុបទំនិញទេ!");
    if (confirm("⚠️ ចង់លុបទំនិញនេះមែនទេ?")) database.ref('products').child(id).remove();
}

function updateDriver(invCode, driver) { database.ref('deliveries/' + invCode).update({ driver }); }
function updateStatus(invCode, status) { 
    database.ref('deliveries/' + invCode).update({ status }).then(() => {
        if (status === 'បានប្រគល់ជូន') {
            const item = deliveryData.find(d => d.invCode === invCode);
            if (item) sendDeliverySuccessNotice(item.phone, invCode, item.customer);
        }
    });
}

function updateDeliveryStatsByDate() {
    const selectedDate = document.getElementById('deliveryStatDate')?.value;
    const counts = { "លាងហាក់": 0, "ផាន់នី": 0, "សុភាព": 0, "ផល្លីន": 0 };
    deliveryData.forEach(d => {
        const sale = salesData.find(s => s.invCode === d.invCode);
        if (sale?.date === selectedDate && counts.hasOwnProperty(d.driver) && d.status === 'បានប្រគល់ជូន') counts[d.driver]++;
    });
    ['លាងហាក់', 'ផាន់នី', 'សុភាព', 'ផល្លីន'].forEach((drv, i) => {
        const el = document.getElementById(`stat-driver-${i+1}`);
        if (el) el.innerText = `${counts[drv]} ជើង`;
    });
}

function renderDashboard() {
    const today = new Date().toISOString().split('T')[0];
    const date = document.getElementById('searchDate')?.value || '';
    let daily = 0, monthly = 0;
    salesData.forEach(s => {
        const t = parseFloat(s.total) || 0;
        if (date && s.date === date) daily += t;
        if (s.date?.startsWith(today.substring(0, 7))) monthly += t;
    });

    const isAdmin = currentUser?.role === 'Admin';
    document.getElementById('dashDailyAmount').innerText = isAdmin ? `$${daily.toFixed(2)}` : '***';
    document.getElementById('dashMonthlyAmount').innerText = isAdmin ? `$${monthly.toFixed(2)}` : '***';
    document.getElementById('dashTotalProducts').innerText = `${productsData.length} មុខ`;
    document.getElementById('dashLowStockCount').innerText = `${productsData.filter(p => p.avail <= 5).length} មុខ`;
    renderSalesTable(date);
}

function renderSalesTable(date) {
    const list = date ? salesData.filter(s => s.date === date) : salesData;
    const tbody = document.getElementById('salesTableBody');
    if (!tbody) return;
    tbody.innerHTML = list.length === 0 ? `<tr><td colspan="6" class="p-6 text-center text-xs text-slate-400">គ្មានទិន្នន័យ</td></tr>` : list.map(s => `
        <tr class="text-xs border-b border-slate-100 dark:border-slate-800">
            <td class="p-3 pl-6">${s.date}</td>
            <td class="p-3 text-indigo-600 font-bold cursor-pointer" onclick="viewInvoice('${s.invCode}')">${s.invCode}</td>
            <td class="p-3 font-bold">${s.customer}</td>
            <td class="p-3 text-slate-500">${s.location}</td>
            <td class="p-3 text-right font-bold text-emerald-600">$${parseFloat(s.total || 0).toFixed(2)}</td>
            <td class="p-3 text-center"><button onclick="viewInvoice('${s.invCode}')" class="bg-indigo-50 p-1.5 rounded-lg text-indigo-600">👁️</button></td>
        </tr>
    `).join('');
}

// 📈 មុខងារគូរក្រាហ្វិក Chart.js ទាំង ៣ យ៉ាងពេញលេញ
function renderCharts() {
    // 1. Chart ប្រៀបធៀបចំណូល
    const ctx1 = document.getElementById('comparisonChart')?.getContext('2d');
    if (ctx1) {
        if (comparisonChartInstance) comparisonChartInstance.destroy();
        comparisonChartInstance = new Chart(ctx1, {
            type: 'line',
            data: {
                labels: ['សប្តាហ៍ទី ១', 'សប្តាហ៍ទី ២', 'សប្តាហ៍ទី ៣', 'សប្តាហ៍ទី ៤'],
                datasets: [{
                    label: 'ខែនេះ ($)',
                    data: [150, 300, 450, 600],
                    borderColor: '#6366f1',
                    backgroundColor: 'rgba(99, 102, 241, 0.1)',
                    fill: true,
                    tension: 0.4
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }

    // 2. Chart ទំនិញលក់ដាច់បំផុត
    const ctx2 = document.getElementById('bestSellersChart')?.getContext('2d');
    if (ctx2) {
        if (myChartInstance) myChartInstance.destroy();
        myChartInstance = new Chart(ctx2, {
            type: 'doughnut',
            data: {
                labels: productsData.slice(0, 5).map(p => p.name),
                datasets: [{
                    data: productsData.slice(0, 5).map(p => p.total - p.avail),
                    backgroundColor: ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6']
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }

    // 3. Chart តំបន់ដឹកជញ្ជូន (Delivery Hotspots)
    const ctx3 = document.getElementById('locationHotspotsChart')?.getContext('2d');
    if (ctx3) {
        if (locationChartInstance) locationChartInstance.destroy();
        
        const locCounts = {};
        salesData.forEach(s => {
            if (s.location) locCounts[s.location] = (locCounts[s.location] || 0) + 1;
        });

        locationChartInstance = new Chart(ctx3, {
            type: 'bar',
            data: {
                labels: Object.keys(locCounts).length ? Object.keys(locCounts) : ['ភ្នំពេញ', 'សៀមរាប', 'បាត់ដំបង'],
                datasets: [{
                    label: 'ចំនួនជើងដឹក',
                    data: Object.values(locCounts).length ? Object.values(locCounts) : [12, 8, 5],
                    backgroundColor: '#10b981'
                }]
            },
            options: { responsive: true, maintainAspectRatio: false }
        });
    }
}

function renderAll() {
    renderDashboard();
    
    // បង្ហាញបញ្ជីទំនិញក្នុងស្តុក (Stock Table Render)
    const stockTbody = document.getElementById('stockTableBody');
    if (stockTbody) {
        const isAdmin = currentUser && currentUser.role === 'Admin';
        stockTbody.innerHTML = productsData.length === 0 ? `<tr><td colspan="7" class="p-6 text-center text-xs font-bold text-slate-400">📦 មិនទាន់មានទំនិញក្នុងស្តុកទេ</td></tr>` : productsData.map((p, index) => `
            <tr class="text-xs hover:bg-slate-50 dark:hover:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                <td class="p-3 text-center font-bold text-slate-400">${index + 1}</td>
                <td class="p-3 font-bold text-slate-800 dark:text-slate-200">${p.name}</td>
                <td class="p-3"><span class="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-lg text-[10px] font-bold">${p.cat}</span></td>
                <td class="p-2 text-center"><input type="number" id="inline-total-${p.id}" value="${p.total}" ${!isAdmin?'readonly':''} onchange="autoSaveProduct(${p.id})" class="w-16 border rounded-lg text-center p-1 font-bold dark:bg-slate-800 dark:text-white"></td>
                <td class="p-2 text-center"><input type="number" id="inline-avail-${p.id}" value="${p.avail}" ${!isAdmin?'readonly':''} onchange="autoSaveProduct(${p.id})" class="w-16 border rounded-lg text-center p-1 font-bold ${p.avail <= 5 ? 'text-rose-500 bg-rose-50' : ''} dark:bg-slate-800 dark:text-white"></td>
                <td class="p-2 text-right"><input type="number" step="0.01" id="inline-price-${p.id}" value="${p.price}" ${!isAdmin?'readonly':''} onchange="autoSaveProduct(${p.id})" class="w-20 border rounded-lg text-right p-1 font-bold dark:bg-slate-800 dark:text-white"></td>
                <td class="p-3 text-center">${isAdmin ? `<button onclick="deleteProductFromStock(${p.id})" class="text-rose-600 hover:text-rose-800 cursor-pointer text-sm">🗑️</button>` : '🔒'}</td>
            </tr>
        `).join('');
    }

    const tbody = document.getElementById('deliveryTableBody');
    if (tbody) {
        tbody.innerHTML = deliveryData.length === 0 ? `<tr><td colspan="8" class="p-6 text-center text-xs text-slate-400">គ្មានជើងដឹក</td></tr>` : deliveryData.map(d => `
            <tr class="text-xs border-b border-slate-100 dark:border-slate-800">
                <td class="p-4 pl-6">${salesData.find(s => s.invCode === d.invCode)?.date || '-'}</td>
                <td class="p-4 font-bold text-indigo-600">${d.invCode}</td>
                <td class="p-4 font-bold">${d.customer}</td>
                <td class="p-4">ភ្នំពេញ</td>
                <td class="p-4 font-medium">${d.location}</td>
                <td class="p-4"><select onchange="updateDriver('${d.invCode}', this.value)" class="border p-1 rounded text-xs"><option value="មិនទាន់ចាត់ចែង">---</option><option value="លាងហាក់" ${d.driver==='លាងហាក់'?'selected':''}>លាងហាក់</option><option value="ផាន់នី" ${d.driver==='ផាន់នី'?'selected':''}>ផាន់នី</option><option value="សុភាព" ${d.driver==='សុភាព'?'selected':''}>សុភាព</option><option value="ផល្លីន" ${d.driver==='ផល្លីន'?'selected':''}>ផល្លីន</option></select></td>
                <td class="p-4 text-center"><span class="px-2 py-1 rounded text-[10px] font-bold ${d.status==='បានប្រគល់ជូន'?'bg-emerald-50 text-emerald-600':'bg-indigo-50 text-indigo-600'}">${d.status}</span></td>
                <td class="p-4 text-center"><select onchange="updateStatus('${d.invCode}', this.value)" class="border p-1 rounded text-xs"><option value="កំពុងរៀបចំ">កំពុងរៀបចំ</option><option value="កំពុងដឹក">កំពុងដឹក</option><option value="បានប្រគល់ជូន">បានប្រគល់ជូន</option></select></td>
            </tr>
        `).join('');
    }
    updateDeliveryStatsByDate();
    renderCharts(); // 👈 ហៅក្រាហ្វិកឱ្យដំណើរការគ្រប់ជ្រុងជ្រោយ
}

function searchStockFunction() {
    let filter = document.getElementById("searchStockInput").value.toLowerCase();
    let trs = document.getElementById("stockTableBody").getElementsByTagName("tr");
    for (let tr of trs) {
        let name = tr.getElementsByTagName("td")[1]?.textContent || '';
        let cat = tr.getElementsByTagName("td")[2]?.textContent || '';
        tr.style.display = (name.toLowerCase().includes(filter) || cat.toLowerCase().includes(filter)) ? "" : "none";
    }
}

function viewInvoice(id) {
    database.ref('sales/' + id).once('value').then(snap => {
        const data = snap.val();
        if (!data) return;
        document.getElementById('modalInvoiceContent').innerHTML = `
            <p><b>វិក្កយបត្រ:</b> ${data.invCode}</p>
            <p><b>អតិថិជន:</b> ${data.customer} (${data.phone})</p>
            <table class="w-full text-xs border mt-3"><thead><tr class="bg-slate-100"><th class="p-2">ទំនិញ</th><th class="p-2">ចំនួន</th><th class="p-2">សរុប</th></tr></thead>
            <tbody>${data.items.map(i => `<tr><td class="p-2">${i.name}</td><td class="p-2 text-center">${i.qty}</td><td class="p-2 text-right">$${i.totalPrice.toFixed(2)}</td></tr>`).join('')}</tbody></table>
            <p class="text-right font-black mt-3 text-indigo-600">សរុប: $${parseFloat(data.total).toFixed(2)}</p>
        `;
        document.getElementById('invoiceModal').classList.remove('hidden');
    });
}

function closeInvoiceModal() { document.getElementById('invoiceModal').classList.add('hidden'); }
function toggleMobileMenu() { document.getElementById('sidebarMenu').classList.toggle('hidden'); }
