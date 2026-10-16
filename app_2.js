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

let productsData = [], currentUser = null, salesData = [], deliveryData = [], currentInvoiceItems = [], attendanceData = [], carContactsData = [];
let myChartInstance = null, comparisonChartInstance = null, locationChartInstance = null, qrcodeInstance = null;
let currentInvoiceGrandTotal = 0;
let html5QrCodeScanner = null, html5AttendanceScanner = null;
let selectedAttendanceType = 'Check-in';

const TELEGRAM_BOT_TOKEN = "8839366312:AAFIDVQrCvb36nAfZc3AzYZ7PHCBo5pQmgU";
const STAFF_ACCOUNTS = {
    'vicheka': { name: 'វិច្ឆិកា', role: 'Admin' },
    'leanghak': { name: 'លាងហាក់', role: 'Admin' },
    'phanny': { name: 'ផាន់នី', role: 'Cashier' },
    'sopheap': { name: 'សុភាព', role: 'Cashier' },
    'phellin': { name: 'ផល្លីន', role: 'Cashier' }
};

const STORE_LOCATION = { lat: 11.5564, lng: 104.9282, maxDistanceMeter: 50000 };

window.addEventListener('DOMContentLoaded', () => {
    startClock();
    initTheme();
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

async function getTelegramChatId() {
    try {
        const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates`);
        const data = await response.json();
        if (data.ok && data.result.length > 0) {
            const lastUpdate = data.result[data.result.length - 1];
            return lastUpdate.message?.chat?.id || lastUpdate.my_chat_member?.chat?.id;
        }
    } catch (e) {}
    return null;
}

async function sendTelegramNotification(invCode, customer, phone, location, total, items) {
    const chatId = await getTelegramChatId();
    if (!chatId) return;
    const itemsListStr = items.map(i => `▪️ <b>${i.name}</b> (x${i.qty}) : <b>$${i.totalPrice.toFixed(2)}</b>`).join('\n');
    const message = `🚨 <b>មានការបញ្ជាទិញថ្មី! (VCK SHOP)</b>\n\n🧾 លេខវិក្កយបត្រ: <b>${invCode}</b>\n👤 អតិថិជន: <b>${customer}</b> (${phone})\n📍 ទីតាំងដឹក: <b>${location}</b>\n━━━━━━━━━━━━━━━━━━━\n🛒 <b>ទំនិញ៖</b>\n${itemsListStr}\n━━━━━━━━━━━━━━━━━━━\n💰 <b>សរុប: $${total.toFixed(2)}</b>`;
    await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' })
    });
}

function sendDirectCustomerTelegramModal() {
    if (currentInvoiceItems.length === 0) return alert("⚠️ សូមបញ្ចូលមុខទំនិញក្នុងវិក្កយបត្រជាមុនសិន!");
    document.getElementById('targetCustomerPhone').value = document.getElementById('invoicePhone').value || '';
    document.getElementById('telegramModal').classList.remove('hidden');
}

function closeTelegramModal() { document.getElementById('telegramModal').classList.add('hidden'); }

function shareDirectToTelegramLink() {
    const customer = document.getElementById('invoiceCustomer').value || 'អតិថិជន';
    const phone = document.getElementById('invoicePhone').value || '-';
    const location = document.getElementById('invoiceLocation').value || '-';
    const deliveryFee = parseFloat(document.getElementById('invoiceDeliveryFee').value) || 0;
    const discount = parseFloat(document.getElementById('invoiceDiscount').value) || 0;
    const grandTotal = Math.max(0, currentInvoiceItems.reduce((s, i) => s + i.totalPrice, 0) + deliveryFee - discount);
    const itemsListStr = currentInvoiceItems.map(i => `▪️ ${i.name} (x${i.qty}) ➔ $${i.totalPrice.toFixed(2)}`).join('\n');
    const message = `🛍️ **VCK SHOP - វិក្កយបត្រ**\n👤 ${customer} (${phone})\n📍 ${location}\n\n${itemsListStr}\n\n🚚 សេវាដឹក: $${deliveryFee.toFixed(2)}\n💰 **សរុប: $${grandTotal.toFixed(2)}**`;
    window.open(`https://t.me/share/url?url=&text=${encodeURIComponent(message)}`, '_blank');
    closeTelegramModal();
}

async function confirmSendTelegramByPhone() {
    const chatId = await getTelegramChatId();
    if (!chatId) return alert("⚠️ រកមិនឃើញ Chat ID!");
    alert("✅ បានផ្ញើវិក្កយបត្រជោគជ័យ!");
    closeTelegramModal();
}

function sendDeliverySuccessNotice(phone, invCode, name) {
    const text = `🎉 ✨ **អបអរសាទរ ${name}!** ✨ 🎉\n📦 វិក្កយបត្រ: ${invCode}\n🚚 ទំនិញបានដឹកជញ្ជូនដល់ដៃដោយសុវត្ថិភាព!\n🌟 **VCK SHOP**`;
    window.open(`https://t.me/share/url?url=&text=${encodeURIComponent(text)}`, '_blank');
}

function applyUserRolePermissions() {
    if (!currentUser) return;
    const isAdmin = currentUser.role === 'Admin';
    document.getElementById('dash-cards-container')?.classList.toggle('hidden', !isAdmin);
    document.getElementById('stock-entry-form')?.classList.toggle('hidden', !isAdmin);
    document.getElementById('adminAttendanceCard')?.classList.toggle('hidden', !isAdmin);
}

function initTheme() {
    const savedTheme = localStorage.getItem('vck_theme');
    if (savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
        document.getElementById('darkModeIcon').innerText = '☀️';
    }
}

function toggleDarkMode() {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('vck_theme', isDark ? 'dark' : 'light');
    document.getElementById('darkModeIcon').innerText = isDark ? '☀️' : '🌙';
}

function startClock() {
    setInterval(() => {
        const now = new Date();
        const el = document.getElementById('liveClockDisplay');
        if (el) el.innerText = now.toLocaleDateString('km-KH') + ' | ' + now.toLocaleTimeString('en-US', { hour12: true });
    }, 1000);
}

async function handleLogin() {
    const userIn = document.getElementById('loginUsername').value.trim().toLowerCase();
    const passIn = document.getElementById('loginPassword').value;
    const errorEl = document.getElementById('loginError');
    if (!userIn || !passIn) {
        errorEl.innerText = "⚠️ សូមបំពេញឈ្មោះ និងលេខសម្ងាត់!";
        errorEl.classList.remove('hidden');
        return;
    }
    const emailFormat = userIn.includes('@') ? userIn : `${userIn}@vckshop.com`;
    try {
        const res = await auth.signInWithEmailAndPassword(emailFormat, passIn);
        const staff = STAFF_ACCOUNTS[userIn];
        currentUser = { name: staff ? staff.name : userIn, role: staff ? staff.role : 'Cashier', email: res.user.email };
        errorEl.classList.add('hidden');
        initSystemAfterLogin();
    } catch (e) {
        errorEl.innerText = "⚠️ ឈ្មោះអ្នកប្រើប្រាស់ ឬ លេខសម្ងាត់មិនត្រឹមត្រូវ!";
        errorEl.classList.add('hidden');
    }
}

function initSystemAfterLogin() {
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('main-application').classList.remove('hidden');
    document.getElementById('topNavUser').innerText = currentUser.name;
    document.getElementById('topNavRole').innerText = currentUser.role;
    document.getElementById('userAvatar').innerText = currentUser.name.charAt(0).toUpperCase();

    const today = new Date().toISOString().split('T')[0];
    ['searchMonth', 'invoiceDate', 'deliveryStatDate', 'attendanceFilterDate'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = id === 'searchMonth' ? today.substring(0, 7) : today;
    });
    document.getElementById('pdfDate').innerText = today;

    applyUserRolePermissions();
    setupLivePreviewInputs();
    listenToFirebaseData();
    switchTab('dashboard');
}

async function handleLogout() {
    try { await auth.signOut(); location.reload(); } catch (e) {}
}

function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    document.getElementById('tab-' + tabId)?.classList.remove('hidden', 'animate-fade-in');
    document.getElementById('tab-' + tabId)?.classList.add('animate-fade-in');

    document.querySelectorAll('nav button').forEach(btn => btn.classList.remove('bg-indigo-600', 'text-white'));
    document.getElementById('btn-' + tabId)?.classList.add('bg-indigo-600', 'text-white');

    const titles = { 
        'dashboard': '📊 ផ្ទាំងគ្រប់គ្រងទូទៅ', 
        'sales': '📄 វិក្កយបត្រលក់', 
        'delivery': '🚚 ប្រព័ន្ធដឹកជញ្ជូន', 
        'stock': '📦 ឃ្លាំងស្តុក', 
        'attendance': '⏰ ស្កែនវត្តមាន', 
        'customer-history': '👥 ប្រវត្តិអតិថិជន',
        'car-contacts': '🚐 លេខទូរស័ព្ទឡាន និងចំណត'
    };
    document.getElementById('pageTitle').innerText = titles[tabId] || 'VCK System';

    if (window.innerWidth < 768) {
        document.getElementById('sidebarMenu')?.classList.add('hidden');
    }
}

function listenToFirebaseData() {
    database.ref('products').on('value', snap => { productsData = snap.val() ? Object.values(snap.val()) : []; setupInvoiceProductSelect(); renderAll(); });
    database.ref('sales').on('value', snap => { salesData = snap.val() ? Object.values(snap.val()) : []; renderAll(); });
    database.ref('deliveries').on('value', snap => { deliveryData = snap.val() ? Object.values(snap.val()) : []; renderAll(); });
    database.ref('attendance').on('value', snap => { attendanceData = snap.val() ? Object.values(snap.val()) : []; if (currentUser?.role === 'Admin') renderAttendanceTable(); });
    database.ref('carContacts').on('value', snap => { carContactsData = snap.val() ? Object.values(snap.val()) : []; renderCarContactsTable(); });
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3, φ1 = lat1 * Math.PI/180, φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180, Δλ = (lon2-lon1) * Math.PI/180;
    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) * Math.sin(Δλ/2);
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
}

