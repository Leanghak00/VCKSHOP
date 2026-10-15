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

let productsData = [], currentUser = null, salesData = [], deliveryData = [], currentInvoiceItems = [];
let myChartInstance = null, comparisonChartInstance = null, locationChartInstance = null, qrcodeInstance = null;
let currentInvoiceGrandTotal = 0;
let html5QrCodeScanner = null;

// Telegram Bot Configuration
const TELEGRAM_BOT_TOKEN = "8839366312:AAFIDVQrCvb36nAfZc3AzYZ7PHCBo5pQmgU";

window.addEventListener('DOMContentLoaded', () => {
    startClock();
    initTheme();
    requestNotificationPermission();
    
    auth.onAuthStateChanged((user) => {
        if (user) {
            database.ref('users/' + user.uid).once('value').then(snapshot => {
                const userData = snapshot.val();
                currentUser = {
                    name: userData ? userData.name : user.email.split('@')[0],
                    role: userData ? userData.role : 'User',
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

// 🛠️ មុខងារស្វែងរក Chat ID ស្វ័យប្រវត្តិ (Auto-Detect for Group)
async function getTelegramChatId() {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        if (data.ok && data.result.length > 0) {
            const lastUpdate = data.result[data.result.length - 1];
            const chatId = lastUpdate.message?.chat?.id || lastUpdate.my_chat_member?.chat?.id;
            return chatId;
        }
    } catch (error) {
        console.error("Error fetching Chat ID:", error);
    }
    return null;
}

// 🔔 មុខងារផ្ញើសារជូនដំណឹងចូល Telegram គ្រុបផ្ទៃក្នុង
async function sendTelegramNotification(invCode, customer, phone, location, total, items) {
    const chatId = await getTelegramChatId();
    if (!chatId) {
        console.warn("⚠️ រកមិនឃើញ Telegram Chat ID សម្រាប់គ្រុបទេ!");
        return;
    }

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

    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' })
        });
    } catch (error) {
        console.error("Telegram Error:", error);
    }
}

// ✈️ បើក Modal ផ្ញើ Telegram ដោយយកលេខទូរស័ព្ទស្វ័យប្រវត្តិ
function sendDirectCustomerTelegramModal() {
    if (currentInvoiceItems.length === 0) {
        return alert("⚠️ សូមបញ្ចូលមុខទំនិញក្នុងវិក្កយបត្រជាមុនសិន!");
    }
    const currentPhone = document.getElementById('invoicePhone').value || '';
    document.getElementById('targetCustomerPhone').value = currentPhone;
    document.getElementById('telegramModal').classList.remove('hidden');
}

function closeTelegramModal() {
    document.getElementById('telegramModal').classList.add('hidden');
}

// 🔗 មុខងារ Share តំណសារ ឬវិក្កយបត្រចូល Telegram ផ្ទាល់ (រចនាម៉ូដស្អាតទាក់ទាញ)
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

    const telegramShareUrl = `https://t.me/share/url?url=&text=${encodeURIComponent(message)}`;
    window.open(telegramShareUrl, '_blank');
    closeTelegramModal();
}

// 📱 ផ្ញើតាមរយៈ Bot ដោយផ្អែកលើលេខទូរស័ព្ទ (រចនាម៉ូដស្អាតទាក់ទាញ)
async function confirmSendTelegramByPhone() {
    const phone = document.getElementById('targetCustomerPhone').value.trim();
    if (!phone) return alert("⚠️ សូមបញ្ចូលលេខទូរស័ព្ទអតិថិជន!");

    const chatId = await getTelegramChatId(); 
    if (!chatId) {
        alert("⚠️ រកមិនឃើញ Chat ID ស្វ័យប្រវត្តិទេ! សូមប្រើប្រាស់ប៊ូតុង 'Share ទៅ Telegram ផ្ទាល់' វិញ។");
        return;
    }

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

    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' })
        });
        const data = await response.json();
        if (data.ok) {
            alert("✅ បានផ្ញើវិក្កយបត្រជូនអតិថិជនជោគជ័យ!");
            closeTelegramModal();
        } else {
            alert("⚠️ មិនអាចផ្ញើសារបានទេ!");
        }
    } catch (error) {
        console.error("Error:", error);
    }
}

// 🎉 សារអបអរសាទរពេលទំនិញដល់ដៃអតិថិជន (បើក Telegram Share ផ្ញើផ្ទាល់ដោយស្វ័យប្រវត្តិ)
async function sendDeliverySuccessNotice(customerPhone, invCode, customerName) {
    const noticeText = `🎉 ✨ **អបអរសាទរ និងសូមអរគុណ ${customerName} (${customerPhone})!** ✨ 🎉\n` +
                       `━━━━━━━━━━━━━━━━━━━\n` +
                       `📦 វិក្កយបត្រលេខ: ${invCode}\n` +
                       `🚚 ឥឡូវនេះទំនិញរបស់អ្នកត្រូវបានដឹកជញ្ជូនដល់ដៃដោយសុវត្ថិភាព និងភាពប្រណិតរួចរាល់ហើយ!\n` +
                       `━━━━━━━━━━━━━━━━━━━\n` +
                       `🙏 ថែរក្សា និងកុំភ្លេចបម្រើសេវាកម្មយើងខ្ញុំម្ដងទៀតនៅពេលក្រោយ!\n` +
                       `🌟 **VCK SHOP** - ផ្គត់ផ្គង់សម្ភារៈតុការចានប្រណិតទាន់សម័យ។`;

    const telegramUrl = `https://t.me/share/url?url=&text=${encodeURIComponent(noticeText)}`;
    window.open(telegramUrl, '_blank');
}

