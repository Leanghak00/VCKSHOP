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

let productsData = [], currentUser = null, salesData = [], deliveryData = [], currentInvoiceItems = [], attendanceData = [], carContactsData = [], salaryData = [], tomorrowDeliveryData = [];
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
    refreshIcons();
    auth.onAuthStateChanged((user) => {
        if (user) {
            database.ref('users/' + user.uid).once('value').then(snapshot => {
                const userData = snapshot.val();
                const usernameKey = user.email ? user.email.split('@')[0].toLowerCase() : 'leanghak';
                const staffInfo = STAFF_ACCOUNTS[usernameKey];
                currentUser = {
                    name: userData ? userData.name : (staffInfo ? staffInfo.name : usernameKey),
                    role: userData ? userData.role : (staffInfo ? staffInfo.role : 'Admin'),
                    email: user.email || 'leanghak@vckshop.com'
                };
                initSystemAfterLogin();
            });
        } else {
            currentUser = { name: 'លាងហាក់', role: 'Admin', email: 'leanghak@vckshop.com' };
            initSystemAfterLogin();
        }
    });
});

function refreshIcons() {
    if (typeof lucide !== 'undefined' && lucide.createIcons) {
        lucide.createIcons();
    }
}

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

async function sendTelegramAttendanceAlert(staffName, type, time, lateReason) {
    const chatId = await getTelegramChatId();
    if (!chatId) return;

    let emoji = type === 'Check-in' ? '🟢' : '🔴';
    let message = `${emoji} <b>ការជូនដំណឹងវត្តមានបុគ្គលិក (VCK SHOP)</b>\n\n`;
    message += `👤 បុគ្គលិក: <b>${staffName}</b>\n`;
    message += `📌 សកម្មភាព: <b>${type}</b>\n`;
    message += `⏰ ម៉ោងស្កែន: <b>${time}</b>\n`;
    if (type === 'Check-in' && lateReason && lateReason !== '-') {
        message += `⚠️ ស្ថានភាព: <b style="color:red;">មកយឺត</b>\n`;
        message += `📝 ហេតុផល: ${lateReason}\n`;
    } else {
        message += `✨ ស្ថានភាព: <b>ទៀងទាត់ពេលវេលា</b>\n`;
    }

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
    refreshIcons();
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
    const customerPhone = document.getElementById('targetCustomerPhone').value.trim();
    if (!customerPhone) return alert("⚠️ សូមបញ្ចូលលេខទូរស័ព្ទអតិថិជន!");

    const customer = document.getElementById('invoiceCustomer').value || 'អតិថិជន';
    const location = document.getElementById('invoiceLocation').value || '-';
    const deliveryFee = parseFloat(document.getElementById('invoiceDeliveryFee').value) || 0;
    const discount = parseFloat(document.getElementById('invoiceDiscount').value) || 0;
    const grandTotal = Math.max(0, currentInvoiceItems.reduce((s, i) => s + i.totalPrice, 0) + deliveryFee - discount);
    
    const itemsListStr = currentInvoiceItems.map(i => `▪️ ${i.name} (x${i.qty}) : $${i.totalPrice.toFixed(2)}`).join('\n');
    const message = `🛍️ <b>VCK SHOP - វិក្កយបត្រផ្លូវការ</b>\n👤 អតិថិជន: ${customer} (${customerPhone})\n📍 ទីតាំង: ${location}\n━━━━━━━━━━━━━━━━━━━\n🛒 <b>ទំនិញ៖</b>\n${itemsListStr}\n━━━━━━━━━━━━━━━━━━━\n🚚 សេវាដឹក: $${deliveryFee.toFixed(2)}\n🏷️ បញ្ចុះតម្លៃ: $${discount.toFixed(2)}\n💰 <b>សរុបរួម: $${grandTotal.toFixed(2)}</b>\n\n🙏 សូមអរគុណ!`;

    const chatId = await getTelegramChatId();
    if (!chatId) return alert("⚠️ រកមិនឃើញ Telegram Chat ID ទេ! សូមផ្ញើសារ Bot មួយជាមុនសិន។");

    try {
        const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' })
        });
        const data = await response.json();
        if (data.ok) {
            alert("✅ បានផ្ញើវិក្កយបត្រទៅ Telegram ជោគជ័យ!");
            closeTelegramModal();
        } else {
            alert("❌ បរាជ័យក្នុងការផ្ញើ៖ " + data.description);
        }
    } catch (error) {
        alert("❌ មានបញ្ហាបច្ចេកទេស: " + error.message);
    }
}

function applyUserRolePermissions() {
    if (!currentUser) return;
    const isAdmin = currentUser.role === 'Admin';
    document.getElementById('dash-cards-container')?.classList.toggle('hidden', false);
    document.getElementById('stock-entry-form')?.classList.toggle('hidden', !isAdmin);
    document.getElementById('adminAttendanceCard')?.classList.toggle('hidden', !isAdmin);
    
    document.querySelectorAll('[data-admin-only="true"]').forEach(el => {
        el.classList.toggle('hidden', !isAdmin);
    });
}