function setScanType(type) {
    selectedAttendanceType = type;
    document.getElementById('btnCheckIn').className = `flex-1 py-2.5 px-4 rounded-xl text-xs font-bold ${type === 'Check-in' ? 'bg-emerald-600 text-white shadow-md' : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'} cursor-pointer`;
    document.getElementById('btnCheckOut').className = `flex-1 py-2.5 px-4 rounded-xl text-xs font-bold ${type === 'Check-out' ? 'bg-rose-600 text-white shadow-md' : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'} cursor-pointer`;
    document.getElementById('lateReasonContainer').classList.toggle('hidden', type !== 'Check-in' || new Date().getHours() < 8);
}

function startAttendanceScanner() {
    document.getElementById('attendanceReader').classList.remove('hidden');
    document.getElementById('closeAttendanceCam').classList.remove('hidden');
    html5AttendanceScanner = new Html5QrcodeScanner("attendanceReader", { fps: 10, qrbox: { width: 250, height: 250 } }, false);
    html5AttendanceScanner.render((text) => {
        if (text.trim() === "VCK-SHOP-OFFICIAL") { verifyAndSubmitAttendance(); stopAttendanceScanner(); }
        else alert("⚠️ QR Code មិនត្រឹមត្រូវ!");
    }, () => {});
}