// 🛡️ ការត្រនិត្យសិទ្ធិអ្នកប្រើប្រាស់ (User Roles & Permissions)
function applyUserRolePermissions() {
    if (!currentUser) return;
    const role = currentUser.role; // 'Admin' ឬ 'Cashier'

    const dashCards = document.getElementById('dash-cards-container');
    const thTotal = document.getElementById('th-dashboard-total');
    const thAction = document.getElementById('th-dashboard-action');
    const stockForm = document.getElementById('stock-entry-form');

    if (role === 'Cashier') {
        if (dashCards) dashCards.classList.add('hidden');
        if (thTotal) thTotal.classList.add('hidden');
        if (thAction) thAction.classList.add('hidden');
        if (stockForm) stockForm.classList.add('hidden');
    } else {
        if (dashCards) dashCards.classList.remove('hidden');
        if (thTotal) thTotal.classList.remove('hidden');
        if (thAction) thAction.classList.remove('hidden');
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
    const userIn = document.getElementById('loginUsername').value.trim();
    const passIn = document.getElementById('loginPassword').value;
    const errorEl = document.getElementById('loginError');

    if (!userIn || !passIn) {
        errorEl.innerText = "⚠️ សូមបំពេញឈ្មោះអ្នកប្រើប្រាស់ និងលេខសម្ងាត់!";
        errorEl.classList.remove('hidden');
        return;
    }

    const emailFormat = userIn.toLowerCase().includes('@') ? userIn : `${userIn.toLowerCase()}@vckshop.com`;

    try {
        const userCredential = await auth.signInWithEmailAndPassword(emailFormat, passIn);
        const user = userCredential.user;
        
        const snapshot = await database.ref('users/' + user.uid).once('value');
        const userData = snapshot.val();

        currentUser = {
            name: userData ? userData.name : userIn,
            role: userData ? userData.role : (userIn.toLowerCase() === 'vk' ? 'Admin' : 'Cashier'),
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
        const displayLabel = `${p.name} (សល់: ${p.avail})`;
        html += `<option value="${p.name}" data-price="${p.price}" data-id="${p.id}" data-avail="${p.avail}">${displayLabel}</option>`;
    });
    dataList.innerHTML = html;
}

function autoFillProductPrice() {
    const input = document.getElementById('invoiceProductInput');
    const dataList = document.getElementById('productList');
    const priceInput = document.getElementById('invoiceUnitPrice');
    const hiddenId = document.getElementById('invoiceProductIdHidden');
    const qtyInput = document.getElementById('invoiceQty');
    
    const selectedOption = Array.from(dataList.options).find(opt => opt.value === input.value);
    
    if (selectedOption) {
        const price = selectedOption.getAttribute('data-price');
        const id = selectedOption.getAttribute('data-id');
        const avail = parseInt(selectedOption.getAttribute('data-avail'));
        
        priceInput.value = price;
        hiddenId.value = id;
        qtyInput.max = avail;
        
        if (avail <= 0) alert("⚠️ ទំនិញនេះអស់ពីស្តុកហើយ!");
    } else {
        priceInput.value = '';
        hiddenId.value = '';
    }
}

function startBarcodeScanner() {
    const modal = document.getElementById('barcodeModal');
    if (modal) modal.classList.remove('hidden');

    html5QrCodeScanner = new Html5QrcodeScanner(
        "reader", { fps: 10, qrbox: { width: 250, height: 250 } }, false
    );
    
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
    if (html5QrCodeScanner) {
        html5QrCodeScanner.clear().catch(error => console.error("Failed to clear scanner. ", error));
    }
    const modal = document.getElementById('barcodeModal');
    if (modal) modal.classList.add('hidden');
}

function startVoiceOrdering() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        return alert("⚠️ Browser របស់អ្នកមិនគាំទ្រ Web Speech API ទេ!");
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'km-KH';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    const btn = document.getElementById('voiceBtn');
    if (btn) btn.innerText = "🎙️ កំពុងស្តាប់...";
    recognition.start();

    recognition.onresult = (event) => {
        const speechResult = event.results[0][0].transcript.trim();
        if (btn) btn.innerText = "🎙️ បញ្ជាដោយសំឡេង";
        
        const matchedProd = productsData.find(p => speechResult.toLowerCase().includes(p.name.toLowerCase()));
        if (matchedProd) {
            document.getElementById('invoiceProductInput').value = matchedProd.name;
            autoFillProductPrice();
            alert(`🎤 បានស្ដាប់ឮ: "${speechResult}" ➔ ជ្រើសរើសទំនិញ: ${matchedProd.name}`);
        }
    };

    recognition.onerror = () => { if (btn) btn.innerText = "🎙️ បញ្ជាដោយសំឡេង"; };
    recognition.onend = () => { if (btn) btn.innerText = "🎙️ បញ្ជាដោយសំឡេង"; };
}

function adjustInvoiceQty(amount) {
    const qtyInput = document.getElementById('invoiceQty');
    if (!qtyInput) return;
    let currentQty = parseInt(qtyInput.value) || 0;
    qtyInput.value = Math.max(1, currentQty + amount);
}