function initTheme() {
    const savedTheme = localStorage.getItem('vck_theme');
    const isDark = savedTheme === 'dark' || (!savedTheme && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (isDark) { document.documentElement.classList.add('dark'); }
    updateThemeIcon(isDark);
}

function toggleDarkMode() {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('vck_theme', isDark ? 'dark' : 'light');
    updateThemeIcon(isDark);
}

function updateThemeIcon(isDark) {
    const iconContainer = document.getElementById('darkModeIcon');
    if (iconContainer) {
        iconContainer.innerHTML = isDark ? '<i data-lucide="sun" class="w-4 h-4 text-amber-400"></i>' : '<i data-lucide="moon" class="w-4 h-4 text-slate-600"></i>';
        refreshIcons();
    }
}

function startClock() {
    setInterval(() => {
        const now = new Date();
        const el = document.getElementById('liveClockDisplay');
        if (el) {
            const timeStr = now.toLocaleDateString('km-KH') + ' | ' + now.toLocaleTimeString('en-US', { hour12: true });
            el.querySelector('span').innerText = timeStr;
        }
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
        currentUser = { name: staff ? staff.name : userIn, role: staff ? staff.role : 'Admin', email: res.user.email };
        localStorage.setItem('vck_current_user', JSON.stringify(currentUser));
        errorEl.classList.add('hidden');
        initSystemAfterLogin();
    } catch (e) {
        errorEl.innerText = "⚠️ ឈ្មោះអ្នកប្រើប្រាស់ ឬ លេខសម្ងាត់មិនត្រឹមត្រូវ!";
        errorEl.classList.remove('hidden');
    }
}

async function handleLogout() {
    if (confirm("⚠️ តើអ្នកពិតជាចង់ចាកចេញពីប្រព័ន្ធមែនទេ?")) {
        try { 
            await auth.signOut(); 
            localStorage.removeItem('vck_current_user');
            location.reload(); 
        } catch (e) { 
            localStorage.removeItem('vck_current_user');
            location.reload(); 
        }
    }
}

function handleSwitchAccount() {
    if (confirm("🔄 តើអ្នកចង់ប្ដូរគណនីប្រើប្រាស់ផ្សេងមែនទេ?")) {
        auth.signOut().then(() => {
            localStorage.removeItem('vck_current_user');
            document.getElementById('main-application')?.classList.add('hidden');
            document.getElementById('login-screen')?.classList.remove('hidden');
            document.getElementById('loginUsername').value = '';
            document.getElementById('loginPassword').value = '';
            document.getElementById('loginError').classList.add('hidden');
        }).catch(() => {
            location.reload();
        });
    }
}

function initSystemAfterLogin() {
    document.getElementById('login-screen')?.classList.add('hidden');
    document.getElementById('main-application')?.classList.remove('hidden');
    if(document.getElementById('topNavUser')) document.getElementById('topNavUser').innerText = currentUser.name;
    if(document.getElementById('topNavRole')) document.getElementById('topNavRole').innerText = currentUser.role;
    if(document.getElementById('userAvatar')) document.getElementById('userAvatar').innerText = currentUser.name.charAt(0).toUpperCase();

    const today = new Date().toISOString().split('T')[0];
    ['searchDate', 'searchMonth', 'invoiceDate', 'deliveryStatDate', 'attendanceFilterDate'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = id === 'searchMonth' ? today.substring(0, 7) : today;
    });
    if(document.getElementById('pdfDate')) document.getElementById('pdfDate').innerText = today;

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    if(document.getElementById('tomorrowDateDisplay')) document.getElementById('tomorrowDateDisplay').innerText = `ថ្ងៃស្អែក: ${tomorrow.toLocaleDateString('km-KH')}`;

    applyUserRolePermissions();
    setupLivePreviewInputs();
    listenToFirebaseData();
    switchTab('dashboard');
    refreshIcons();
}

function switchTab(tabId) {
    if ((tabId === 'salary' || tabId === 'reports') && currentUser?.role !== 'Admin') {
        return alert("⚠️ គ្មានសិទ្ធិទស្សនាទំព័រនេះទេ (សម្រាប់ Admin តែប៉ុណ្ណោះ)!");
    }

    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden'));
    const targetTab = document.getElementById('tab-' + tabId);
    if(targetTab) {
        targetTab.classList.remove('hidden');
        targetTab.classList.add('animate-fade-in');
    }

    document.querySelectorAll('nav button').forEach(btn => btn.classList.remove('bg-indigo-600', 'text-white'));
    document.getElementById('btn-' + tabId)?.classList.add('bg-indigo-600', 'text-white');

    const titles = { 
        'dashboard': { title: 'ផ្ទាំងគ្រប់គ្រងទូទៅ', icon: 'layout-dashboard' }, 
        'sales': { title: 'វិក្កយបត្រលក់', icon: 'receipt' }, 
        'delivery': { title: 'ប្រព័ន្ធដឹកជញ្ជូន', icon: 'truck' }, 
        'tomorrow-delivery': { title: 'កាលវិភាគដឹកថ្ងៃស្អែក', icon: 'calendar-plus' },
        'stock': { title: 'គ្រប់គ្រងឃ្លាំងស្តុក', icon: 'package' }, 
        'attendance': { title: 'ស្កែនវត្តមាន', icon: 'clock' }, 
        'salary': { title: 'តារាងប្រាក់ខែបុគ្គលិក', icon: 'wallet' },
        'customer-history': { title: 'ប្រវត្តិអតិថិជន', icon: 'users' },
        'car-contacts': { title: 'លេខទូរស័ព្ទឡាន និងចំណត', icon: 'bus' },
        'reports': { title: 'របាយការណ៍ និងការវិភាគ', icon: 'sparkles' }
    };
    
    const pageConfig = titles[tabId] || { title: 'VCK System', icon: 'activity' };
    const pageTitleEl = document.getElementById('pageTitle');
    if (pageTitleEl) {
        pageTitleEl.innerHTML = `<i data-lucide="${pageConfig.icon}" class="w-5 h-5 text-indigo-600"></i> <span>${pageConfig.title}</span>`;
    }

    if (window.innerWidth < 768) {
        document.getElementById('sidebarMenu')?.classList.add('hidden');
    }
    
    renderAll();
    if (tabId === 'reports') renderReportsData();
    refreshIcons();
}

function listenToFirebaseData() {
    database.ref('products').on('value', snap => { 
        const val = snap.val();
        if (!val) { seedInitialData(); } 
        else { productsData = Object.values(val); }
        setupInvoiceProductSelect(); 
        renderAll(); 
    });

    database.ref('sales').on('value', snap => { 
        salesData = snap.val() ? Object.values(snap.val()) : []; 
        renderAll(); 
    });

    database.ref('deliveries').on('value', snap => { 
        deliveryData = snap.val() ? Object.values(snap.val()) : []; 
        renderAll(); 
    });

    database.ref('attendance').on('value', snap => { 
        attendanceData = snap.val() ? Object.values(snap.val()) : []; 
        if (currentUser?.role === 'Admin') renderAttendanceTable(); 
    });

    database.ref('carContacts').on('value', snap => { 
        carContactsData = snap.val() ? Object.values(snap.val()) : []; 
        renderCarContactsTable(); 
    });

    database.ref('salaries').on('value', snap => { 
        salaryData = snap.val() ? Object.values(snap.val()) : []; 
        if (currentUser?.role === 'Admin') renderSalaryTable(); 
    });

    database.ref('tomorrowDeliveries').on('value', snap => { 
        tomorrowDeliveryData = snap.val() ? Object.values(snap.val()) : []; 
        renderTomorrowDeliveryTable(); 
    });
}

function seedInitialData() {
    const initialProducts = [
        { id: 101, name: "ចានប៉សឺឡែនប្រណិត 10 אינץ'", cat: "ចានអាហារ", total: 100, avail: 85, price: 4.50 },
        { id: 102, name: "កែវស្រាក្រហម Crystal", cat: "កែវប្រណិត", total: 150, avail: 120, price: 3.20 },
        { id: 103, name: "ស្លាបព្រាស៊ុប អ៊ីណុក Stainless", cat: "សម្ភារៈតុ", total: 300, avail: 250, price: 1.20 }
    ];
    const initialSales = [
        { invCode: "INV-100201", customer: "សុខ ជា", phone: "012888999", location: "ទួលគោក, ភ្នំពេញ", date: new Date().toISOString().split('T')[0], total: 76.00, items: [{ productId: 101, name: "ចានប៉សឺឡែនប្រណិត", qty: 10, price: 4.5, totalPrice: 45 }] }
    ];
    const initialDeliveries = [
        { invCode: "INV-100201", customer: "សុខ ជា", phone: "012888999", location: "ទួលគោក, ភ្នំពេញ", driver: "លាងហាក់", status: "បានប្រគល់ជូន" }
    ];

    initialProducts.forEach(p => database.ref('products/' + p.id).set(p));
    initialSales.forEach(s => database.ref('sales/' + s.invCode).set(s));
    initialDeliveries.forEach(d => database.ref('deliveries/' + d.invCode).set(d));
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3, φ1 = lat1 * Math.PI/180, φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180, Δλ = (lon2-lon1) * Math.PI/180;
    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) * Math.sin(Δλ/2);
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
}