function stopAttendanceScanner() {
    html5AttendanceScanner?.clear().catch(() => {});
    document.getElementById('attendanceReader').classList.add('hidden');
    document.getElementById('closeAttendanceCam').classList.add('hidden');
}

function verifyAndSubmitAttendance() {
    const statusEl = document.getElementById('geoStatus');
    if (!navigator.geolocation) return alert("⚠️ Browser មិនគាំទ្រ GPS!");
    statusEl.innerText = "⏳ កំពុងពិនិត្យ GPS...";
    navigator.geolocation.getCurrentPosition(async pos => {
        const dist = calculateDistance(pos.coords.latitude, pos.coords.longitude, STORE_LOCATION.lat, STORE_LOCATION.lng);
        if (dist > STORE_LOCATION.maxDistanceMeter) return alert(`⚠️ អ្នកនៅឆ្ងាយពីហាង (${Math.round(dist)}m)!`);
        statusEl.innerText = `✅ ទីតាំងត្រឹមត្រូវ`;
        await saveAttendanceRecord(selectedAttendanceType);
    }, () => alert("⚠️ សូមបើក GPS!"), { enableHighAccuracy: true });
}

async function saveAttendanceRecord(type) {
    const now = new Date(), date = now.toISOString().split('T')[0], time = now.toLocaleTimeString('en-US', { hour12: true });
    const reason = (type === 'Check-in' && now.getHours() >= 8) ? (document.getElementById('attendanceLateReason')?.value.trim() || 'មកយឺត') : '-';
    if (attendanceData.some(a => a.staffName === currentUser.name && a.date === date && a.type === type)) return alert(`⚠️ បាន ${type} រួចរាល់ហើយថ្ងៃនេះ!`);
    await database.ref('attendance').push({ staffName: currentUser.name, type, date, time, lateReason: reason, timestamp: Date.now() });
    alert(`🎉 ${currentUser.name} បាន ${type} ជោគជ័យ!`);
}