function addItemToCurrentInvoice() {
    const productId = document.getElementById('invoiceProductIdHidden').value;
    const qty = parseInt(document.getElementById('invoiceQty').value);
    const price = parseFloat(document.getElementById('invoiceUnitPrice').value);

    const product = productsData.find(p => p.id == productId);

    if (!product) return alert("⚠️ សូមជ្រើសរើសទំនិញពីបញ្ជីឱ្យបានត្រឹមត្រូវ!");
    if (isNaN(qty) || qty <= 0) return alert("⚠️ សូមបញ្ចូលចំនួនឱ្យបានត្រឹមត្រូវ!");
    if (qty > product.avail) return alert(`⚠️ ស្តុកមិនគ្រប់គ្រាន់! សល់តែ ${product.avail} ទេ។`);

    const existingItem = currentInvoiceItems.find(item => item.productId == productId);

    if (existingItem) {
        if (existingItem.qty + qty > product.avail) return alert("⚠️ លើសពីស្តុកដែលមាន!");
        existingItem.qty += qty;
        existingItem.totalPrice = existingItem.qty * existingItem.price;
    } else {
        currentInvoiceItems.push({ productId: product.id, name: product.name, qty: qty, price: price, totalPrice: qty * price });
    }

    document.getElementById('invoiceProductInput').value = '';
    document.getElementById('invoiceUnitPrice').value = '';
    document.getElementById('invoiceQty').value = '1';
    document.getElementById('invoiceProductIdHidden').value = '';
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
        html += `
        <tr class="border-b dark:border-slate-800 text-xs hover:bg-slate-50 dark:hover:bg-slate-800/50">
            <td class="p-2 text-center border-r dark:border-slate-800">${index + 1}</td>
            <td class="p-2 border-r dark:border-slate-800 font-medium text-slate-800 dark:text-slate-200">${item.name}</td>
            <td class="p-2 text-center border-r dark:border-slate-800 font-bold">${item.qty}</td>
            <td class="p-2 text-right border-r dark:border-slate-800">$${item.price.toFixed(2)}</td>
            <td class="p-2 text-right font-bold text-slate-700 dark:text-slate-200">$${item.totalPrice.toFixed(2)}</td>
            <td class="p-2 text-center print-hide"><button onclick="removeInvoiceItem(${index})" class="text-rose-500 hover:text-rose-700 cursor-pointer">❌</button></td>
        </tr>`;
    });
    tbody.innerHTML = html;

    const deliveryFeeInput = document.getElementById('invoiceDeliveryFee');
    const discountInput = document.getElementById('invoiceDiscount');
    const deliveryFee = deliveryFeeInput ? parseFloat(deliveryFeeInput.value) || 0 : 0;
    const discount = discountInput ? parseFloat(discountInput.value) || 0 : 0;
    
    const pdfDeliveryFeeText = document.getElementById('pdfDeliveryFeeText');
    if (pdfDeliveryFeeText) pdfDeliveryFeeText.innerText = `$${deliveryFee.toFixed(2)}`;

    const grandTotal = Math.max(0, itemsTotal + deliveryFee - discount);
    currentInvoiceGrandTotal = grandTotal;
    
    const exchangeRate = 4000;
    const grandTotalRiel = Math.round(grandTotal * exchangeRate).toLocaleString('km-KH');

    const grandTotalElement = document.getElementById('invoiceGrandTotal');
    if (grandTotalElement) {
        grandTotalElement.innerHTML = `$${grandTotal.toFixed(2)} <span class="text-xs font-normal text-slate-500 dark:text-slate-400 block sm:inline">(${grandTotalRiel} ៛)</span>`;
    }

    generateDynamicKHQR(grandTotal);
    calculateChange();
}

function calculateChange() {
    const cashInput = document.getElementById('cashReceived');
    const changeOutput = document.getElementById('changeDue');
    if (!cashInput || !changeOutput) return;

    const cashReceived = parseFloat(cashInput.value) || 0;
    if (cashReceived <= 0 || currentInvoiceGrandTotal <= 0) {
        changeOutput.value = '$0.00';
        return;
    }

    const changeDue = cashReceived - currentInvoiceGrandTotal;
    if (changeDue < 0) {
        changeOutput.value = `ខ្វះ $${Math.abs(changeDue).toFixed(2)}`;
    } else {
        const exchangeRate = 4000;
        const changeRiel = Math.round(changeDue * exchangeRate).toLocaleString('km-KH');
        changeOutput.value = `$${changeDue.toFixed(2)} (${changeRiel} ៛)`;
    }
}

function generateDynamicKHQR(amount) {
    const qrcodeContainer = document.getElementById('qrcode');
    if (!qrcodeContainer) return;
    qrcodeContainer.innerHTML = '';
    const payload = `00020101021230380016bakong@vckshop0108VCK_SHOP5204599953038405405${amount.toFixed(2)}5802KH5910VCK SHOP6010Phnom Penh6304`;

    qrcodeInstance = new QRCode(qrcodeContainer, {
        text: payload, width: 80, height: 80, colorDark: "#0f172a", colorLight: "#ffffff", correctLevel: QRCode.CorrectLevel.M
    });
}

function playSuccessSound() {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, audioContext.currentTime); 
        osc.frequency.setValueAtTime(880, audioContext.currentTime + 0.1); 
        gain.gain.setValueAtTime(0.1, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.00001, audioContext.currentTime + 0.3);
        osc.connect(gain); gain.connect(audioContext.destination);
        osc.start(); osc.stop(audioContext.currentTime + 0.3);
    } catch(e) {}
}