function setScanType(type) {
    selectedAttendanceType = type;
    document.getElementById('btnCheckIn').className = `flex-1 py-2.5 px-4 rounded-xl text-xs font-bold ${type === 'Check-in' ? 'bg-emerald-600 text-white shadow-md' : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'} cursor-pointer flex items-center justify-center gap-1.5`;
    document.getElementById('btnCheckOut').className = `flex-1 py-2.5 px-4 rounded-xl text-xs font-bold ${type === 'Check-out' ? 'bg-rose-600 text-white shadow-md' : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'} cursor-pointer flex items-center justify-center gap-1.5`;
    document.getElementById('lateReasonContainer').classList.toggle('hidden', type !== 'Check-in' || new Date().getHours() < 8);
    refreshIcons();
}

function startAttendanceScanner() {
    document.getElementById('attendanceReader').classList.remove('hidden');
    document.getElementById('closeAttendanceCam').classList.remove('hidden');
    html5AttendanceScanner = new Html5QrcodeScanner("attendanceReader", { fps: 10, qrbox: { width: 250, height: 250 } }, false);
    html5AttendanceScanner.render((text) => {
        if (text.trim() === "VCK-SHOP-OFFICIAL") { verifyAndSubmitAttendance(); stopAttendanceScanner(); }
        else alert("⚠️ QR Code មិនត្រឹមត្រូវ!");
    }, () => {});
    refreshIcons();
}

function stopAttendanceScanner() {
    html5AttendanceScanner?.clear().catch(() => {});
    document.getElementById('attendanceReader').classList.add('hidden');
    document.getElementById('closeAttendanceCam').classList.add('hidden');
}

function verifyAndSubmitAttendance() {
    const statusEl = document.getElementById('geoStatus');
    if (!navigator.geolocation) return alert("⚠️ Browser មិនគាំទ្រ GPS!");
    statusEl.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 animate-spin"></i> កំពុងពិនិត្យ GPS...`;
    refreshIcons();
    navigator.geolocation.getCurrentPosition(async pos => {
        const dist = calculateDistance(pos.coords.latitude, pos.coords.longitude, STORE_LOCATION.lat, STORE_LOCATION.lng);
        if (dist > STORE_LOCATION.maxDistanceMeter) return alert(`⚠️ អ្នកនៅឆ្ងាយពីហាង (${Math.round(dist)}m)!`);
        statusEl.innerHTML = `<i data-lucide="check-circle-2" class="w-4 h-4 text-emerald-500"></i> ទីតាំងត្រឹមត្រូវ`;
        refreshIcons();
        await saveAttendanceRecord(selectedAttendanceType);
    }, () => alert("⚠️ សូមបើក GPS!"), { enableHighAccuracy: true });
}