function renderAttendanceTable() {
    if (currentUser?.role !== 'Admin') return;
    const tbody = document.getElementById('attendanceTableBody');
    const date = document.getElementById('attendanceFilterDate')?.value || new Date().toISOString().split('T')[0];
    const list = attendanceData.filter(a => a.date === date);
    tbody.innerHTML = list.length === 0 ? `<tr><td colspan="4" class="p-4 text-center text-xs text-slate-400">គ្មានទិន្នន័យ</td></tr>` : list.map(a => `<tr class="text-xs border-b dark:border-slate-800"><td class="p-3 pl-4 font-bold">${a.staffName}</td><td class="p-3"><span class="px-2 py-1 rounded-lg text-[10px] font-bold ${a.type==='Check-in'?'bg-emerald-100 text-emerald-700':'bg-rose-100 text-rose-700'}">${a.type}</span></td><td class="p-3">${a.date} | ${a.time}</td><td class="p-3 text-rose-600 font-bold">${a.lateReason}</td></tr>`).join('');
}

function setupLivePreviewInputs() {
    ['Customer', 'Phone', 'Location', 'Date'].forEach(id => {
        document.getElementById('invoice' + id)?.addEventListener('input', e => document.getElementById('pdf' + id).innerText = e.target.value || '-');
    });
}

function setupInvoiceProductSelect() {
    const list = document.getElementById('productList');
    if (list) list.innerHTML = productsData.map(p => `<option value="${p.name}" data-price="${p.price}" data-id="${p.id}" data-avail="${p.avail}">${p.name} (សល់: ${p.avail})</option>`).join('');
}

function autoFillProductPrice() {
    const opt = Array.from(document.getElementById('productList').options).find(o => o.value === document.getElementById('invoiceProductInput').value);
    if (opt) {
        document.getElementById('invoiceUnitPrice').value = opt.getAttribute('data-price');
        document.getElementById('invoiceProductIdHidden').value = opt.getAttribute('data-id');
        document.getElementById('invoiceQty').max = opt.getAttribute('data-avail');
    }
}

function startBarcodeScanner() {
    document.getElementById('barcodeModal').classList.remove('hidden');
    html5QrCodeScanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: { width: 250, height: 250 } }, false);
    html5QrCodeScanner.render(text => {
        const p = productsData.find(x => x.id == text || x.name.toLowerCase().includes(text.toLowerCase()));
        if (p) { document.getElementById('invoiceProductInput').value = p.name; autoFillProductPrice(); stopBarcodeScanner(); }
    }, () => {});
}

function stopBarcodeScanner() { html5QrCodeScanner?.clear().catch(() => {}); document.getElementById('barcodeModal').classList.add('hidden'); }

function startVoiceOrdering() {
    const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRec) return alert("⚠️ Browser មិនគាំទ្រ Voice!");
    const rec = new SpeechRec(); rec.lang = 'km-KH'; rec.start();
    rec.onresult = e => {
        const res = e.results[0][0].transcript.toLowerCase();
        const p = productsData.find(x => res.includes(x.name.toLowerCase()));
        if (p) { document.getElementById('invoiceProductInput').value = p.name; autoFillProductPrice(); }
    };
}

function addItemToCurrentInvoice() {
    const id = document.getElementById('invoiceProductIdHidden').value;
    const qty = parseInt(document.getElementById('invoiceQty').value);
    const price = parseFloat(document.getElementById('invoiceUnitPrice').value);
    const p = productsData.find(x => x.id == id);
    if (!p || isNaN(qty) || qty <= 0) return alert("⚠️ សូមជ្រើសរើសទំនិញឱ្យបានត្រឹមត្រូវ!");
    if (qty > p.avail) return alert(`⚠️ ស្តុកសល់តែ ${p.avail} ទេ។`);
    const item = currentInvoiceItems.find(x => x.productId == id);
    if (item) { item.qty += qty; item.totalPrice = item.qty * price; }
    else currentInvoiceItems.push({ productId: p.id, name: p.name, qty, price, totalPrice: qty * price });
    renderInvoicePreviewTable();
}

function removeInvoiceItem(i) { currentInvoiceItems.splice(i, 1); renderInvoicePreviewTable(); }