async function saveFinalInvoice() {
    const customer = document.getElementById('invoiceCustomer').value.trim();
    const phone = document.getElementById('invoicePhone').value.trim();
    const fromLoc = document.getElementById('invoiceFromLocation').value.trim();
    const location = document.getElementById('invoiceLocation').value.trim();
    const date = document.getElementById('invoiceDate').value;
    const driver = document.getElementById('invoiceDriverSelect')?.value || 'មិនទាន់ចាត់ចែង';
    const deliveryFee = parseFloat(document.getElementById('invoiceDeliveryFee').value) || 0;
    const discount = parseFloat(document.getElementById('invoiceDiscount')?.value) || 0;

    if (!customer || !location || currentInvoiceItems.length === 0) {
        return alert("⚠️ សូមបំពេញព័ត៌មានអតិថិជន ទិសដៅ និងទំនិញឱ្យបានគ្រប់គ្រាន់!");
    }

    const invCode = 'INV-' + Math.floor(100000 + Math.random() * 900000);
    const itemsTotal = currentInvoiceItems.reduce((sum, item) => sum + item.totalPrice, 0);
    const grandTotal = Math.max(0, itemsTotal + deliveryFee - discount);

    currentInvoiceItems.forEach(item => {
        const p = productsData.find(prod => prod.id === item.productId);
        if (p) p.avail -= item.qty;
    });

    try {
        await database.ref('sales').child(invCode).set({ 
            invCode, customer, phone, location, date, itemsTotal, deliveryFee, discount, total: grandTotal, items: currentInvoiceItems 
        });
        await database.ref('deliveries').child(invCode).set({ invCode, customer, phone, fromLoc, location, driver, status: "កំពុងរៀបចំ" });

        const productsObj = {};
        productsData.forEach(p => { productsObj[p.id] = p; });
        await database.ref('products').set(productsObj);

        playSuccessSound();
        await sendTelegramNotification(invCode, customer, phone, location, grandTotal, currentInvoiceItems);
        downloadInvoicePDF(invCode);

        alert(`🎉 រក្សាទុកវិក្កយបត្រលេខ ${invCode} រួចរាល់ដោយជោគជ័យ!`);
        resetInvoiceForm();
        switchTab('delivery');
    } catch (error) {
        console.error("Save Error:", error);
        alert("❌ មានបញ្ហាក្នុងការរក្សាទុកទិន្នន័យ!");
    }
}

function exportSalesToCSV() {
    if (salesData.length === 0) return alert("⚠️ គ្មានទិន្នន័យលក់សម្រាប់ Export ទេ!");
    let csvContent = "data:text/csv;charset=utf-8,\uFEFFថ្ងៃខែ,លេខវិក្កយបត្រ,អតិថិជន,លេខទូរស័ព្ទ,ទិសដៅ,ទឹកប្រាក់សរុប ($)\n";
    salesData.forEach(s => {
        csvContent += `"${s.date || ''}","${s.invCode || ''}","${s.customer || ''}","${s.phone || ''}","${s.location || ''}","${(parseFloat(s.total) || 0).toFixed(2)}"\n`;
    });
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", `VCK_Sales_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
}

function exportStockToCSV() {
    if (productsData.length === 0) return alert("⚠️ គ្មានទំនិញក្នុងស្តុកសម្រាប់ Export ទេ!");
    let csvContent = "data:text/csv;charset=utf-8,\uFEFFល.រ,ឈ្មោះមុខទំនិញ,ប្រភេទក្រុម,ចំនួនស្តុកសរុប,នៅសល់ប្រាកដ,តម្លៃលក់រាយ ($)\n";
    productsData.forEach((p, idx) => {
        csvContent += `"${idx + 1}","${p.name || ''}","${p.cat || ''}","${p.total || 0}","${p.avail || 0}","${(parseFloat(p.price) || 0).toFixed(2)}"\n`;
    });
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", `VCK_Stock_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
}

function searchCustomerHistory() {
    const phoneInput = document.getElementById('searchCustPhone').value.trim();
    const resultArea = document.getElementById('custHistoryResult');
    if (!phoneInput) return alert("⚠️ សូមបញ្ចូលលេខទូរស័ព្ទអតិថិជនដើម្បីស្វែងរក!");
    const customerSales = salesData.filter(s => s.phone && s.phone.replace(/\s+/g, '') === phoneInput.replace(/\s+/g, ''));
    if (customerSales.length === 0) {
        resultArea.classList.add('hidden');
        return alert("❌ រកមិនឃើញប្រវត្តិទិញសម្រាប់លេខទូរស័ព្ទនេះទេ!");
    }
    const firstMatch = customerSales[0];
    const totalSpent = customerSales.reduce((sum, s) => sum + (parseFloat(s.total) || 0), 0);
    document.getElementById('custHistoryName').innerText = firstMatch.customer || 'មិនស្គាល់';
    document.getElementById('custHistoryPhone').innerText = phoneInput;
    document.getElementById('custHistoryTotalSpent').innerText = `$${totalSpent.toFixed(2)}`;
    document.getElementById('custHistoryTotalInvoices').innerText = `${customerSales.length} វិក្កយបត្រ`;
    document.getElementById('custHistoryTableBody').innerHTML = customerSales.map(s => `
        <tr class="text-xs hover:bg-slate-50 dark:hover:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
            <td class="p-3 pl-6 font-medium">${s.date || '-'}</td>
            <td class="p-3 font-bold text-indigo-600 dark:text-indigo-400 cursor-pointer" onclick="viewInvoice('${s.invCode}')">${s.invCode}</td>
            <td class="p-3 text-slate-600 dark:text-slate-300">${s.items ? s.items.map(i => `${i.name} (x${i.qty})`).join(', ') : '-'}</td>
            <td class="p-3 text-slate-500 dark:text-slate-400">${s.location || '-'}</td>
            <td class="p-3 text-right font-bold text-emerald-600 dark:text-emerald-400">$${(parseFloat(s.total) || 0).toFixed(2)}</td>
            <td class="p-3 text-center"><button onclick="viewInvoice('${s.invCode}')" class="bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-600 hover:text-white text-indigo-600 dark:text-indigo-400 p-1.5 rounded-xl transition text-[11px] font-bold cursor-pointer">👁️ មើល</button></td>
        </tr>
    `).join('');
    resultArea.classList.remove('hidden');
}

function deleteInvoice(invCode) {
    if (!currentUser || currentUser.role !== 'Admin') return alert("⚠️ អ្នកគ្មានសិទ្ធិលុបវិក្កយបត្រនេះទេ!");
    if (confirm(`⚠️ តើអ្នកពិតជាចង់លុបវិក្កយបត្រលេខ ${invCode} នេះមែនទេ?`)) {
        database.ref('sales').child(invCode).remove();
        database.ref('deliveries').child(invCode).remove().then(() => alert("🗑️ បានលុបវិក្កយបត្រដោយជោគជ័យ!"));
    }
}

