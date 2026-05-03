// PDF Print Function - Opens a clean new window with ONLY the report
function printLaporanPDF() {
    const printable = document.getElementById('printable-report');
    if (!printable) {
        alert('Silakan tampilkan laporan terlebih dahulu.');
        return;
    }

    // Grab the embedded <style> block from the report result div
    const styleEl = document.querySelector('#laporan-result style');
    const reportStyles = styleEl ? styleEl.outerHTML : '';

    const printContent = `
        <!DOCTYPE html>
        <html lang="id">
        <head>
            <meta charset="UTF-8">
            <title>Laporan Mingguan</title>
            ${reportStyles}
            <style>
                * { box-sizing: border-box; }
                body { margin: 0; padding: 0; font-family: Arial, sans-serif; background: #fff; }
                .no-print, .btn-export { display: none !important; }
                .potongan-page { break-before: page; page-break-before: always; border-top: none !important; margin-top: 0 !important; padding-top: 20px; }
                @page { margin: 1cm; size: A4 portrait; }
            </style>
        </head>
        <body>${printable.innerHTML}</body>
        </html>
    `;

    const win = window.open('', '_blank', 'width=900,height=1200');
    win.document.write(printContent);
    win.document.close();
    win.onload = () => {
        win.focus();
        win.print();
        win.close();
    };
}

// ============================================================
// State Management — Turso Integration
// ============================================================
const STORAGE_KEY = 'tambangBatuData';

const defaultData = {
    buyers: [],
    drivers: [],
    expenseTypes: [],
    settlements: [],
    deductions: [],
    transactions: []
};

let _cache = null;

function getData() {
    if (!_cache) {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            try {
                _cache = JSON.parse(raw);
            } catch(e) {
                console.error("Gagal membaca localStorage", e);
                _cache = JSON.parse(JSON.stringify(defaultData));
            }
        } else {
            _cache = JSON.parse(JSON.stringify(defaultData));
        }
    }
    return _cache;
}

// Fetch all data from Turso
async function fetchAllDataFromTurso() {
    console.log("📥 Mengambil data dari Turso via Cloudflare API...");
    try {
        const response = await fetch('/api/sync');
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();

        _cache = {
            buyers: (data.buyers || []).map(b => ({ ...b, unitPrice: b.unitprice })),
            drivers: (data.drivers || []).map(d => ({ ...d, vehicleNumber: d.vehiclenumber })),
            expenseTypes: (data.expenseTypes || []).map(e => ({ ...e, basePrice: e.baseprice })),
            settlements: data.settlements || [],
            deductions: (data.deductions || []).map(d => ({ ...d, buyerId: d.buyerid })),
            transactions: (data.transactions || []).map(t => ({
                ...t,
                buyerId: t.buyerid,
                driverId: t.driverid,
                totalAmount: t.totalamount,
                operationalExpense: t.operationalexpense,
                retributionExpense: t.retributionexpense,
                expenseDetails: typeof t.expenses === 'string' ? JSON.parse(t.expenses) : (t.expenses || [])
            }))
        };

        saveData(_cache);
        console.log("✅ Data berhasil disinkronkan dari Turso.");
    } catch (e) {
        console.error("❌ Gagal mengambil data dari Turso:", e);
    }
}

// ============================================================
// Authentication & User Management
// ============================================================

let currentUser = null;

async function initAuth() {
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('login-username').value;
            const password = document.getElementById('login-password').value;
            const errorEl = document.getElementById('login-error');
            const btn = document.getElementById('btn-login');

            errorEl.textContent = '';
            btn.disabled = true;
            btn.innerHTML = '<div style="width:20px;height:20px;border:2px solid rgba(255,255,255,0.2);border-top-color:#fff;border-radius:50%;animation:spin 0.6s linear infinite;"></div> <span>Processing...</span>';

            try {
                const response = await fetch('/api/auth', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });

                const result = await response.json();

                if (response.ok && result.success) {
                    handleUserSignIn(result.user);
                } else {
                    errorEl.textContent = result.error || "Login gagal.";
                    btn.disabled = false;
                    btn.innerHTML = '<span>Sign In</span> <span class="material-symbols-outlined">login</span>';
                }
            } catch (err) {
                console.error("Auth Failure:", err);
                errorEl.textContent = "Terjadi kesalahan koneksi.";
                btn.disabled = false;
                btn.innerHTML = '<span>Sign In</span> <span class="material-symbols-outlined">login</span>';
            }
        });
    }

    const session = localStorage.getItem('session');
    if (session) {
        handleUserSignIn(JSON.parse(session));
    }
}

async function handleUserSignIn(user) {
    localStorage.setItem('session', JSON.stringify(user));
    currentUser = user;
    
    document.getElementById('header-user-name').textContent = `${user.profile?.full_name || user.username} (${user.profile?.role || 'User'})`;
    const navUsers = document.getElementById('nav-users');
    if (navUsers) {
        if (user.profile?.role === 'Admin') {
            navUsers.style.display = 'flex';
        } else {
            navUsers.style.display = 'none';
        }
    }

    document.getElementById('login-page').style.display = 'none';
    document.getElementById('main-app').style.display = 'flex';
    document.getElementById('loading-overlay').style.display = 'none';

    await fetchAllDataFromTurso();
    bootApp();
}

function handleUserSignOut() {
    currentUser = null;
    localStorage.removeItem('session');
    document.getElementById('login-page').style.display = 'flex';
    document.getElementById('main-app').style.display = 'none';
    const form = document.getElementById('login-form');
    if (form) form.reset();
    const btn = document.getElementById('btn-login');
    if (btn) {
        btn.disabled = false;
        btn.innerHTML = '<span>Sign In</span> <span class="material-symbols-outlined">login</span>';
    }
}

window.logout = async () => {
    if (confirm('Yakin ingin keluar?')) {
        handleUserSignOut();
    }
};

async function saveData(data, table = null, item = null) {
    _cache = data;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));

    if (table && item) {
        try {
            const response = await fetch('/api/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ table, item })
            });
            if (!response.ok) throw new Error('Network error');
            console.log(`✅ Berhasil simpan ke Turso (${table})`);
        } catch (e) {
            console.error(`❌ Gagal simpan ke Turso (${table}):`, e);
        }
    }
}

async function deleteFromDatabase(table, id) {
    try {
        const response = await fetch(`/api/sync?table=${table}&id=${id}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Network error');
        console.log(`✅ Berhasil hapus dari Turso (${table})`);
    } catch (e) {
        console.error(`❌ Gagal hapus dari Turso (${table}):`, e);
    }
}

function updateData(key, newArray) {
    const data = getData();
    data[key] = newArray;
    saveData(data);
}

// App boot — called once on page load
async function bootApp() {
    console.log("🛠️ [DEBUG] bootApp dipanggil (Mode Turso)!");
    
    const overlay = document.getElementById('loading-overlay');
    try {
        // Coba load dari Turso
        await fetchAllDataFromTurso();
        _initApp();
    } catch(err) {
        console.error('Boot error:', err);
        // Fallback ke local
        _initApp();
    } finally {
        if (overlay) overlay.style.display = 'none';
        console.log("✅ [DEBUG] App siap digunakan.");
    }
}