function renderInvoicePreviewTable() {
    let total = 0;
    document.getElementById('invoiceItemsTableBody').innerHTML = currentInvoiceItems.map((item, i) => {
        total += item.totalPrice;
        return `<tr class="border-b dark:border-slate-800 text-xs"><td class="p-2 text-center">${i+1}</td><td class="p-2 font-medium">${item.name}</td><td class="p-2 text-center">${item.qty}</td><td class="p-2 text-right">$${item.price.toFixed(2)}</td><td class="p-2 text-right font-bold">$${item.totalPrice.toFixed(2)}</td><td class="p-2 text-center"><button onclick="removeInvoiceItem(${i})" class="text-rose-500 cursor-pointer">❌</button></td></tr>`;
    }).join('');
    const delivery = parseFloat(document.getElementById('invoiceDeliveryFee').value) || 0;
    const disc = parseFloat(document.getElementById('invoiceDiscount').value) || 0;
    currentInvoiceGrandTotal = Math.max(0, total + delivery - disc);
    document.getElementById('pdfDeliveryFeeText').innerText = `$${delivery.toFixed(2)}`;
    document.getElementById('invoiceGrandTotal').innerHTML = `$${currentInvoiceGrandTotal.toFixed(2)}`;
    generateDynamicKHQR(currentInvoiceGrandTotal);
    calculateChange();
}

function calculateChange() {
    const cash = parseFloat(document.getElementById('cashReceived').value) || 0;
    const change = cash - currentInvoiceGrandTotal;
    document.getElementById('changeDue').value = cash <= 0 ? '$0.00' : (change < 0 ? `ខ្វះ $${Math.abs(change).toFixed(2)}` : `$${change.toFixed(2)}`);
}

function generateDynamicKHQR(amt) {
    const c = document.getElementById('qrcode'); c.innerHTML = '';
    qrcodeInstance = new QRCode(c, { text: `00020101021230380016bakong@vckshop0108VCK_SHOP5204599953038405405${amt.toFixed(2)}5802KH5910VCK SHOP6010Phnom Penh6304`, width: 80, height: 80, colorDark: "#0f172a", colorLight: "#ffffff" });
}

async function saveFinalInvoice() {
    const customer = document.getElementById('invoiceCustomer').value.trim();
    const phone = document.getElementById('invoicePhone').value.trim();
    const location = document.getElementById('invoiceLocation').value.trim();
    const date = document.getElementById('invoiceDate').value;
    const deliveryFee = parseFloat(document.getElementById('invoiceDeliveryFee').value) || 0;
    const discount = parseFloat(document.getElementById('invoiceDiscount').value) || 0;
    if (!customer || !location || currentInvoiceItems.length === 0) return alert("⚠️ សូមបំពេញព័ត៌មានឱ្យគ្រប់!");
    const invCode = 'INV-' + Math.floor(100000 + Math.random() * 900000);
    const total = Math.max(0, currentInvoiceItems.reduce((s, i) => s + i.totalPrice, 0) + deliveryFee - discount);
    currentInvoiceItems.forEach(i => { const p = productsData.find(x => x.id === i.productId); if (p) p.avail -= i.qty; });
    await database.ref('sales/' + invCode).set({ invCode, customer, phone, location, date, total, items: currentInvoiceItems });
    await database.ref('deliveries/' + invCode).set({ invCode, customer, phone, location, driver: 'មិនទាន់ចាត់ចែង', status: "កំពុងរៀបចំ" });
    const pObj = {}; productsData.forEach(p => pObj[p.id] = p); await database.ref('products').set(pObj);
    await sendTelegramNotification(invCode, customer, phone, location, total, currentInvoiceItems);
    alert(`🎉 រក្សាទុកវិក្កយបត្រ ${invCode} ជោគជ័យ!`);
    currentInvoiceItems = []; renderInvoicePreviewTable(); switchTab('delivery');
}

function resetInvoiceForm() { currentInvoiceItems = []; renderInvoicePreviewTable(); }
function addNewProductToStock() {
    if (currentUser?.role === 'Cashier') return alert("⚠️ គ្មានសិទ្ធិ!");
    const name = document.getElementById('newProdName').value, cat = document.getElementById('newProdCat').value, total = parseInt(document.getElementById('newProdTotal').value), price = parseFloat(document.getElementById('newProdPrice').value);
    if (!name || isNaN(total) || isNaN(price)) return alert("⚠️ សូមបំពេញទិន្នន័យឱ្យគ្រប់!");
    const id = Date.now();
    database.ref('products/' + id).set({ id, name, cat, total, avail: total, price }).then(() => {
        ['newProdName', 'newProdCat', 'newProdTotal', 'newProdPrice'].forEach(id => document.getElementById(id).value = '');
    });
}

function autoSaveProduct(id) {
    if (currentUser?.role === 'Cashier') return;
    database.ref('products/' + id).update({ total: parseInt(document.getElementById(`inline-total-${id}`).value), avail: parseInt(document.getElementById(`inline-avail-${id}`).value), price: parseFloat(document.getElementById(`inline-price-${id}`).value) });
}