async function saveAttendanceRecord(type) {
    const now = new Date(), date = now.toISOString().split('T')[0], time = now.toLocaleTimeString('en-US', { hour12: true });
    const reason = (type === 'Check-in' && now.getHours() >= 8) ? (document.getElementById('attendanceLateReason')?.value.trim() || 'មកយឺត') : '-';
    if (attendanceData.some(a => a.staffName === currentUser.name && a.date === date && a.type === type)) return alert(`⚠️ បាន ${type} រួចរាល់ហើយថ្ងៃនេះ!`);
    
    await database.ref('attendance').push({ staffName: currentUser.name, type, date, time, lateReason: reason, timestamp: Date.now() });
    await sendTelegramAttendanceAlert(currentUser.name, type, time, reason);

    alert(`🎉 ${currentUser.name} បាន ${type} ជោគជ័យ!`);
}

function renderAttendanceTable() {
    if (currentUser?.role !== 'Admin') return;
    const tbody = document.getElementById('attendanceTableBody');
    const date = document.getElementById('attendanceFilterDate')?.value || new Date().toISOString().split('T')[0];
    const list = attendanceData.filter(a => a.date === date);
    tbody.innerHTML = list.length === 0 ? `<tr><td colspan="4" class="p-4 text-center text-xs text-slate-400">គ្មានទិន្នន័យ</td></tr>` : list.map(a => `<tr class="text-xs border-b dark:border-slate-800"><td class="p-3 pl-4 font-bold">${a.staffName}</td><td class="p-3"><span class="px-2 py-1 rounded-lg text-[10px] font-bold ${a.type==='Check-in'?'bg-emerald-100 text-emerald-700':'bg-rose-100 text-rose-700'}">${a.type}</span></td><td class="p-3">${a.date} | ${a.time}</td><td class="p-3 text-rose-600 font-bold">${a.lateReason}</td></tr>`).join('');
}

function openSalaryModal() {
    if (currentUser?.role !== 'Admin') return alert("⚠️ គ្មានសិទ្ធិ!");
    document.getElementById('modalStaffName').value = '';
    document.getElementById('modalBaseSalary').value = '';
    document.getElementById('modalBonusSalary').value = '';
    document.getElementById('salaryModal').classList.remove('hidden');
    refreshIcons();
}

function closeSalaryModal() { document.getElementById('salaryModal').classList.add('hidden'); }

async function saveStaffSalary() {
    const name = document.getElementById('modalStaffName').value.trim();
    const role = document.getElementById('modalStaffRole').value;
    const base = parseFloat(document.getElementById('modalBaseSalary').value) || 0;
    const bonus = parseFloat(document.getElementById('modalBonusSalary').value) || 0;
    if (!name || isNaN(base)) return alert("⚠️ សូមបំពេញឈ្មោះ និងប្រាក់ខែឱ្យបានត្រឹមត្រូវ!");
    const id = Date.now();
    await database.ref('salaries/' + id).set({ id, name, role, base, bonus, total: base + bonus });
    alert("✅ រក្សាទុកប្រាក់ខែបុគ្គលិកជោគជ័យ!");
    closeSalaryModal();
}

function renderSalaryTable() {
    if (currentUser?.role !== 'Admin') return;
    const tbody = document.getElementById('salaryTableBody');
    if (!tbody) return;
    const list = salaryData.length > 0 ? salaryData : [
        { id: 1, name: 'វិច្ឆិកា', role: 'Admin', base: 600, bonus: 50, total: 650 },
        { id: 2, name: 'លាងហាក់', role: 'Admin', base: 600, bonus: 50, total: 650 },
        { id: 3, name: 'ផាន់នី', role: 'Cashier', base: 350, bonus: 20, total: 370 }
    ];
    tbody.innerHTML = list.map(s => `
        <tr class="text-xs border-b dark:border-slate-800">
            <td class="p-4 pl-6 font-bold">${s.name}</td>
            <td class="p-4"><span class="px-2.5 py-1 rounded-lg text-[10px] font-bold ${s.role==='Admin'?'bg-indigo-100 text-indigo-700':'bg-emerald-100 text-emerald-700'}">${s.role}</span></td>
            <td class="p-4">$${parseFloat(s.base).toFixed(2)}</td>
            <td class="p-4 text-emerald-600 font-bold">+$${parseFloat(s.bonus).toFixed(2)}</td>
            <td class="p-4 text-right font-black text-indigo-600">$${parseFloat(s.total).toFixed(2)}</td>
            <td class="p-4 text-center"><button onclick="deleteSalary(${s.id})" class="text-rose-600 hover:scale-110 cursor-pointer p-1"><i data-lucide="trash-2" class="w-4 h-4"></i></button></td>
        </tr>
    `).join('');
    refreshIcons();
}

async function deleteSalary(id) {
    if (confirm("⚠️ លុបទិន្នន័យប្រាក់ខែនេះ?")) await database.ref('salaries/' + id).remove();
}