function resetInvoiceForm() {
    currentInvoiceItems = [];
    currentInvoiceGrandTotal = 0;
    ['invoiceCustomer', 'invoicePhone', 'invoiceLocation'].forEach(id => { if(document.getElementById(id)) document.getElementById(id).value = ''; });
    if (document.getElementById('invoiceDeliveryFee')) document.getElementById('invoiceDeliveryFee').value = '0.00';
    if (document.getElementById('invoiceDiscount')) document.getElementById('invoiceDiscount').value = '0.00';
    if (document.getElementById('invoiceDriverSelect')) document.getElementById('invoiceDriverSelect').value = 'មិនទាន់ចាត់ចែង';
    if (document.getElementById('cashReceived')) document.getElementById('cashReceived').value = '';
    if (document.getElementById('changeDue')) document.getElementById('changeDue').value = '$0.00';
    renderInvoicePreviewTable();
}

function downloadInvoicePDF(customInvCode) {
    if (typeof html2pdf === 'undefined') return;
    const invCode = customInvCode || ('INV-' + Math.floor(100000 + Math.random() * 900000));
    const customer = document.getElementById('invoiceCustomer')?.value || 'អតិថិជនទូទៅ';
    const phone = document.getElementById('invoicePhone')?.value || '-';
    const location = document.getElementById('invoiceLocation')?.value || '-';
    const date = document.getElementById('invoiceDate')?.value || new Date().toISOString().split('T')[0];
    const deliveryFee = parseFloat(document.getElementById('invoiceDeliveryFee')?.value) || 0;
    const discount = parseFloat(document.getElementById('invoiceDiscount')?.value) || 0;
    if (currentInvoiceItems.length === 0) return;

    const itemsTotal = currentInvoiceItems.reduce((sum, item) => sum + item.totalPrice, 0);
    const grandTotalNum = Math.max(0, itemsTotal + deliveryFee - discount);
    const grandTotalRielStr = Math.round(grandTotalNum * 4000).toLocaleString('km-KH');

    const pdfTemplate = `
        <div style="padding: 24px; font-family: 'Kantumruy Pro', sans-serif; color: #0f172a; background: #ffffff;">
            <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #6366f1; padding-bottom: 12px; margin-bottom: 20px;">
                <div><h1 style="color: #4f46e5; margin: 0; font-size: 22px; font-weight: 900;">VCK SHOP</h1><p style="margin: 3px 0 0 0; font-size: 11px; color: #64748b;">ផ្គត់ផ្គង់សម្ភារៈតុការចានប្រណិតទាន់សម័យ</p></div>
                <div style="text-align: right;"><h3 style="margin: 0; font-size: 15px; color: #1e293b;">វិក្កយបត្រ / INVOICE</h3><p style="margin: 3px 0 0 0; font-size: 11px; color: #6366f1; font-weight: bold;">${invCode}</p></div>
            </div>
            <div style="background-color: #f8fafc; padding: 12px 16px; border-radius: 12px; margin-bottom: 20px; font-size: 12px; border: 1px solid #e2e8f0; display: flex; justify-content: space-between;">
                <div><p style="margin: 2px 0;"><strong>អតិថិជន:</strong> ${customer}</p><p style="margin: 2px 0;"><strong>លេខទូរស័ព្ទ:</strong> ${phone}</p></div>
                <div style="text-align: right;"><p style="margin: 2px 0;"><strong>ថ្ងៃខែ:</strong> ${date}</p><p style="margin: 2px 0;"><strong>ទិសដៅ:</strong> ${location}</p></div>
            </div>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12px;">
                <thead><tr style="background-color: #4f46e5; color: white;"><th style="padding: 8px; text-align: center;">#</th><th style="padding: 8px; text-align: left;">ឈ្មោះទំនិញ</th><th style="padding: 8px; text-align: center;">ចំនួន</th><th style="padding: 8px; text-align: right;">តម្លៃរាយ</th><th style="padding: 8px; text-align: right;">សរុប</th></tr></thead>
                <tbody>
                    ${currentInvoiceItems.map((item, idx) => `
                        <tr style="border-bottom: 1px solid #f1f5f9;">
                            <td style="padding: 8px; text-align: center; color: #64748b;">${idx + 1}</td>
                            <td style="padding: 8px; font-weight: bold;">${item.name}</td>
                            <td style="padding: 8px; text-align: center;">${item.qty}</td>
                            <td style="padding: 8px; text-align: right;">$${parseFloat(item.price).toFixed(2)}</td> <td style="padding: 8px; text-align: right; font-weight: bold;">$${parseFloat(item.totalPrice).toFixed(2)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            <div style="display: flex; justify-content: space-between; align-items: flex-end;">
                <div style="font-size: 10px; color: #94a3b8;"><p style="margin: 0;">សូមអរគុណចំពោះការគាំទ្រ VCK SHOP!</p></div>
                <div style="text-align: right; font-size: 12px;">
                    <p style="margin: 2px 0; color: #64748b;">សរុបទំនិញ៖ $${itemsTotal.toFixed(2)}</p>
                    <p style="margin: 2px 0; color: #64748b;">សេវាដឹកជញ្ជូន៖ $${deliveryFee.toFixed(2)}</p>
                    ${discount > 0 ? `<p style="margin: 2px 0; color: #e11d48;">បញ្ចុះតម្លៃ៖ -$${discount.toFixed(2)}</p>` : ''}
                    <h3 style="margin: 6px 0 0 0; color: #4338ca; font-size: 18px; font-weight: 900;">សរុប៖ $${grandTotalNum.toFixed(2)} (${grandTotalRielStr} ៛)</h3>
                </div>
            </div>
        </div>
    `;

    const element = document.createElement('div');
    element.innerHTML = pdfTemplate;
    document.body.appendChild(element);

    html2pdf().set({ margin: [0.2, 0.2, 0.2, 0.2], filename: `${invCode}.pdf`, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2, useCORS: true }, jsPDF: { unit: 'in', format: 'a4', orientation: 'portrait' } }).from(element).save().then(() => {
        if (document.body.contains(element)) document.body.removeChild(element);
    }).catch(() => { if (document.body.contains(element)) document.body.removeChild(element); });
}

function addNewProductToStock() {
    if (currentUser && currentUser.role === 'Cashier') return alert("⚠️ អ្នកគ្មានសិទ្ធិបន្ថែមទំនិញទេ!");
    const name = document.getElementById('newProdName').value.trim();
    const cat = document.getElementById('newProdCat').value.trim();
    const total = parseInt(document.getElementById('newProdTotal').value);
    const price = parseFloat(document.getElementById('newProdPrice').value);
    if (!name || !cat || isNaN(total) || isNaN(price)) return alert("⚠️ សូមបំពេញព័ត៌មានឱ្យបានគ្រប់គ្រាន់!");

    const nextId = Date.now(); 
    const newProduct = { id: nextId, name, cat, total, avail: total, price };

    database.ref('products').child(nextId).set(newProduct).then(() => {
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

function updateDriver(invCode, driver) { 
    database.ref('deliveries/' + invCode).update({ driver }).then(() => updateDeliveryStatsByDate()); 
}

function updateStatus(invCode, status) { 
    database.ref('deliveries/' + invCode).update({ status }).then(() => {
        updateDeliveryStatsByDate();
        if (status === 'បានប្រគល់ជូន') {
            const deliveryItem = deliveryData.find(d => d.invCode === invCode);
            if (deliveryItem) {
                sendDeliverySuccessNotice(deliveryItem.phone, invCode, deliveryItem.customer);
            }
        }
    }); 
}

function updateDeliveryStatsByDate() {
    const statDateInput = document.getElementById('deliveryStatDate');
    if (!statDateInput) return;
    const selectedDate = statDateInput.value;
    const driverCounts = { "លាងហាក់": 0, "ផាន់នី": 0, "សុភាព": 0 };

    deliveryData.forEach(d => {
        const matchedSale = salesData.find(s => s.invCode === d.invCode);
        const deliveryDate = matchedSale ? matchedSale.date : '';
        if (deliveryDate === selectedDate && driverCounts.hasOwnProperty(d.driver) && d.status === 'បានប្រគល់ជូន') {
            driverCounts[d.driver]++;
        }
    });

    ['លាងហាក់', 'ផាន់នី', 'សុភាព'].forEach((drv, idx) => {
        const el = document.getElementById(`stat-driver-${idx+1}`);
        if (el) el.innerText = `${driverCounts[drv]} ជើង`;
    });
}

function renderDashboard() {
    const today = new Date().toISOString().split('T')[0];
    const selectedDate = document.getElementById('searchDate')?.value || '';
    const selectedMonth = document.getElementById('searchMonth')?.value || today.substring(0, 7);

    let dailySum = 0, monthlySum = 0;
    salesData.forEach(s => {
        const amt = parseFloat(s.total) || 0;
        if (selectedDate && s.date === selectedDate) dailySum += amt;
        if (s.date && typeof s.date === 'string' && s.date.substring(0, 7) === selectedMonth) monthlySum += amt;
    });

    const isAdmin = currentUser && currentUser.role === 'Admin';
    if (document.getElementById('dashDailyAmount')) document.getElementById('dashDailyAmount').innerText = isAdmin ? `$${dailySum.toFixed(2)}` : '***';
    if (document.getElementById('dashMonthlyAmount')) document.getElementById('dashMonthlyAmount').innerText = isAdmin ? `$${monthlySum.toFixed(2)}` : '***';
    if (document.getElementById('dashTotalProducts')) document.getElementById('dashTotalProducts').innerText = `${productsData.length} មុខ`;
    if (document.getElementById('dashLowStockCount')) document.getElementById('dashLowStockCount').innerText = `${productsData.filter(p => p.avail <= 5).length} មុខ`;

    renderSalesTable(selectedDate);
    renderBestSellersChart();
    renderComparisonChart();
    renderLocationHotspotsChart();
}

function renderComparisonChart() {
    const ctx = document.getElementById('comparisonChart')?.getContext('2d');
    if (!ctx) return;
    const now = new Date();
    const currentMonthStr = now.toISOString().substring(0, 7);
    const prevDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevMonthStr = prevDate.toISOString().substring(0, 7);

    let currentMonthDays = {}, prevMonthDays = {};
    salesData.forEach(sale => {
        if (!sale.date || !sale.total) return;
        const day = sale.date.substring(8, 10);
        const amt = parseFloat(sale.total) || 0;
        if (sale.date.startsWith(currentMonthStr)) currentMonthDays[day] = (currentMonthDays[day] || 0) + amt;
        else if (sale.date.startsWith(prevMonthStr)) prevMonthDays[day] = (prevMonthDays[day] || 0) + amt;
    });

    const labels = Array.from({length: 31}, (_, i) => (i + 1).toString().padStart(2, '0'));
    if (comparisonChartInstance) comparisonChartInstance.destroy();

    comparisonChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                { label: `ខែនេះ (${currentMonthStr})`, data: labels.map(d => currentMonthDays[d] || 0), borderColor: '#6366f1', backgroundColor: 'rgba(99, 102, 241, 0.1)', tension: 0.3, fill: true },
                { label: `ខែមុន (${prevMonthStr})`, data: labels.map(d => prevMonthDays[d] || 0), borderColor: '#94a3b8', backgroundColor: 'rgba(148, 163, 184, 0.05)', tension: 0.3, borderDash: [5, 5], fill: true }
            ]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });
}

function renderLocationHotspotsChart() {
    const ctx = document.getElementById('locationHotspotsChart')?.getContext('2d');
    if (!ctx) return;
    const locationCounts = {};
    salesData.forEach(sale => { if (sale.location) locationCounts[sale.location.trim()] = (locationCounts[sale.location.trim()] || 0) + 1; });
    const sortedLocs = Object.entries(locationCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);

    if (locationChartInstance) locationChartInstance.destroy();
    locationChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: sortedLocs.length > 0 ? sortedLocs.map(l => l[0]) : ['គ្មានទិន្នន័យ'],
            datasets: [{ label: 'ចំនួនដងដឹកជញ្ជូន', data: sortedLocs.length > 0 ? sortedLocs.map(l => l[1]) : [0], backgroundColor: '#10b981', borderRadius: 8 }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
    });
}

function renderSalesTable(selectedDate) {
    let filteredSales = selectedDate ? salesData.filter(s => s.date === selectedDate) : salesData;
    filteredSales.sort((a, b) => b.invCode.localeCompare(a.invCode));
    const salesTbody = document.getElementById('salesTableBody');
    if (salesTbody) {
        if (filteredSales.length === 0) {
            salesTbody.innerHTML = `<tr><td colspan="6" class="p-6 text-center text-xs font-bold text-slate-400">📝 មិនទាន់មានទិន្នន័យលក់ទេ</td></tr>`;
        } else {
            salesTbody.innerHTML = filteredSales.map(s => {
                const totalAmt = parseFloat(s.total) || 0;
                let totalTd = '', actionTd = '';
                if (currentUser && currentUser.role === 'Admin') {
                    totalTd = `<td class="p-3 text-right font-bold text-emerald-600 dark:text-emerald-400">$${totalAmt.toFixed(2)}</td>`;
                    actionTd = `<td class="p-3 text-center pr-6 flex justify-center gap-1"><button onclick="viewInvoice('${s.invCode}')" class="bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-600 hover:text-white text-indigo-600 p-1.5 rounded-lg text-[11px] cursor-pointer">👁️</button><button onclick="deleteInvoice('${s.invCode}')" class="bg-rose-50 dark:bg-rose-950/50 hover:bg-rose-600 hover:text-white text-rose-600 p-1.5 rounded-lg text-[11px] cursor-pointer">🗑️</button></td>`;
                } else {
                    totalTd = `<td class="p-3 text-right font-bold text-emerald-600 dark:text-emerald-400">***</td>`;
                    actionTd = `<td class="p-3 text-center pr-6"><button onclick="viewInvoice('${s.invCode}')" class="bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-600 hover:text-white text-indigo-600 p-1.5 rounded-lg text-[11px] cursor-pointer">👁️ មើល</button></td>`;
                }
                return `<tr class="text-xs hover:bg-slate-50 dark:hover:bg-slate-800/50 transition border-b border-slate-100 dark:border-slate-800"><td class="p-3 pl-6">${s.date || '-'}</td><td class="p-3 text-indigo-600 font-bold cursor-pointer" onclick="viewInvoice('${s.invCode}')">${s.invCode || '-'}</td><td class="p-3 font-bold text-slate-800 dark:text-slate-200">${s.customer || '-'}</td><td class="p-3 text-slate-500">${s.location || '-'}</td>${totalTd}${actionTd}</tr>`;
            }).join('');
        }
    }
}

function filterDeliveryTable() {
    const driverFilter = document.getElementById('filterDeliveryDriver').value;
    const statusFilter = document.getElementById('filterDeliveryStatus').value;
    const trs = document.getElementById('deliveryTableBody').getElementsByTagName('tr');
    for (let tr of trs) {
        const dVal = tr.querySelector('select[onchange*="updateDriver"]')?.value || '';
        const sVal = tr.querySelector('select[onchange*="updateStatus"]')?.value || '';
        tr.style.display = ((driverFilter === 'all' || dVal === driverFilter) && (statusFilter === 'all' || sVal === statusFilter)) ? '' : 'none';
    }
}

function renderAll() {
    renderDashboard();
    const deliveryTbody = document.getElementById('deliveryTableBody');
    if (deliveryTbody) {
        deliveryTbody.innerHTML = deliveryData.length === 0 ? `<tr><td colspan="8" class="p-6 text-center text-xs font-bold text-slate-400">🚚 មិនទាន់មានជើងដឹកជញ្ជូនទេ</td></tr>` : deliveryData.map(d => {
            return `<tr class="text-xs hover:bg-slate-50 dark:hover:bg-slate-800/50 border-b border-slate-100 dark:border-slate-800">
                <td class="p-4 pl-6 text-slate-500">${salesData.find(s => s.invCode === d.invCode)?.date || '-'}</td>
                <td class="p-4 font-bold text-indigo-600 cursor-pointer" onclick="viewInvoice('${d.invCode}')">${d.invCode}</td>
                <td class="p-4 font-bold dark:text-slate-200">${d.customer || '-'}</td>
                <td class="p-4 text-slate-600 dark:text-slate-400">${d.fromLoc || 'ភ្នំពេញ'}</td>
                <td class="p-4 font-medium text-indigo-600">${d.location || '-'}</td>
                <td class="p-4"><select onchange="updateDriver('${d.invCode}', this.value)" class="border p-1.5 rounded-xl text-xs bg-white dark:bg-slate-800 font-bold dark:text-white"><option value="មិនទាន់ចាត់ចែង" ${d.driver==='មិនទាន់ចាត់ចែង'?'selected':''}>--- ជ្រើសរើស ---</option><option value="លាងហាក់" ${d.driver==='លាងហាក់'?'selected':''}>លាងហាក់</option><option value="ផាន់នី" ${d.driver==='ផាន់នី'?'selected':''}>ផាន់នី</option><option value="សុភាព" ${d.driver==='សុភាព'?'selected':''}>សុភាព</option></select></td>
                <td class="p-4 text-center"><span class="px-2.5 py-1 rounded-full text-[10px] font-bold ${d.status==='បានប្រគល់ជូន'?'bg-emerald-50 text-emerald-600':'bg-indigo-50 text-indigo-600'}">${d.status}</span></td>
                <td class="p-4 text-center"><select onchange="updateStatus('${d.invCode}', this.value)" class="border p-1.5 rounded-xl text-xs bg-white dark:bg-slate-800 dark:text-white"><option value="កំពុងរៀបចំ">កំពុងរៀបចំ</option><option value="កំពុងដឹក">កំពុងដឹក</option><option value="បានប្រគល់ជូន">បានប្រគល់ជូន</option></select></td>
            </tr>`;
        }).join('');
    }

    const stockTbody = document.getElementById('stockTableBody');
    if (stockTbody) {
        const isAdmin = currentUser && currentUser.role === 'Admin';
        stockTbody.innerHTML = productsData.length === 0 ? `<tr><td colspan="7" class="p-6 text-center text-xs font-bold text-slate-400">📦 មិនទាន់មានទំនិញទេ</td></tr>` : productsData.map((p, index) => `
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
    updateDeliveryStatsByDate();
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

function viewInvoice(invoiceId) {
    database.ref('sales/' + invoiceId).once('value').then((snapshot) => {
        const data = snapshot.val();
        if (!data) return alert("រកមិនឃើញវិក្កយបត្រនេះទេ!");
        const modal = document.getElementById('invoiceModal');
        const content = document.getElementById('modalInvoiceContent');
        const deliveryFee = parseFloat(data.deliveryFee) || 0;
        const discount = parseFloat(data.discount) || 0;
        const totalNum = parseFloat(data.total) || 0;

        content.innerHTML = `
            <div class="border-b border-slate-100 dark:border-slate-800 pb-3 mb-4 space-y-1">
                <p class="text-xs font-bold text-slate-500">វិក្កយបត្រលេខ: <span class="text-indigo-600">${data.invCode}</span></p>
                <p class="text-xs font-bold text-slate-500">អតិថិជន: <span class="text-slate-800 dark:text-slate-200">${data.customer}</span> (${data.phone})</p>
                <p class="text-xs font-bold text-slate-500">ទិសដៅ: <span class="text-slate-800 dark:text-slate-200">${data.location}</span></p>
            </div>
            <table class="w-full text-xs border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                <thead class="bg-slate-100 dark:bg-slate-800"><tr><th class="p-2 text-left">ទំនិញ</th><th class="p-2 text-center">ចំនួន</th><th class="p-2 text-right">តម្លៃ</th><th class="p-2 text-right">សរុប</th></tr></thead>
                <tbody class="divide-y divide-slate-100 dark:divide-slate-800">
                    ${data.items.map(item => `<tr><td class="p-2 font-medium">${item.name}</td><td class="p-2 text-center font-bold">${item.qty}</td><td class="p-2 text-right">$${item.price.toFixed(2)}</td><td class="p-2 text-right font-bold">$${item.totalPrice.toFixed(2)}</td></tr>`).join('')}
                </tbody>
            </table>
            <div class="mt-3 text-xs space-y-1 bg-slate-50 dark:bg-slate-800/50 p-3 rounded-2xl">
                <div class="flex justify-between text-slate-600"><span>សរុបទំនិញ៖</span><span>$${(totalNum - deliveryFee + discount).toFixed(2)}</span></div>
                <div class="flex justify-between text-slate-600"><span>សេវាដឹក៖</span><span>$${deliveryFee.toFixed(2)}</span></div>
                ${discount > 0 ? `<div class="flex justify-between text-rose-500 font-bold"><span>បញ្ចុះតម្លៃ៖</span><span>-$${discount.toFixed(2)}</span></div>` : ''}
            </div>
            <div class="text-right mt-4 p-3 bg-indigo-50 dark:bg-indigo-950/50 rounded-2xl"><p class="text-xs font-black text-indigo-700 dark:text-indigo-300">សរុបទាំងអស់: $${totalNum.toFixed(2)} (${Math.round(totalNum * 4000).toLocaleString('km-KH')} ៛)</p></div>
        `;
        modal.classList.remove('hidden');
    });
}

function closeInvoiceModal() { document.getElementById('invoiceModal').classList.add('hidden'); }
function toggleMobileMenu() {
    document.getElementById('sidebarMenu').classList.toggle('hidden');
    const footer = document.getElementById('userFooter');
    footer.classList.toggle('hidden'); footer.classList.toggle('flex');
}

function renderBestSellersChart() {
    const ctx = document.getElementById('bestSellersChart')?.getContext('2d');
    if (!ctx) return;
    const filter = document.getElementById('chartFilter')?.value || 'month';
    const currentMonth = new Date().toISOString().substring(0, 7);
    const productSalesCount = {};
    salesData.forEach(sale => {
        if (filter === 'month' && sale.date && !sale.date.startsWith(currentMonth)) return;
        sale.items?.forEach(item => { productSalesCount[item.name] = (productSalesCount[item.name] || 0) + item.qty; });
    });
    const sorted = Object.entries(productSalesCount).sort((a, b) => b[1] - a[1]).slice(0, 5);
    if (myChartInstance) myChartInstance.destroy();
    myChartInstance = new Chart(ctx, {
        type: 'doughnut',
        data: { labels: sorted.length > 0 ? sorted.map(p => p[0]) : ['គ្មានទិន្នន័យ'], datasets: [{ data: sorted.length > 0 ? sorted.map(p => p[1]) : [1], backgroundColor: ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'] }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } }
    });
}