function deleteProductFromStock(id) { if (currentUser?.role === 'Admin' && confirm("⚠️ លុบทំនិញនេះ?")) database.ref('products/' + id).remove(); }
function updateDriver(code, driver) { database.ref('deliveries/' + code).update({ driver }); }
function updateStatus(code, status) {
    database.ref('deliveries/' + code).update({ status }).then(() => {
        if (status === 'បានប្រគល់ជូន') { const item = deliveryData.find(x => x.invCode === code); if (item) sendDeliverySuccessNotice(item.phone, code, item.customer); }
    });
}

function updateDeliveryStatsByDate() {
    const date = document.getElementById('deliveryStatDate')?.value;
    const counts = { "លាងហាក់": 0, "ផាន់នី": 0, "សុភាព": 0, "ផល្លីន": 0 };
    deliveryData.forEach(d => {
        const s = salesData.find(x => x.invCode === d.invCode);
        if (s?.date === date && counts.hasOwnProperty(d.driver) && d.status === 'បានប្រគល់ជូន') counts[d.driver]++;
    });
    ['លាងហាក់', 'ផាន់នី', 'សុភាព', 'ផល្លីន'].forEach((drv, i) => { document.getElementById(`stat-driver-${i+1}`).innerText = `${counts[drv]} ជើង`; });
}

function renderDashboard() {
    const today = new Date().toISOString().split('T')[0], date = document.getElementById('searchDate')?.value || '';
    let daily = 0, monthly = 0;
    salesData.forEach(s => { const t = parseFloat(s.total) || 0; if (date && s.date === date) daily += t; if (s.date?.startsWith(today.substring(0, 7))) monthly += t; });
    const isAdmin = currentUser?.role === 'Admin';
    document.getElementById('dashDailyAmount').innerText = isAdmin ? `$${daily.toFixed(2)}` : '***';
    document.getElementById('dashMonthlyAmount').innerText = isAdmin ? `$${monthly.toFixed(2)}` : '***';
    document.getElementById('dashTotalProducts').innerText = `${productsData.length} មុខ`;
    document.getElementById('dashLowStockCount').innerText = `${productsData.filter(p => p.avail <= 5).length} មុខ`;
    renderSalesTable(date);
}

function renderSalesTable(date) {
    const list = date ? salesData.filter(s => s.date === date) : salesData;
    document.getElementById('salesTableBody').innerHTML = list.length === 0 ? `<tr><td colspan="6" class="p-6 text-center text-xs text-slate-400">គ្មានទិន្នន័យ</td></tr>` : list.map(s => `<tr class="text-xs border-b dark:border-slate-800"><td class="p-3 pl-6">${s.date}</td><td class="p-3 text-indigo-600 font-bold cursor-pointer" onclick="viewInvoice('${s.invCode}')">${s.invCode}</td><td class="p-3 font-bold">${s.customer}</td><td class="p-3">${s.location}</td><td class="p-3 text-right font-bold text-emerald-600">$${parseFloat(s.total).toFixed(2)}</td><td class="p-3 text-center"><button onclick="viewInvoice('${s.invCode}')" class="bg-indigo-50 p-1.5 rounded-lg text-indigo-600">👁️</button></td></tr>`).join('');
}