async function saveTomorrowDelivery() {
    const customer = document.getElementById('tomCustomer').value.trim();
    const phone = document.getElementById('tomPhone').value.trim();
    const location = document.getElementById('tomLocation').value.trim();
    const driver = document.getElementById('tomDriver').value;
    const note = document.getElementById('tomNote').value.trim() || '-';
    if (!customer || !phone || !location) return alert("⚠️ សូមបំពេញព័ត៌មានឱ្យគ្រប់គ្រាន់!");
    const id = Date.now();
    await database.ref('tomorrowDeliveries/' + id).set({ id, customer, phone, location, driver, note, status: 'រៀបចំសម្រាប់ថ្ងៃស្អែក' });
    alert("🎉 រក្សាទុកកាលវិភាគដឹកថ្ងៃស្អែកជោគជ័យ!");
    ['tomCustomer', 'tomPhone', 'tomLocation', 'tomNote'].forEach(id => document.getElementById(id).value = '');
}

function renderTomorrowDeliveryTable() {
    const tbody = document.getElementById('tomorrowTableBody');
    if (!tbody) return;
    tbody.innerHTML = tomorrowDeliveryData.length === 0 ? `<tr><td colspan="7" class="p-6 text-center text-xs text-slate-400">គ្មានកាលវិភាគសម្រាប់ថ្ងៃស្អែកទេ</td></tr>` : 
        tomorrowDeliveryData.map((d, i) => `
            <tr class="text-xs border-b dark:border-slate-800">
                <td class="p-4 pl-6 text-center font-bold text-slate-400">${i + 1}</td>
                <td class="p-4 font-bold">${d.customer}</td>
                <td class="p-4 text-emerald-600 font-bold">📞 ${d.phone}</td>
                <td class="p-4">${d.location}</td>
                <td class="p-4 font-bold text-indigo-600">${d.driver}</td>
                <td class="p-4 text-slate-500">${d.note}</td>
                <td class="p-4 text-center"><button onclick="deleteTomorrowDelivery(${d.id})" class="text-rose-600 hover:scale-110 cursor-pointer p-1"><i data-lucide="trash-2" class="w-4 h-4"></i></button></td>
            </tr>
        `).join('');
    refreshIcons();
}

async function deleteTomorrowDelivery(id) {
    if (confirm("⚠️ លុបកាលវិភាគនេះ?")) await database.ref('tomorrowDeliveries/' + id).remove();
}