function renderCharts() {
    const ctx1 = document.getElementById('comparisonChart')?.getContext('2d');
    if (ctx1) {
        if (comparisonChartInstance) comparisonChartInstance.destroy();
        comparisonChartInstance = new Chart(ctx1, { type: 'line', data: { labels: ['សប្តាហ៍ ១', 'សប្តាហ៍ ២', 'សប្តាហ៍ ៣', 'សប្តាហ៍ ៤'], datasets: [{ label: 'ខែនេះ ($)', data: [150, 300, 450, 600], borderColor: '#6366f1', backgroundColor: 'rgba(99, 102, 241, 0.1)', fill: true, tension: 0.4 }] }, options: { responsive: true, maintainAspectRatio: false } });
    }
    const ctx2 = document.getElementById('bestSellersChart')?.getContext('2d');
    if (ctx2) {
        if (myChartInstance) myChartInstance.destroy();
        myChartInstance = new Chart(ctx2, { type: 'doughnut', data: { labels: productsData.slice(0, 5).map(p => p.name), datasets: [{ data: productsData.slice(0, 5).map(p => p.total - p.avail), backgroundColor: ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'] }] }, options: { responsive: true, maintainAspectRatio: false } });
    }
    const ctx3 = document.getElementById('locationHotspotsChart')?.getContext('2d');
    if (ctx3) {
        if (locationChartInstance) locationChartInstance.destroy();
        const locCounts = {}; salesData.forEach(s => { if (s.location) locCounts[s.location] = (locCounts[s.location] || 0) + 1; });
        locationChartInstance = new Chart(ctx3, { type: 'bar', data: { labels: Object.keys(locCounts).length ? Object.keys(locCounts) : ['ភ្នំពេញ'], datasets: [{ label: 'ជើងដឹក', data: Object.values(locCounts).length ? Object.values(locCounts) : [10], backgroundColor: '#10b981' }] }, options: { responsive: true, maintainAspectRatio: false } });
    }
}

function renderAll() {
    renderDashboard();
    const isAdmin = currentUser?.role === 'Admin';
    const stockTbody = document.getElementById('stockTableBody');
    if (stockTbody) {
        stockTbody.innerHTML = productsData.map((p, i) => `<tr class="text-xs border-b dark:border-slate-800"><td class="p-3 text-center font-bold text-slate-400">${i+1}</td><td class="p-3 font-bold">${p.name}</td><td class="p-3"><span class="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-lg text-[10px]">${p.cat}</span></td><td class="p-2 text-center"><input type="number" id="inline-total-${p.id}" value="${p.total}" ${!isAdmin?'readonly':''} onchange="autoSaveProduct(${p.id})" class="vcm-input w-16 border rounded text-center p-1 font-bold"></td><td class="p-2 text-center"><input type="number" id="inline-avail-${p.id}" value="${p.avail}" ${!isAdmin?'readonly':''} onchange="autoSaveProduct(${p.id})" class="w-16 border rounded text-center p-1 font-bold ${p.avail<=5?'text-rose-500 bg-rose-50':''}"></td><td class="p-2 text-right"><input type="number" step="0.01" id="inline-price-${p.id}" value="${p.price}" ${!isAdmin?'readonly':''} onchange="autoSaveProduct(${p.id})" class="w-20 border rounded text-right p-1 font-bold"></td><td class="p-3 text-center">${isAdmin?`<button onclick="deleteProductFromStock(${p.id})" class="text-rose-600">🗑️</button>`:'🔒'}</td></tr>`).join('');
    }
    const tbody = document.getElementById('deliveryTableBody');
    if (tbody) {
        tbody.innerHTML = deliveryData.map(d => `<tr class="text-xs border-b dark:border-slate-800"><td class="p-4 pl-6">${salesData.find(s=>s.invCode===d.invCode)?.date||'-'}</td><td class="p-4 font-bold text-indigo-600">${d.invCode}</td><td class="p-4 font-bold">${d.customer}</td><td class="p-4">ភ្នំពេញ</td><td class="p-4">${d.location}</td><td class="p-4"><select onchange="updateDriver('${d.invCode}', this.value)" class="vck-input p-1 rounded text-xs"><option value="មិនទាន់ចាត់ចែង">---</option><option value="លាងហាក់" ${d.driver==='លាងហាក់'?'selected':''}>លាងហាក់</option><option value="ផាន់នី" ${d.driver==='ផាន់នី'?'selected':''}>ផាន់នី</option><option value="សុភាព" ${d.driver==='សុភាព'?'selected':''}>សុភាព</option><option value="ផល្លីន" ${d.driver==='ផល្លីន'?'selected':''}>ផល្លីន</option></select></td><td class="p-4 text-center"><span class="px-2 py-1 rounded text-[10px] font-bold ${d.status==='បានប្រគល់ជូន'?'bg-emerald-50 text-emerald-600':'bg-indigo-50 text-indigo-600'}">${d.status}</span></td><td class="p-4 text-center"><select onchange="updateStatus('${d.invCode}', this.value)" class="vck-input p-1 rounded text-xs"><option value="កំពុងរៀបចំ">កំពុងរៀបចំ</option><option value="កំពុងដឹក">កំពុងដឹក</option><option value="បានប្រគល់ជូន">បានប្រគល់ជូន</option></select></td></tr>`).join('');
    }
    updateDeliveryStatsByDate();
    renderCharts();
}

function searchStockFunction() {
    const filter = document.getElementById("searchStockInput").value.toLowerCase();
    Array.from(document.getElementById("stockTableBody").getElementsByTagName("tr")).forEach(tr => {
        tr.style.display = (tr.cells[1]?.textContent.toLowerCase().includes(filter) || tr.cells[2]?.textContent.toLowerCase().includes(filter)) ? "" : "none";
    });
}

function viewInvoice(id) {
    database.ref('sales/' + id).once('value').then(snap => {
        const data = snap.val(); if (!data) return;
        document.getElementById('modalInvoiceContent').innerHTML = `<p><b>វិក្កយបត្រ:</b> ${data.invCode}</p><p><b>អតិថិជន:</b> ${data.customer} (${data.phone})</p><table class="w-full text-xs border mt-3 dark:border-slate-800"><thead><tr class="bg-slate-100 dark:bg-slate-800"><th class="p-2">ទំនិញ</th><th class="p-2">ចំនួន</th><th class="p-2">សរុប</th></tr></thead><tbody>${data.items.map(i=>`<tr><td class="p-2">${i.name}</td><td class="p-2 text-center">${i.qty}</td><td class="p-2 text-right">$${i.totalPrice.toFixed(2)}</td></tr>`).join('')}</tbody></table><p class="text-right font-black mt-3 text-indigo-600">សរុប: $${parseFloat(data.total).toFixed(2)}</p>`;
        document.getElementById('invoiceModal').classList.remove('hidden');
    });
}

function closeInvoiceModal() { document.getElementById('invoiceModal').classList.add('hidden'); }
function toggleMobileMenu() { document.getElementById('sidebarMenu').classList.toggle('hidden'); }

// --- មុខងារថ្មី៖ រក្សាទុករៀបចំលេខទូរស័ព្ទឡាន និងចំណតតាមខេត្ត ---
async function saveCarContact() {
    const province = document.getElementById('carProvince').value.trim();
    const station = document.getElementById('carStation').value.trim();
    const phone = document.getElementById('carPhone').value.trim();
    const driverName = document.getElementById('carDriverName').value.trim() || '-';
    const note = document.getElementById('carNote').value.trim() || '-';

    if (!province || !station || !phone) {
        alert("⚠️ សូមបំពេញខេត្ត ចំណត និងលេខទូរស័ព្ទឱ្យបានគ្រប់គ្រាន់!");
        return;
    }

    const id = Date.now();
    try {
        await database.ref('carContacts/' + id).set({
            id,
            province,
            station,
            phone,
            driverName,
            note,
            createdAt: new Date().toISOString().split('T')[0]
        });

        alert("🎉 រក្សាទុកលេខទូរស័ព្ទឡានជោគជ័យ!");
        ['carProvince', 'carStation', 'carPhone', 'carDriverName', 'carNote'].forEach(id => {
            document.getElementById(id).value = '';
        });
    } catch (error) {
        alert("❌ មានបញ្ហាក្នុងការរក្សាទុក: " + error.message);
    }
}

function renderCarContactsTable(listToRender = null) {
    const tbody = document.getElementById('carTableBody');
    if (!tbody) return;

    const data = listToRender || carContactsData;

    tbody.innerHTML = data.length === 0 ? 
        `<tr><td colspan="7" class="p-6 text-center text-xs text-slate-400">គ្មានទិន្នន័យលេខឡាន/ចំណតទេ</td></tr>` : 
        data.map((car, i) => `
            <tr class="text-xs border-b dark:border-slate-800">
                <td class="p-4 pl-6 text-center font-bold text-slate-400">${i + 1}</td>
                <td class="p-4 font-bold text-indigo-600">${car.province}</td>
                <td class="p-4 font-medium">${car.station}</td>
                <td class="p-4">${car.driverName}</td>
                <td class="p-4 font-bold text-emerald-600">
                    <a href="tel:${car.phone}" class="hover:underline flex items-center gap-1">📞 ${car.phone}</a>
                </td>
                <td class="p-4 text-slate-500">${car.note}</td>
                <td class="p-4 text-center">
                    <button onclick="deleteCarContact(${car.id})" class="text-rose-600 hover:scale-110 cursor-pointer p-1" title="លុប">🗑️</button>
                </td>
            </tr>
        `).join('');
}

function searchCarFunction() {
    const filter = document.getElementById("searchCarInput").value.toLowerCase();
    const filtered = carContactsData.filter(car => 
        car.province.toLowerCase().includes(filter) ||
        car.station.toLowerCase().includes(filter) ||
        car.phone.toLowerCase().includes(filter) ||
        car.driverName.toLowerCase().includes(filter) ||
        car.note.toLowerCase().includes(filter)
    );
    renderCarContactsTable(filtered);
}

function deleteCarContact(id) {
    if (confirm("⚠️ តើអ្នកពិតជាចង់លុបព័ត៌មានឡាននេះមែនទេ?")) {
        database.ref('carContacts/' + id).remove().then(() => {
            alert("🗑️ បានលុបដោយជោគជ័យ!");
        }).catch(err => {
            alert("❌ កំហុសក្នុងការលុប: " + err.message);
        });
    }
}