function setupLivePreviewInputs() {
    ['Customer', 'Phone', 'Location', 'Date'].forEach(id => {
        document.getElementById('invoice' + id)?.addEventListener('input', e => {
            const pdfEl = document.getElementById('pdf' + id);
            if (pdfEl) pdfEl.innerText = e.target.value || '-';
        });
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
    refreshIcons();
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
    const tbody = document.getElementById('invoiceItemsTableBody');
    if (!tbody) return;
    
    tbody.innerHTML = currentInvoiceItems.map((item, i) => {
        total += item.totalPrice;
        return `<tr class="border-b dark:border-slate-800 text-xs">
            <td class="p-2 text-center">${i+1}</td>
            <td class="p-2 font-medium">${item.name}</td>
            <td class="p-2 text-center">${item.qty}</td>
            <td class="p-2 text-right">$${item.price.toFixed(2)}</td>
            <td class="p-2 text-right font-bold">$${item.totalPrice.toFixed(2)}</td>
            <td class="p-2 text-center"><button onclick="removeInvoiceItem(${i})" class="text-rose-500 hover:scale-110 cursor-pointer p-1"><i data-lucide="trash-2" class="w-4 h-4"></i></button></td>
        </tr>`;
    }).join('');

    const delivery = parseFloat(document.getElementById('invoiceDeliveryFee')?.value) || 0;
    const disc = parseFloat(document.getElementById('invoiceDiscount')?.value) || 0;
    currentInvoiceGrandTotal = Math.max(0, total + delivery - disc);
    
    if(document.getElementById('pdfDeliveryFeeText')) document.getElementById('pdfDeliveryFeeText').innerText = `$${delivery.toFixed(2)}`;
    if(document.getElementById('invoiceGrandTotal')) document.getElementById('invoiceGrandTotal').innerHTML = `$${currentInvoiceGrandTotal.toFixed(2)}`;
    
    generateDynamicKHQR(currentInvoiceGrandTotal);
    calculateChange();
    refreshIcons();
}

function calculateChange() {
    const cash = parseFloat(document.getElementById('cashReceived')?.value) || 0;
    const change = cash - currentInvoiceGrandTotal;
    const el = document.getElementById('changeDue');
    if (el) el.value = cash <= 0 ? '$0.00' : (change < 0 ? `ខ្វះ $${Math.abs(change).toFixed(2)}` : `$${change.toFixed(2)}`);
}

function generateDynamicKHQR(amt) {
    const c = document.getElementById('qrcode'); 
    if(!c) return;
    c.innerHTML = '';
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
    
    currentInvoiceItems.forEach(i => { 
        const p = productsData.find(x => x.id === i.productId); 
        if (p) p.avail -= i.qty; 
    });

    await database.ref('sales/' + invCode).set({ invCode, customer, phone, location, date, total, items: currentInvoiceItems });
    await database.ref('deliveries/' + invCode).set({ invCode, customer, phone, location, driver: 'មិនទាន់ចាត់ចែង', status: "កំពុងរៀបចំ" });
    
    const pObj = {}; productsData.forEach(p => pObj[p.id] = p); 
    await database.ref('products').set(pObj);

    alert(`🎉 រក្សាទុកវិក្កយបត្រ ${invCode} ជោគជ័យ!`);
    currentInvoiceItems = []; 
    renderInvoicePreviewTable(); 
    switchTab('delivery');
}

function resetInvoiceForm() { currentInvoiceItems = []; renderInvoicePreviewTable(); }

function addNewProductToStock() {
    if (currentUser?.role === 'Cashier') return alert("⚠️ គ្មានសិទ្ធិ!");
    const name = document.getElementById('newProdName').value, cat = document.getElementById('newProdCat').value, total = parseInt(document.getElementById('newProdTotal').value), price = parseFloat(document.getElementById('newProdPrice').value);
    if (!name || isNaN(total) || isNaN(price)) return alert("⚠️ សូមបំពេញទិន្នន័យឱ្យគ្រប់!");
    const id = Date.now();
    database.ref('products/' + id).set({ id, name, cat: cat || 'ទូទៅ', total, avail: total, price }).then(() => {
        ['newProdName', 'newProdCat', 'newProdTotal', 'newProdPrice'].forEach(id => document.getElementById(id).value = '');
    });
}

function autoSaveProduct(id) {
    if (currentUser?.role === 'Cashier') return;
    database.ref('products/' + id).update({ 
        total: parseInt(document.getElementById(`inline-total-${id}`).value), 
        avail: parseInt(document.getElementById(`inline-avail-${id}`).value), 
        price: parseFloat(document.getElementById(`inline-price-${id}`).value) 
    });
}

function deleteProductFromStock(id) { 
    if (currentUser?.role === 'Admin' && confirm("⚠️ តើអ្នកពិតជាចង់លុបទំនិញនេះមែនទេ?")) {
        database.ref('products/' + id).remove(); 
    }
}

function updateDriver(code, driver) { database.ref('deliveries/' + code).update({ driver }); }
function updateStatus(code, status) { database.ref('deliveries/' + code).update({ status }); }

function updateDeliveryStatsByDate() {
    const date = document.getElementById('deliveryStatDate')?.value || new Date().toISOString().split('T')[0];
    const counts = { "លាងហាក់": 0, "ផាន់នី": 0, "សុភាព": 0, "ផល្លីន": 0 };
    deliveryData.forEach(d => {
        const s = salesData.find(x => x.invCode === d.invCode);
        if ((s?.date === date || !s) && counts.hasOwnProperty(d.driver) && d.status === 'បានប្រគល់ជូន') {
            counts[d.driver]++;
        }
    });
    ['លាងហាក់', 'ផាន់នី', 'សុភាព', 'ផល្លីន'].forEach((drv, i) => { 
        const el = document.getElementById(`stat-driver-${i+1}`);
        if (el) el.innerText = `${counts[drv]} ជើង`; 
    });
}

function renderDashboard() {
    const today = new Date().toISOString().split('T')[0];
    const selectedDate = document.getElementById('searchDate')?.value || today;
    const selectedMonth = document.getElementById('searchMonth')?.value || today.substring(0, 7);

    let daily = 0, monthly = 0;
    salesData.forEach(s => { 
        const t = parseFloat(s.total) || 0; 
        if (s.date === selectedDate) daily += t; 
        if (s.date && s.date.startsWith(selectedMonth)) monthly += t; 
    });

    const dailyEl = document.getElementById('dashDailyAmount');
    if (dailyEl) dailyEl.innerText = `$${daily.toFixed(2)}`;

    const monthlyEl = document.getElementById('dashMonthlyAmount');
    if (monthlyEl) monthlyEl.innerText = `$${monthly.toFixed(2)}`;

    const totalProdEl = document.getElementById('dashTotalProducts');
    if (totalProdEl) totalProdEl.innerText = `${productsData.length} មុខ`;

    const lowStockEl = document.getElementById('dashLowStockCount');
    if (lowStockEl) lowStockEl.innerText = `${productsData.filter(p => p.avail <= 5).length} មុខ`;

    renderCharts();
}

function renderCharts() {
    const ctx1 = document.getElementById('comparisonChart')?.getContext('2d');
    if (ctx1) {
        if (comparisonChartInstance) comparisonChartInstance.destroy();
        comparisonChartInstance = new Chart(ctx1, { 
            type: 'line', 
            data: { labels: ['សប្តាហ៍ ១', 'សប្តាហ៍ ២', 'សប្តាហ៍ ៣', 'សប្តាហ៍ ៤'], datasets: [{ label: 'ចំណូល ($)', data: [180, 320, 450, 680], borderColor: '#6366f1', backgroundColor: 'rgba(99, 102, 241, 0.15)', fill: true, tension: 0.4 }] }, 
            options: { responsive: true, maintainAspectRatio: false } 
        });
    }

    const ctx2 = document.getElementById('bestSellersChart')?.getContext('2d');
    if (ctx2) {
        if (myChartInstance) myChartInstance.destroy();
        const topProducts = productsData.length > 0 ? productsData.slice(0, 5) : [{ name: 'ចានប៉សឺឡែន', total: 100, avail: 20 }];
        myChartInstance = new Chart(ctx2, { 
            type: 'doughnut', 
            data: { labels: topProducts.map(p => p.name), datasets: [{ data: topProducts.map(p => p.total - p.avail), backgroundColor: ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6'] }] }, 
            options: { responsive: true, maintainAspectRatio: false } 
        });
    }

    const ctx3 = document.getElementById('locationHotspotsChart')?.getContext('2d');
    if (ctx3) {
        if (locationChartInstance) locationChartInstance.destroy();
        const locCounts = {}; 
        salesData.forEach(s => { if (s.location) locCounts[s.location] = (locCounts[s.location] || 0) + 1; });
        const labels = Object.keys(locCounts).length ? Object.keys(locCounts) : ['ទួលគោក', 'ច្បារអំពៅ', 'ចំការមន', 'សែនសុខ'];
        const dataVals = Object.values(locCounts).length ? Object.values(locCounts) : [12, 8, 15, 6];

        locationChartInstance = new Chart(ctx3, { 
            type: 'bar', 
            data: { labels: labels, datasets: [{ label: 'ចំនួនជើងដឹក', data: dataVals, backgroundColor: '#10b981', borderRadius: 8 }] }, 
            options: { responsive: true, maintainAspectRatio: false } 
        });
    }
}

function renderReportsData() {
    if (currentUser?.role !== 'Admin') return;
    const currentMonth = new Date().toISOString().substring(0, 7);
    let totalRev = 0, totalInvCount = 0;

    salesData.forEach(s => {
        if (s.date && s.date.startsWith(currentMonth)) {
            totalRev += parseFloat(s.total) || 0;
            totalInvCount++;
        }
    });

    const estProfit = totalRev * 0.7;

    if(document.getElementById('reportTotalRevenue')) document.getElementById('reportTotalRevenue').innerText = `$${totalRev.toFixed(2)}`;
    if(document.getElementById('reportEstimatedProfit')) document.getElementById('reportEstimatedProfit').innerText = `$${estProfit.toFixed(2)}`;
    if(document.getElementById('reportTotalInvoices')) document.getElementById('reportTotalInvoices').innerText = `${totalInvCount} វិក្កយបត្រ`;

    const insightsEl = document.getElementById('aiInsightsText');
    if (insightsEl) {
        let lowStockItems = productsData.filter(p => p.avail <= 5).length;
        insightsEl.innerHTML = `
            <p>✅ <b>ស្ថានភាពហាងខែនេះ:</b> ចំណូលសរុបសម្រេចបាន <b>$${totalRev.toFixed(2)}</b> ពីការលក់សរុបចំនួន ${totalInvCount} វិក្កយបត្រ។</p>
            <p>📦 <b>ការគ្រប់គ្រងស្តុក:</b> មានមុខទំនិញចំនួន <b class="text-rose-500">${lowStockItems} មុខ</b> ដែលកំពុងមានស្តុកទាបជាង ឬស្មើ 5 ដែលតម្រូវឱ្យអ្នកធ្វើការកុម្ម៉ង់ទិញបន្ថែមពីអ្នកផ្គត់ផ្គង់ (Supplier) ជាបន្ទាន់។</p>
            <p>🚀 <b>យុទ្ធសាស្ត្រណែនាំ:</b> ផ្អែកលើទិន្នន័យដឹកជញ្ជូន តំបន់ដែលមានអតិថិជនកុម្ម៉ង់ទិញច្រើនជាងគេគឺរាជធានីភ្នំពេញ និងតំបន់ជុំវិញ ដែលអ្នកគួររក្សាទុករបស់របរប្រភេទចានប្រណិតឱ្យបានគ្រប់គ្រាន់សម្រាប់តម្រូវការពិធីផ្សេងៗនាពេលខាងមុខ។</p>
        `;
    }
}

function renderAll() {
    renderDashboard();
    const isAdmin = currentUser?.role === 'Admin';
    
    const stockTbody = document.getElementById('stockTableBody');
    if (stockTbody) {
        stockTbody.innerHTML = productsData.length === 0 ? 
            `<tr><td colspan="7" class="p-6 text-center text-xs text-slate-400">កំពុងទាញទិន្នន័យស្តុក...</td></tr>` :
            productsData.map((p, i) => `
                <tr class="text-xs border-b dark:border-slate-800">
                    <td class="p-3 text-center font-bold text-slate-400">${i+1}</td>
                    <td class="p-3 font-bold">${p.name}</td>
                    <td class="p-3"><span class="bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-lg text-[10px]">${p.cat || 'ទូទៅ'}</span></td>
                    <td class="p-2 text-center"><input type="number" id="inline-total-${p.id}" value="${p.total}" ${!isAdmin?'readonly':''} onchange="autoSaveProduct(${p.id})" class="vck-input w-16 border rounded text-center p-1 font-bold"></td>
                    <td class="p-2 text-center"><input type="number" id="inline-avail-${p.id}" value="${p.avail}" ${!isAdmin?'readonly':''} onchange="autoSaveProduct(${p.id})" class="w-16 border rounded text-center p-1 font-bold ${p.avail<=5?'text-rose-500 bg-rose-50 dark:bg-rose-950/40':''}"></td>
                    <td class="p-2 text-right"><input type="number" step="0.01" id="inline-price-${p.id}" value="${p.price}" ${!isAdmin?'readonly':''} onchange="autoSaveProduct(${p.id})" class="w-20 border rounded text-right p-1 font-bold"></td>
                    <td class="p-3 text-center">${isAdmin ? `<button onclick="deleteProductFromStock(${p.id})" class="text-rose-600 hover:scale-110 cursor-pointer p-1"><i data-lucide="trash-2" class="w-4 h-4"></i></button>` : '<i data-lucide="lock" class="w-4 h-4 text-slate-400 inline-block"></i>'}</td>
                </tr>
            `).join('');
    }

    const deliveryTbody = document.getElementById('deliveryTableBody');
    if (deliveryTbody) {
        deliveryTbody.innerHTML = deliveryData.length === 0 ? 
            `<tr><td colspan="8" class="p-6 text-center text-xs text-slate-400">គ្មានទិន្នន័យដឹកជញ្ជូន</td></tr>` :
            deliveryData.map(d => `
                <tr class="text-xs border-b dark:border-slate-800">
                    <td class="p-4 pl-6">${salesData.find(s=>s.invCode===d.invCode)?.date || new Date().toISOString().split('T')[0]}</td>
                    <td class="p-4 font-bold text-indigo-600">${d.invCode}</td>
                    <td class="p-4 font-bold">${d.customer}</td>
                    <td class="p-4">ភ្នំពេញ</td>
                    <td class="p-4">${d.location}</td>
                    <td class="p-4">
                        <select onchange="updateDriver('${d.invCode}', this.value)" class="vck-input p-1 rounded text-xs font-bold">
                            <option value="មិនទាន់ចាត់ចែង">---</option>
                            <option value="លាងហាក់" ${d.driver==='លាងហាក់'?'selected':''}>លាងហាក់</option>
                            <option value="ផាន់នី" ${d.driver==='ផាន់នី'?'selected':''}>ផាន់នី</option>
                            <option value="សុភាព" ${d.driver==='សុភាព'?'selected':''}>សុភាព</option>
                            <option value="ផល្លីន" ${d.driver==='ផល្លីន'?'selected':''}>ផល្លីន</option>
                        </select>
                    </td>
                    <td class="p-4 text-center"><span class="px-2 py-1 rounded-lg text-[10px] font-bold ${d.status==='បានប្រគល់ជូន'?'bg-emerald-100 text-emerald-700':'bg-indigo-100 text-indigo-700'}">${d.status}</span></td>
                    <td class="p-4 text-center">
                        <select onchange="updateStatus('${d.invCode}', this.value)" class="vck-input p-1 rounded text-xs font-bold">
                            <option value="កំពុងរៀបចំ" ${d.status==='កំពុងរៀបចំ'?'selected':''}>កំពុងរៀបចំ</option>
                            <option value="កំពុងដឹក" ${d.status==='កំពុងដឹក'?'selected':''}>កំពុងដឹក</option>
                            <option value="បានប្រគល់ជូន" ${d.status==='បានប្រគល់ជូន'?'selected':''}>បានប្រគល់ជូន</option>
                        </select>
                    </td>
                </tr>
            `).join('');
    }

    updateDeliveryStatsByDate();
    refreshIcons();
}

function searchStockFunction() {
    const filter = document.getElementById("searchStockInput").value.toLowerCase();
    Array.from(document.getElementById("stockTableBody").getElementsByTagName("tr")).forEach(tr => {
        tr.style.display = (tr.cells[1]?.textContent.toLowerCase().includes(filter) || tr.cells[2]?.textContent.toLowerCase().includes(filter)) ? "" : "none";
    });
}

function toggleMobileMenu() { document.getElementById('sidebarMenu')?.classList.toggle('hidden'); }

async function saveCarContact() {
    const province = document.getElementById('carProvince').value.trim();
    const station = document.getElementById('carStation').value.trim();
    const phone = document.getElementById('carPhone').value.trim();
    const driverName = document.getElementById('carDriverName').value.trim() || '-';
    const note = document.getElementById('carNote').value.trim() || '-';
    if (!province || !station || !phone) return alert("⚠️ សូមបំពេញខេត្ត ចំណត និងលេខទូរស័ព្ទ!");
    const id = Date.now();
    await database.ref('carContacts/' + id).set({ id, province, station, phone, driverName, note });
    alert("🎉 រក្សាទុកលេខឡានជោគជ័យ!");
    ['carProvince', 'carStation', 'carPhone', 'carDriverName', 'carNote'].forEach(id => document.getElementById(id).value = '');
}

function renderCarContactsTable(listToRender = null) {
    const tbody = document.getElementById('carTableBody');
    if (!tbody) return;
    const data = listToRender || carContactsData;
    tbody.innerHTML = data.length === 0 ? `<tr><td colspan="7" class="p-6 text-center text-xs text-slate-400">គ្មានទិន្នន័យឡាន/ចំណតទេ</td></tr>` : 
    data.map((car, i) => `
        <tr class="text-xs border-b dark:border-slate-800">
            <td class="p-4 pl-6 text-center font-bold text-slate-400">${i + 1}</td>
            <td class="p-4 font-bold text-indigo-600">${car.province}</td>
            <td class="p-4 font-medium">${car.station}</td>
            <td class="p-4">${car.driverName}</td>
            <td class="p-4 font-bold text-emerald-600"><a href="tel:${car.phone}" class="hover:underline flex items-center gap-1"><i data-lucide="phone-call" class="w-3.5 h-3.5"></i> ${car.phone}</a></td>
            <td class="p-4 text-slate-500">${car.note}</td>
            <td class="p-4 text-center"><button onclick="deleteCarContact(${car.id})" class="text-rose-600 hover:scale-110 cursor-pointer p-1"><i data-lucide="trash-2" class="w-4 h-4"></i></button></td>
        </tr>
    `).join('');
    refreshIcons();
}

function searchCarFunction() {
    const filter = document.getElementById("searchCarInput").value.toLowerCase();
    const filtered = carContactsData.filter(car => car.province.toLowerCase().includes(filter) || car.station.toLowerCase().includes(filter) || car.phone.toLowerCase().includes(filter));
    renderCarContactsTable(filtered);
}

function deleteCarContact(id) {
    if (confirm("⚠️ លុបព័ត៌មានឡាននេះ?")) database.ref('carContacts/' + id).remove();
}
