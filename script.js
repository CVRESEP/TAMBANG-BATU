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
    transactions: [],
    profiles: [],
    solar: [],
    solarSuppliers: [],
    solarDateOverrides: {},
    solarRowOverrides: {}
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

        const solarDateOverrides = {};
        const solarRowOverrides = {};
        (data.solarOverrides || []).forEach(o => {
            if (o.id && o.id.startsWith('row-')) {
                const rowKey = o.id.replace('row-', '');
                solarRowOverrides[rowKey] = o.supplier;
            } else if (o.date && o.supplier) {
                solarDateOverrides[o.date] = o.supplier;
            }
        });

        _cache = {
            buyers: (data.buyers || []).map(b => ({ ...b, unitPrice: b.unitprice })),
            drivers: (data.drivers || []).map(d => ({ ...d, vehicleNumber: d.vehiclenumber })),
            expenseTypes: (data.expenseTypes || []).map(e => ({ ...e, basePrice: e.baseprice, order: e.sort_order, linkedBuyerId: e.linked_buyer_id, linkedSolarSupplier: e.linked_solar_supplier || e.linkedSolarSupplier || '' })),
            settlements: (data.settlements || []).map(s => ({ ...s, expenseTypeId: s.expensetypeid })),
            deductions: (data.deductions || []).map(d => ({ ...d, buyerId: d.buyerid, dateStart: d.datestart, dateEnd: d.dateend })),
            transactions: (data.transactions || []).map(t => ({
                ...t,
                buyerId: t.buyerid,
                driverId: t.driverid,
                totalAmount: t.totalamount,
                operationalExpense: t.operationalexpense,
                retributionExpense: t.retributionexpense,
                expenseDetails: typeof t.expenses === 'string' ? JSON.parse(t.expenses) : (t.expenses || []),
                sales: typeof t.sales === 'string' ? JSON.parse(t.sales) : (t.sales || []),
                status: t.status || 'Belum Lunas',
                paidAmount: t.paid_amount !== undefined && t.paid_amount !== null ? parseFloat(t.paid_amount) : (t.status === 'Lunas' ? (parseFloat(t.totalamount) || 0) : (parseFloat(t.paidAmount) || 0)),
                paidAt: t.paid_at || t.paidAt || null,
                paymentMethod: t.payment_method || t.paymentMethod || null,
                paymentNote: t.payment_note || t.paymentNote || null,
                payments: typeof t.payments === 'string' ? JSON.parse(t.payments) : (t.payments || [])
            })),
            profiles: (data.profiles || []).map(p => ({ ...p, fullName: p.full_name })),
            solar: data.solar || [],
            solarSuppliers: data.solarSuppliers || [],
            solarDateOverrides: solarDateOverrides,
            solarRowOverrides: solarRowOverrides
        };

        // Seed default admin if totally empty
        if (_cache.profiles.length === 0) {
            _cache.profiles.push({
                id: 'admin-default',
                fullName: 'Administrator',
                email: 'ADMIN',
                role: 'Admin',
                created_at: new Date().toISOString()
            });
        }

        // Auto-seed suppliers to database if solarSuppliers table is empty
        const allKnown = getAllSolarSuppliers(_cache);
        if (allKnown.length > 0 && _cache.solarSuppliers.length === 0) {
            for (const supName of allKnown) {
                if (supName && supName !== '-' && supName !== 'INTERNAL') {
                    const supItem = { id: generateId(), name: supName, created_at: new Date().toISOString() };
                    _cache.solarSuppliers.push(supItem);
                    saveData(_cache, 'solar_suppliers', supItem);
                }
            }
        }

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
            if (!response.ok) {
                const errData = await response.json().catch(() => ({}));
                throw new Error(errData.error || 'Network error');
            }
            console.log(`✅ Berhasil simpan ke Turso (${table})`);
        } catch (e) {
            console.error(`❌ Gagal simpan ke Turso (${table}):`, e);
            alert(`Gagal menyimpan ke database cloud: ${e.message}. Perubahan mungkin hilang saat refresh.`);
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

// Generate unique ID
const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2);

// Formatting Utilities
const formatCurrency = (value) => {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(value);
};

const formatDate = (dateString = new Date()) => {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    return new Date(dateString).toLocaleDateString('id-ID', options);
};

function showToast(message, type = 'success') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = 'position:fixed;bottom:20px;right:20px;z-index:99999;display:flex;flex-direction:column;gap:8px;pointer-events:none;';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    const bg = type === 'error' ? '#ef4444' : (type === 'warning' ? '#f59e0b' : '#10b981');
    toast.style.cssText = `background:${bg};color:white;padding:0.75rem 1.25rem;border-radius:0.5rem;box-shadow:0 4px 12px rgba(0,0,0,0.15);font-size:0.875rem;font-family:Inter,sans-serif;display:flex;align-items:center;gap:0.5rem;pointer-events:auto;animation:fadeIn 0.3s ease;`;
    toast.innerHTML = `<span class="material-symbols-outlined" style="font-size:18px;">${type === 'error' ? 'error' : (type === 'warning' ? 'warning' : 'check_circle')}</span> <span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transition = 'opacity 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}
window.showToast = showToast;

// _initApp: called by bootApp() AFTER Turso data is loaded
function _initApp() {
    // Current Date Display
    document.getElementById('current-date').textContent = formatDate();

    // Navigation Router
    const navLinks = document.querySelectorAll('.nav-link');
    const pages = document.querySelectorAll('.page');
    const pageTitle = document.getElementById('page-title');

    window.navigateTo = function (targetId) {
        pages.forEach(page => page.classList.remove('active'));
        navLinks.forEach(link => link.classList.remove('active'));
        const targetPage = document.getElementById(targetId);
        if (targetPage) targetPage.classList.add('active');
        const targetLink = document.querySelector(`.nav-link[data-target="${targetId}"]`);
        if (targetLink) {
            targetLink.classList.add('active');
            const linkText = Array.from(targetLink.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join('');
            pageTitle.textContent = linkText || targetLink.innerText.split('\n').pop().trim();
        }
        if (window[`render_${targetId}`]) {
            window[`render_${targetId}`]();
        }
    };

    // Attach click events to nav links
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            window.navigateTo(e.currentTarget.dataset.target);
        });
    });

    // Modals Handling
    const modalOverlay = document.getElementById('modal-overlay');
    const formModal = document.getElementById('form-modal');
    const btnCloseModal = document.getElementById('btn-close-modal');

    window.openModal = function (title, contentHtml, maxWidth = null) {
        document.getElementById('modal-title').textContent = title;
        const body = document.getElementById('modal-body-content');
        body.innerHTML = contentHtml;
        if (maxWidth) {
            formModal.style.maxWidth = maxWidth;
        } else {
            formModal.style.maxWidth = '500px';
        }
        modalOverlay.classList.add('active');
        formModal.classList.add('active');
        setTimeout(() => focusFirstInput(body), 50);
    };

    window.closeModal = function () {
        modalOverlay.classList.remove('active');
        formModal.classList.remove('active');
        formModal.style.maxWidth = '';
    };

    function focusFirstInput(container) {
        if (!container) return;
        const firstInput = container.querySelector('input:not([readonly]):not([type="hidden"]), select, textarea');
        if (firstInput) {
            firstInput.focus();
            if (firstInput.select && firstInput.type !== 'date') firstInput.select();
        }
    }
    window.focusFirstInput = focusFirstInput;

    btnCloseModal.addEventListener('click', closeModal);
    modalOverlay.addEventListener('click', (e) => {
        if (e.target === modalOverlay) closeModal();
    });

    // Initial load: Dashboard
    window.navigateTo('dashboard');

    // Initialize Potongan Filters
    const pStart = document.getElementById('filter-potongan-start');
    const pEnd = document.getElementById('filter-potongan-end');
    if (pStart && pEnd) {
        // Default: minggu ini (Senin - Minggu)
        const now = new Date();
        const dayOfWeek = now.getDay();
        const monday = new Date(now);
        monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        
        pStart.value = monday.toISOString().split('T')[0];
        pEnd.value = sunday.toISOString().split('T')[0];
        pStart.addEventListener('change', () => render_potongan_page());
        pEnd.addEventListener('change', () => render_potongan_page());
    }

    const sType = document.getElementById('filter-setoran-type');
    if (sType) {
        sType.addEventListener('change', () => render_potongan_page());
    }

    // Initialize Bulk Delete Listeners
    initBulkDeleteListeners();
}

// Boot the app when the DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAuth);
} else {
    initAuth();
}

// ==========================================
// USER MANAGEMENT FUNCTIONS
// ==========================================


window.render_users = () => {
    const data = getData();
    const tbody = document.getElementById('users-table-body');
    if (!tbody) return;

    if (!data.profiles || data.profiles.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Belum ada akun terdaftar</td></tr>';
        return;
    }

    tbody.innerHTML = data.profiles.map(p => `
        <tr>
            <td>
                <div class="d-flex align-center" style="gap:0.75rem">
                    <div style="width:32px; height:32px; background:var(--primary-color); color:white; border-radius:50%; display:flex; align-center; justify-content:center; font-weight:600; font-size:0.8rem">
                        ${p.fullName ? p.fullName.charAt(0).toUpperCase() : '?'}
                    </div>
                    <div>
                        <div style="font-weight:600">${p.fullName || 'No Name'}</div>
                        <div style="font-size:0.75rem; color:#64748b">${p.email || '-'}</div>
                    </div>
                </div>
            </td>
            <td><span class="badge" style="background:${p.role === 'Admin' ? '#f0fdf4' : '#f8fafc'}; color:${p.role === 'Admin' ? '#166534' : '#64748b'}; border:1px solid ${p.role === 'Admin' ? '#bbf7d0' : '#e2e8f0'}">${p.role || 'User'}</span></td>
            <td>${p.created_at ? formatDate(p.created_at.split('T')[0]) : '-'}</td>
            <td>
                <div class="d-flex" style="gap: 0.5rem">
                    <button class="btn-icon" style="color: var(--primary-color)" onclick="editUser('${p.id}')"><span class="material-symbols-outlined">edit</span></button>
                    <button class="btn-icon" style="color: var(--danger)" onclick="deleteFromDatabase('profiles', '${p.id}'); let d=getData(); d.profiles=d.profiles.filter(x=>x.id!=='${p.id}'); saveData(d); render_users();"><span class="material-symbols-outlined">delete</span></button>
                </div>
            </td>
        </tr>
    `).join('');
};

window.openAddUserModal = () => {
    currentEditId = null;
    const formHtml = `
        <form id="form-user" autocomplete="off">
            <div class="form-group">
                <label>Nama Lengkap</label>
                <input type="text" id="user-fullname" class="form-control" required>
            </div>
            <div class="form-group">
                <label>Email / Username</label>
                <input type="text" id="user-email" class="form-control" required>
            </div>
            <div class="form-group">
                <label>Password</label>
                <input type="password" id="user-password" class="form-control" placeholder="Isi password baru..." required>
            </div>
            <div class="form-group">
                <label>Role</label>
                <select id="user-role" class="form-control">
                    <option value="Admin">Admin</option>
                    <option value="User">User (Read Only)</option>
                </select>
            </div>
            <div class="form-actions">
                <button type="button" class="btn" onclick="closeModal()">Batal</button>
                <button type="submit" class="btn btn-primary">Simpan Akun</button>
            </div>
        </form>
    `;
    openModal('Tambah Akun Baru', formHtml);
    document.getElementById('form-user').onsubmit = (e) => {
        e.preventDefault();
        saveUser();
    };
};

window.editUser = (id) => {
    currentEditId = id;
    const data = getData();
    const p = data.profiles.find(x => x.id === id);
    if (!p) return;

    const formHtml = `
        <form id="form-user" autocomplete="off">
            <div class="form-group">
                <label>Nama Lengkap</label>
                <input type="text" id="user-fullname" class="form-control" value="${p.fullName || ''}" required>
            </div>
            <div class="form-group">
                <label>Email / Username</label>
                <input type="text" id="user-email" class="form-control" value="${p.email || ''}" required>
            </div>
            <div class="form-group">
                <label>Password</label>
                <input type="password" id="user-password" class="form-control" placeholder="Kosongkan jika tidak ingin ganti">
            </div>
            <div class="form-group">
                <label>Role</label>
                <select id="user-role" class="form-control">
                    <option value="Admin" ${p.role === 'Admin' ? 'selected' : ''}>Admin</option>
                    <option value="User" ${p.role === 'User' ? 'selected' : ''}>User (Read Only)</option>
                </select>
            </div>
            <div class="form-actions">
                <button type="button" class="btn" onclick="closeModal()">Batal</button>
                <button type="submit" class="btn btn-primary">Perbarui Akun</button>
            </div>
        </form>
    `;
    openModal('Edit Akun', formHtml);
    document.getElementById('form-user').onsubmit = (e) => {
        e.preventDefault();
        saveUser(id);
    };
};

function saveUser(id = null) {
    const fullName = document.getElementById('user-fullname').value;
    const email = document.getElementById('user-email').value;
    const password = document.getElementById('user-password').value;
    const role = document.getElementById('user-role').value;

    const data = getData();
    if (!data.profiles) data.profiles = [];

    let item;
    if (id) {
        const idx = data.profiles.findIndex(p => p.id === id);
        if (idx > -1) {
            const updated = { ...data.profiles[idx], fullName, email, role };
            if (password) updated.password = password;
            data.profiles[idx] = updated;
            item = data.profiles[idx];
        }
    } else {
        item = {
            id: generateId(),
            fullName,
            email,
            password,
            role,
            created_at: new Date().toISOString()
        };
        data.profiles.push(item);
    }

    const supabaseItem = {
        id: item.id,
        full_name: item.fullName,
        email: item.email,
        password: item.password,
        role: item.role,
        created_at: item.created_at
    };

    saveData(data, 'profiles', supabaseItem);
    closeModal();
    render_users();
}


// ==========================================
// RENDER FUNCTIONS FOR PAGES
// ==========================================


window.render_dashboard = () => {
    const data = getData();
    document.getElementById('stat-buyers').textContent = data.buyers.length;
    document.getElementById('stat-drivers').textContent = data.drivers.length;

    // Calculate total transactions
    const totalSales = data.transactions.reduce((sum, tr) => sum + tr.totalAmount, 0);
    const totalExpense = data.transactions.reduce((sum, tr) => sum + (tr.operationalExpense || 0) + (tr.retributionExpense || 0), 0);

    document.getElementById('stat-sales').textContent = formatCurrency(totalSales);
    document.getElementById('stat-expense').textContent = formatCurrency(totalExpense);

    // Render Recent Transactions
    const tbody = document.getElementById('tbody-recent');
    tbody.innerHTML = '';

    if (data.transactions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Belum ada transaksi</td></tr>';
        return;
    }

    // Get last 5 transactions
    const recentTx = [...data.transactions].reverse().slice(0, 5);

    recentTx.forEach(tx => {
        const buyer = data.buyers.find(b => b.id === tx.buyerId);
        const driver = data.drivers.find(d => d.id === tx.driverId);

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${formatDate(tx.date)}</td>
            <td>${buyer ? buyer.name : '-'}</td>
            <td>${driver ? driver.name : '-'}</td>
            <td>${formatCurrency(tx.totalAmount)}</td>
            <td><span class="badge ${tx.status === 'Lunas' ? 'success' : 'warning'}">${tx.status || 'Belum Lunas'}</span></td>
        `;
        tbody.appendChild(tr);
    });
};

window.render_pembeli = () => {
    const data = getData();
    const tbody = document.getElementById('tbody-pembeli');
    tbody.innerHTML = '';

    if (data.buyers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Belum ada data pembeli</td></tr>';
        return;
    }

    data.buyers.forEach(buyer => {
        const tr = document.createElement('tr');
        const badgeColor = buyer.category === 'Proyek' ? 'var(--success)' : 'var(--primary-color)';
        const badgeBg = buyer.category === 'Proyek' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(79, 70, 229, 0.1)';
        tr.innerHTML = `
            <td><input type="checkbox" class="check-pembeli" data-id="${buyer.id}"></td>
            <td><strong>${buyer.name}</strong></td>
            <td><span style="display:inline-block; padding:0.25rem 0.5rem; border-radius:1rem; font-size:0.75rem; background:${badgeBg}; color:${badgeColor}; font-weight:600">${buyer.category || 'Umum'}</span></td>
            <td>${buyer.address}</td>
            <td>${buyer.unit}</td>
            <td>${formatCurrency(buyer.unitPrice)}</td>
            <td>
                <div class="d-flex" style="gap: 0.5rem">
                    <button class="btn-icon" style="color: var(--primary-color)" onclick="editPembeli('${buyer.id}')"><span class="material-symbols-outlined">edit</span></button>
                    <button class="btn-icon" style="color: var(--danger)" onclick="deletePembeli('${buyer.id}')"><span class="material-symbols-outlined">delete</span></button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
};

window.render_sopir = () => {
    const data = getData();
    const tbody = document.getElementById('tbody-sopir');
    tbody.innerHTML = '';

    if (data.drivers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">Belum ada data sopir</td></tr>';
        return;
    }

    data.drivers.forEach(driver => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><input type="checkbox" class="check-sopir" data-id="${driver.id}"></td>
            <td><strong>${driver.name}</strong></td>
            <td><span class="badge" style="background:#f3f4f6; color:#111827; padding:0.2rem 0.6rem; border-radius:0.5rem; border:1px solid #e5e7eb;">${driver.vehicleNumber}</span></td>
            <td>${driver.phone}</td>
            <td>
                <div class="d-flex" style="gap: 0.5rem">
                    <button class="btn-icon" style="color: var(--primary-color)" onclick="editSopir('${driver.id}')"><span class="material-symbols-outlined">edit</span></button>
                    <button class="btn-icon" style="color: var(--danger)" onclick="deleteSopir('${driver.id}')"><span class="material-symbols-outlined">delete</span></button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
};

window.render_pengeluaran = () => {
    const data = getData();
    const tbody = document.getElementById('tbody-pengeluaran');
    tbody.innerHTML = '';

    if (data.expenseTypes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted">Belum ada data jenis pengeluaran</td></tr>';
        return;
    }

    // Extract unique solar suppliers
    const knownSuppliers = new Set();
    (data.solar || []).forEach(s => {
        if (s.supplier && s.supplier.trim()) knownSuppliers.add(s.supplier.trim().toUpperCase());
    });
    (data.expenseTypes || []).forEach(e => {
        if (e.linkedSolarSupplier && e.linkedSolarSupplier.trim()) knownSuppliers.add(e.linkedSolarSupplier.trim().toUpperCase());
    });
    const solarSupplierList = Array.from(knownSuppliers).sort();

    const sortedExpenses = [...data.expenseTypes].sort((a, b) => (a.order || 0) - (b.order || 0));
    sortedExpenses.forEach((exp, index) => {
        const tr = document.createElement('tr');
        const natureColor = exp.nature === 'Pasti' ? 'var(--success)' : 'var(--danger)';
        const natureBg = exp.nature === 'Pasti' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)';

        tr.innerHTML = `
            <td><input type="checkbox" class="check-pengeluaran" data-id="${exp.id}"></td>
            <td>${exp.order || 0}</td>
            <td><strong>${exp.name}</strong></td>
            <td><span style="display:inline-block; padding:0.25rem 0.5rem; border-radius:1rem; font-size:0.75rem; background:${exp.category === 'Operasional' ? 'rgba(79, 70, 229, 0.1)' : 'rgba(245, 158, 11, 0.1)'}; color:${exp.category === 'Operasional' ? 'var(--primary-color)' : 'var(--warning)'}">${exp.category}</span></td>
            <td><span style="display:inline-block; padding:0.25rem 0.5rem; border-radius:1rem; font-size:0.75rem; background:${natureBg}; color:${natureColor}; font-weight:600">${exp.nature || 'Tidak Pasti'}</span></td>
            <td>${exp.unit || '-'}</td>
            <td>${formatCurrency(exp.basePrice || 0)}</td>
            <td>
                <select class="form-control form-control-sm" style="font-size:0.75rem; padding:0.2rem" onchange="updatePengeluaranLinkedBuyer('${exp.id}', this.value)">
                    <option value="">- Tidak -</option>
                    ${getData().buyers.map(b => `<option value="${b.id}" ${b.id === exp.linkedBuyerId ? 'selected' : ''}>${b.name}</option>`).join('')}
                </select>
            </td>
            <td>
                <select class="form-control form-control-sm" style="font-size:0.75rem; padding:0.2rem; min-width: 110px;" onchange="updatePengeluaranLinkedSupplier('${exp.id}', this.value)">
                    <option value="">- Tidak -</option>
                    ${solarSupplierList.map(sup => `<option value="${sup}" ${sup === (exp.linkedSolarSupplier || '').toUpperCase() ? 'selected' : ''}>${sup}</option>`).join('')}
                    <option value="__NEW__">+ Tambah Pemasok...</option>
                </select>
            </td>
            <td>
                <div class="d-flex" style="gap: 0.5rem">
                    <button class="btn-icon" style="color: var(--primary-color)" onclick="editPengeluaran('${exp.id}')"><span class="material-symbols-outlined">edit</span></button>
                    <button class="btn-icon" style="color: var(--danger)" onclick="deleteFromDatabase('expense_types', '${exp.id}')"><span class="material-symbols-outlined">delete</span></button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
};

// --- FIFO SOLAR CALCULATION ENGINE ---
function getPertaminaDexSupplier(data) {
    const suppliers = getAllSolarSuppliers(data);
    const dex = suppliers.find(s => s.toUpperCase().includes('PERTAMINA DEX') || s.toUpperCase().includes('DEX'));
    if (dex) return dex;
    return 'PERTAMINA DEX';
}

function getCalculatedSolarRecords(data) {
    const expenseMap = {};
    (data.expenseTypes || []).forEach(e => {
        expenseMap[e.id] = e;
    });

    const pertaminaDexSup = getPertaminaDexSupplier(data);

    // 1. Separate Masuk Batches (sorted chronologically)
    const masukBatches = (data.solar || [])
        .filter(s => s.type === 'Masuk')
        .map(s => ({
            id: s.id,
            date: s.date,
            supplier: (s.supplier || 'LAINNYA').toUpperCase().trim(),
            type: 'Masuk',
            amount: parseFloat(s.amount) || 0,
            remaining: parseFloat(s.amount) || 0,
            description: s.description || '',
            isAuto: false,
            created_at: s.created_at || s.date
        }));

    masukBatches.sort((a, b) => new Date(a.date) - new Date(b.date) || (a.created_at > b.created_at ? 1 : -1));

    // 2. Separate Manual Keluar
    const manualKeluar = (data.solar || [])
        .filter(s => s.type === 'Keluar')
        .map(s => ({
            id: s.id,
            date: s.date,
            supplier: (s.supplier || 'LAINNYA').toUpperCase().trim(),
            type: 'Keluar',
            amount: parseFloat(s.amount) || 0,
            description: s.description || '',
            isAuto: false,
            created_at: s.created_at || s.date
        }));

    // 3. Extract daily automatic usage from transactions
    const dailyUsages = {};
    (data.transactions || []).forEach(tx => {
        if (!tx.expenseDetails) return;
        const date = tx.date;
        let txDetails = typeof tx.expenseDetails === 'string' ? JSON.parse(tx.expenseDetails) : tx.expenseDetails;
        if (!Array.isArray(txDetails)) return;

        txDetails.forEach(d => {
            const exp = expenseMap[d.expenseId];
            if (!exp) return;

            const isSolar = (exp.linkedSolarSupplier && exp.linkedSolarSupplier.trim()) ||
                            (exp.name && exp.name.toUpperCase().includes('SOLAR'));

            if (isSolar) {
                const qty = parseFloat(d.qty) || 0;
                if (qty > 0) {
                    if (!dailyUsages[date]) {
                        dailyUsages[date] = {
                            date: date,
                            qty: 0,
                            expNames: new Set()
                        };
                    }
                    dailyUsages[date].qty += qty;
                    if (exp.name) dailyUsages[date].expNames.add(exp.name);
                }
            }
        });
    });

    // 4. Sort usage dates chronologically (ascending)
    const sortedUsageDates = Object.keys(dailyUsages).sort((a, b) => new Date(a) - new Date(b));
    const autoKeluar = [];

    // 5. FIFO deduction across batches (regular supplier stock will NOT go negative)
    sortedUsageDates.forEach(date => {
        const usage = dailyUsages[date];
        let needed = usage.qty;
        const expNamesStr = Array.from(usage.expNames).join(', ');
        let rowSeq = 0;

        // FIFO: Deduct from available batches with date <= usage date
        for (let i = 0; i < masukBatches.length && needed > 0; i++) {
            const batch = masukBatches[i];
            if (batch.date <= date && batch.remaining > 0) {
                const take = Math.min(needed, batch.remaining);
                batch.remaining -= take;
                needed -= take;
                rowSeq++;

                const rowId = `auto-${date}-${batch.id || ('batch_' + i)}-${rowSeq}`;
                const supplier = (data.solarRowOverrides && data.solarRowOverrides[rowId])
                    ? data.solarRowOverrides[rowId]
                    : ((data.solarDateOverrides && data.solarDateOverrides[date])
                        ? data.solarDateOverrides[date]
                        : batch.supplier);

                autoKeluar.push({
                    id: rowId,
                    date: date,
                    type: 'Keluar',
                    supplier: supplier,
                    amount: take,
                    description: `PEMAKAIAN HARIAN (FIFO) [${expNamesStr}]`,
                    isAuto: true
                });
            }
        }

        // If needed > 0, check any remaining batches from other dates
        if (needed > 0) {
            for (let i = 0; i < masukBatches.length && needed > 0; i++) {
                if (masukBatches[i].remaining > 0) {
                    const take = Math.min(needed, masukBatches[i].remaining);
                    masukBatches[i].remaining -= take;
                    needed -= take;
                    rowSeq++;

                    const rowId = `auto-${date}-${masukBatches[i].id || ('batch_' + i)}-${rowSeq}`;
                    const supplier = (data.solarRowOverrides && data.solarRowOverrides[rowId])
                        ? data.solarRowOverrides[rowId]
                        : ((data.solarDateOverrides && data.solarDateOverrides[date])
                            ? data.solarDateOverrides[date]
                            : masukBatches[i].supplier);

                    autoKeluar.push({
                        id: rowId,
                        date: date,
                        type: 'Keluar',
                        supplier: supplier,
                        amount: take,
                        description: `PEMAKAIAN HARIAN (FIFO) [${expNamesStr}]`,
                        isAuto: true
                    });
                }
            }
        }

        // If still needed > 0 (Stock exhausted -> Stok tidak boleh minus, alihkan ke PERTAMINA DEX)
        if (needed > 0) {
            rowSeq++;
            const rowId = `auto-${date}-dex-${rowSeq}`;
            const supplier = (data.solarRowOverrides && data.solarRowOverrides[rowId])
                ? data.solarRowOverrides[rowId]
                : ((data.solarDateOverrides && data.solarDateOverrides[date])
                    ? data.solarDateOverrides[date]
                    : pertaminaDexSup);

            autoKeluar.push({
                id: rowId,
                date: date,
                type: 'Keluar',
                supplier: supplier,
                amount: needed,
                description: `PEMAKAIAN HARIAN (${pertaminaDexSup}) [${expNamesStr}]`,
                isAuto: true
            });
        }
    });

    return [
        ...masukBatches.map(b => ({
            id: b.id,
            date: b.date,
            supplier: b.supplier,
            type: 'Masuk',
            amount: b.amount,
            description: b.description,
            isAuto: false
        })),
        ...manualKeluar,
        ...autoKeluar
    ];
}

window.render_solar = () => {
    const data = getData();
    const tbody = document.getElementById('tbody-solar');
    if (!tbody) return;

    const startEl = document.getElementById('filter-solar-start');
    const endEl = document.getElementById('filter-solar-end');
    const startDate = startEl ? startEl.value : '';
    const endDate = endEl ? endEl.value : '';

    // 1. Get calculated FIFO solar records
    const solarRecords = getCalculatedSolarRecords(data);

    // 2. Update Filter Pemasok Dropdown (collect all suppliers before filtering)
    const allSuppliers = new Set();
    solarRecords.forEach(s => {
        const sup = (s.supplier || 'LAINNYA').toUpperCase().trim();
        allSuppliers.add(sup);
    });
    (data.solarSuppliers || []).forEach(s => {
        const name = typeof s === 'string' ? s : s.name;
        if (name && name.trim()) allSuppliers.add(name.trim().toUpperCase());
    });
    (data.expenseTypes || []).forEach(e => {
        if (e.linkedSolarSupplier && e.linkedSolarSupplier.trim()) {
            allSuppliers.add(e.linkedSolarSupplier.trim().toUpperCase());
        }
    });
    if (data.solarDateOverrides) {
        Object.values(data.solarDateOverrides).forEach(sup => {
            if (sup && sup.trim()) allSuppliers.add(sup.trim().toUpperCase());
        });
    }

    const filterSelect = document.getElementById('filter-solar-supplier');
    if (filterSelect) {
        const currentFilter = filterSelect.value;
        let optHtml = '<option value="">Semua Pemasok</option>';
        Array.from(allSuppliers).sort().forEach(sup => {
            optHtml += `<option value="${sup}" ${sup === currentFilter ? 'selected' : ''}>${sup}</option>`;
        });
        filterSelect.innerHTML = optHtml;
    }

    const activeSupplierFilter = filterSelect ? filterSelect.value : '';

    // Filter by Date Range and Supplier
    let filteredRecords = solarRecords.filter(s => {
        if (startDate && s.date < startDate) return false;
        if (endDate && s.date > endDate) return false;
        if (activeSupplierFilter && (s.supplier || 'LAINNYA').toUpperCase().trim() !== activeSupplierFilter) return false;
        return true;
    });

    // 5. Calculate stats per supplier & global on the filtered set
    const supplierStats = {}; // { [sup]: { masuk: 0, keluar: 0, sisa: 0 } }
    let totalMasukGlobal = 0;
    let totalKeluarGlobal = 0;

    filteredRecords.forEach(s => {
        const sup = (s.supplier || 'LAINNYA').toUpperCase().trim();
        if (!supplierStats[sup]) supplierStats[sup] = { masuk: 0, keluar: 0, sisa: 0 };
        if (s.type === 'Masuk') {
            supplierStats[sup].masuk += s.amount;
            totalMasukGlobal += s.amount;
        } else if (s.type === 'Keluar') {
            supplierStats[sup].keluar += s.amount;
            totalKeluarGlobal += s.amount;
        }
    });

    Object.keys(supplierStats).forEach(sup => {
        supplierStats[sup].sisa = supplierStats[sup].masuk - supplierStats[sup].keluar;
    });
    const saldoGlobal = totalMasukGlobal - totalKeluarGlobal;

    // 6. Sort for Display (descending by date)
    filteredRecords.sort((a, b) => new Date(b.date) - new Date(a.date));

    // 7. Render Table Rows
    if (filteredRecords.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted" style="padding:2rem;">Belum ada data solar pada rentang tanggal/filter yang dipilih</td></tr>';
    } else {
        const masterSuppliers = getAllSolarSuppliers(data);
        let html = '';
        filteredRecords.forEach(s => {
            const supName = (s.supplier || '-').toUpperCase();

            // Build options for this row's supplier dropdown
            const rowSuppliers = [...masterSuppliers];
            if (supName && supName !== '-' && !rowSuppliers.includes(supName)) {
                rowSuppliers.push(supName);
            }
            let rowSupplierOptions = '';
            rowSuppliers.forEach(sup => {
                const isSelected = (sup === supName) ? 'selected' : '';
                rowSupplierOptions += `<option value="${sup}" ${isSelected}>${sup}</option>`;
            });
            rowSupplierOptions += `<option value="__NEW__">+ Tambah Pemasok Baru...</option>`;

            html += `
                <tr style="${s.isAuto ? 'background: #f8fafc;' : ''}">
                    <td>${formatDate(s.date)}</td>
                    <td>
                        <select class="form-control select-table-supplier" 
                                style="padding: 0.25rem 0.5rem; font-size: 0.85rem; font-weight: 600; width: 100%; min-width: 135px; border-radius: 6px; cursor: pointer; color: #1e293b; background: white; border: 1px solid #cbd5e1;" 
                                data-prev-val="${supName}" 
                                onchange="handleTableSolarSupplierChange(this, '${s.id}', ${s.isAuto ? 'true' : 'false'}, '${s.date}')">
                            ${rowSupplierOptions}
                        </select>
                    </td>
                    <td>
                        <span class="badge" style="background: ${s.type === 'Masuk' ? '#dcfce7' : '#fee2e2'}; color: ${s.type === 'Masuk' ? '#166534' : '#991b1b'};">
                            ${s.type} ${s.isAuto ? '(Otomatis)' : ''}
                        </span>
                    </td>
                    <td style="font-weight: bold; color: ${s.type === 'Masuk' ? '#166534' : '#991b1b'};">
                        ${s.type === 'Masuk' ? '+' : '-'} ${s.amount.toLocaleString('id-ID')} Liter
                    </td>
                    <td style="font-size: 0.85rem; color: #64748b;">${s.description || '-'}</td>
                    <td style="text-align: center;">
                        ${s.isAuto ? '<span style="color:#94a3b8; font-size:0.75rem;">(Otomatis)</span>' : `
                        <div class="d-flex justify-center" style="gap:0.25rem;">
                            <button class="btn-icon" style="color:var(--primary-color)" onclick="editSolar('${s.id}')"><span class="material-symbols-outlined" style="font-size:18px">edit</span></button>
                            <button class="btn-icon" style="color:var(--danger)" onclick="deleteSolar('${s.id}')"><span class="material-symbols-outlined" style="font-size:18px">delete</span></button>
                        </div>
                        `}
                    </td>
                </tr>
            `;
        });
        tbody.innerHTML = html;
    }

    // 8. Render Summary Cards
    let summaryDiv = document.getElementById('solar-summary-cards');
    if (!summaryDiv) {
        summaryDiv = document.createElement('div');
        summaryDiv.id = 'solar-summary-cards';
        summaryDiv.style.display = 'flex';
        summaryDiv.style.gap = '1rem';
        summaryDiv.style.marginBottom = '1.5rem';
        summaryDiv.style.flexWrap = 'wrap';
        
        const cardBody = document.querySelector('#solar .card-body');
        if (cardBody) {
            cardBody.insertBefore(summaryDiv, cardBody.firstChild);
        }
    }

    let summaryHtml = `
        <div style="flex: 1; min-width: 180px; background: white; padding: 1rem 1.25rem; border-radius: var(--radius-lg); border: 1px solid var(--border-color); border-left: 4px solid var(--primary-color); box-shadow: var(--shadow-sm);">
            <div style="font-size: 0.75rem; font-weight: 600; color: #64748b; text-transform: uppercase; margin-bottom: 0.25rem;">Total Solar Masuk</div>
            <div style="font-size: 1.25rem; font-weight: 700; color: #1e293b;">${totalMasukGlobal.toLocaleString('id-ID')} Liter</div>
        </div>
        <div style="flex: 1; min-width: 180px; background: white; padding: 1rem 1.25rem; border-radius: var(--radius-lg); border: 1px solid var(--border-color); border-left: 4px solid var(--danger); box-shadow: var(--shadow-sm);">
            <div style="font-size: 0.75rem; font-weight: 600; color: #64748b; text-transform: uppercase; margin-bottom: 0.25rem;">Total Pemakaian</div>
            <div style="font-size: 1.25rem; font-weight: 700; color: var(--danger);">- ${totalKeluarGlobal.toLocaleString('id-ID')} Liter</div>
        </div>
        <div style="flex: 1; min-width: 180px; background: white; padding: 1rem 1.25rem; border-radius: var(--radius-lg); border: 1px solid var(--border-color); border-left: 4px solid ${saldoGlobal >= 0 ? '#10b981' : '#ef4444'}; box-shadow: var(--shadow-sm);">
            <div style="font-size: 0.75rem; font-weight: 600; color: #64748b; text-transform: uppercase; margin-bottom: 0.25rem;">Total Sisa Saldo</div>
            <div style="font-size: 1.25rem; font-weight: 700; color: ${saldoGlobal >= 0 ? '#10b981' : '#ef4444'};">${saldoGlobal.toLocaleString('id-ID')} Liter</div>
        </div>
    `;

    // Per-supplier stock cards
    Object.keys(supplierStats).sort().forEach(sup => {
        const st = supplierStats[sup];
        summaryHtml += `
        <div style="flex: 1; min-width: 180px; background: linear-gradient(135deg, #1e1b4b 0%, #312e81 100%); padding: 1rem 1.25rem; border-radius: var(--radius-lg); color: white; box-shadow: var(--shadow-md);">
            <div style="font-size: 0.75rem; font-weight: 600; color: #c7d2fe; text-transform: uppercase; margin-bottom: 0.25rem;">Stok: ${sup}</div>
            <div style="font-size: 1.25rem; font-weight: 700; color: ${st.sisa >= 0 ? '#38bdf8' : '#f87171'};">${st.sisa.toLocaleString('id-ID')} Liter</div>
            <div style="font-size: 0.7rem; color: #94a3b8; margin-top: 0.25rem;">Masuk: ${st.masuk.toLocaleString('id-ID')}L | Pakai: ${st.keluar.toLocaleString('id-ID')}L</div>
        </div>`;
    });

    if (summaryDiv) {
        summaryDiv.innerHTML = summaryHtml;
    }
};

window.render_potongan = () => {
    const data = getData();
    const start = document.getElementById('filter-potongan-start').value;
    const end = document.getElementById('filter-potongan-end').value;
    const typeId = document.getElementById('filter-setoran-type')?.value;

    // Populate Type Filter if empty
    const sType = document.getElementById('filter-setoran-type');
    if (sType && sType.options.length <= 1) {
        const sortedTypes = [...data.expenseTypes].sort((a, b) => (a.order || 0) - (b.order || 0));
    sortedTypes.forEach(e => {
            const opt = document.createElement('option');
            opt.value = e.id;
            opt.textContent = e.name;
            sType.appendChild(opt);
        });
    }

    render_setoran_summary(data, start, end);
    render_setoran_table(data, start, end, typeId);
    render_potongan_table(data, start, end);
};

window.render_setoran_summary = (data, start, end) => {
    const container = document.getElementById('setoran-summary-content');
    if (!container) return;

    // Aggregation (Same logic as generateLaporan)
    let totalHargaBatu = 0;
    const filteredTx = data.transactions.filter(t => t.date >= start && t.date <= end);
    filteredTx.forEach(tx => {
        (tx.sales || []).forEach(s => {
            totalHargaBatu += (s.hargaBatu || (s.unitPrice * (s.qty || 0)) || 0);
        });
    });

    const setoranLainnya = {};
    const filteredSettlements = (data.settlements || []).filter(s => s.date >= start && s.date <= end);
    filteredSettlements.forEach(s => {
        const expType = data.expenseTypes.find(e => e.id === s.expenseTypeId);
        const name = expType ? expType.name : 'Umum';
        setoranLainnya[name] = (setoranLainnya[name] || 0) + (parseInt(s.amount) || 0);
    });

    let html = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem;">
            <div style="background: white; padding: 1rem; border-radius: 0.5rem; border: 1px solid #e2e8f0; border-left: 4px solid #10b981;">
                <div style="font-size: 0.75rem; font-weight: 600; color: #64748b; margin-bottom: 0.25rem;">TOTAL HARGA BATU</div>
                <div style="font-size: 1.125rem; font-weight: 700; color: #1e293b;">${formatCurrency(totalHargaBatu)}</div>
            </div>
    `;

    Object.keys(setoranLainnya).forEach(name => {
        html += `
            <div style="background: white; padding: 1rem; border-radius: 0.5rem; border: 1px solid #e2e8f0; border-left: 4px solid var(--secondary-color);">
                <div style="font-size: 0.75rem; font-weight: 600; color: #64748b; margin-bottom: 0.25rem;">TOTAL ${name.toUpperCase()}</div>
                <div style="font-size: 1.125rem; font-weight: 700; color: #1e293b;">${formatCurrency(setoranLainnya[name])}</div>
            </div>
        `;
    });

    const totalSetoran = totalHargaBatu + Object.values(setoranLainnya).reduce((a, b) => a + b, 0);
    html += `
            <div style="background: var(--secondary-color); padding: 1rem; border-radius: 0.5rem; border: 1px solid rgba(0,0,0,0.1); color: white;">
                <div style="font-size: 0.75rem; font-weight: 600; opacity: 0.9; margin-bottom: 0.25rem;">TOTAL KESELURUHAN</div>
                <div style="font-size: 1.125rem; font-weight: 700;">${formatCurrency(totalSetoran)}</div>
            </div>
        </div>
    `;

    container.innerHTML = html;
};

window.render_setoran_table = (data, start, end, typeId = '') => {
    const tbody = document.getElementById('tbody-setoran');
    if (!tbody) return;

    let filtered = (data.settlements || []);
    if (typeId) {
        filtered = filtered.filter(s => s.expenseTypeId === typeId);
    }

    // Deduplicate by expenseTypeId
    const uniqueTypes = [];
    const seen = new Set();
    filtered.forEach(s => {
        if (!seen.has(s.expenseTypeId)) {
            uniqueTypes.push(s);
            seen.add(s.expenseTypeId);
        }
    });

    tbody.innerHTML = uniqueTypes.length === 0 ? '<tr><td colspan="2" class="text-center">Belum ada jenis setoran terdaftar</td></tr>' :
        uniqueTypes.map(s => {
            const expType = data.expenseTypes.find(e => e.id === s.expenseTypeId);
            return `
                <tr>
                    <td><input type="checkbox" class="check-setoran" data-id="${s.id}"></td>
                    <td><span class="badge" style="background:#f0f9ff; color:#0369a1; border:1px solid #bae6fd">${expType ? expType.name : 'Umum'}</span></td>
                    <td>
                        <button class="btn-icon text-danger" onclick="deleteSetoran('${s.id}')" title="Hapus"><span class="material-symbols-outlined">delete</span></button>
                    </td>
                </tr>
            `;
        }).join('');
};

window.render_potongan_table = (data, start, end) => {
    const tbody = document.getElementById('tbody-potongan');
    if (!tbody) return;

    let filtered = (data.deductions || []);
    if (start && end) {
        filtered = filtered.filter(p => {
            const pStart = p.dateStart || p.date;
            const pEnd = p.dateEnd || p.date;
            return pStart <= end && pEnd >= start;
        });
    }
    filtered.sort((a, b) => new Date(b.dateStart || b.date) - new Date(a.dateStart || a.date));

    tbody.innerHTML = filtered.length === 0 ? '<tr><td colspan="5" class="text-center">Tidak ada data potongan</td></tr>' :
        filtered.map(p => {
            const buyer = data.buyers.find(b => b.id === p.buyerId);
            const dateStr = p.dateStart && p.dateEnd ? `${formatDate(p.dateStart)} - ${formatDate(p.dateEnd)}` : formatDate(p.date);
            return `
                <tr>
                    <td><input type="checkbox" class="check-potongan" data-id="${p.id}"></td>
                    <td>${dateStr}</td>
                    <td><span class="badge" style="background:${p.jenis === 'Kasbon' ? '#fff7ed' : '#f0f9ff'}; color:${p.jenis === 'Kasbon' ? '#9a3412' : '#0369a1'}; border:1px solid ${p.jenis === 'Kasbon' ? '#fed7aa' : '#bae6fd'}">${p.jenis || 'Potongan Penjualan'}</span></td>
                    <td>${buyer ? `<strong>${buyer.name}</strong><br>` : ''}${p.description}</td>
                    <td style="font-weight:600; color:#b91c1c">${formatCurrency(p.amount)}</td>
                    <td>
                        <button class="btn-icon text-danger" onclick="deletePotongan('${p.id}')">
                            <span class="material-symbols-outlined">delete</span>
                        </button>
                    </td>
                </tr>
            `;
        }).join('');
};

// ==========================================
// CRUD OPERATIONS
// ==========================================

// Global variable for current editing ID
let currentEditId = null;

// --- Pembeli ---
document.getElementById('btn-add-pembeli').addEventListener('click', () => {
    currentEditId = null;
    const formHtml = `
        <form id="form-pembeli" autocomplete="off">
            <div class="form-group">
                <label>Nama Pembeli</label>
                <input type="text" id="pembeli-name" class="form-control" required>
            </div>
            <div class="form-group">
                <label>Kategori</label>
                <select id="pembeli-category" class="form-control" required>
                    <option value="Umum">Umum</option>
                    <option value="Proyek">Proyek</option>
                </select>
            </div>
            <div class="form-group">
                <label>Alamat</label>
                <input type="text" id="pembeli-address" class="form-control" required>
            </div>
            <div class="form-group">
                <label>Satuan</label>
                <select id="pembeli-unit" class="form-control" required>
                    <option value="Ton">Ton</option>
                    <option value="Retase">Retase</option>
                    <option value="M3">M3</option>
                </select>
            </div>
            <div class="form-group">
                <label>Harga Satuan (Rp)</label>
                <input type="number" id="pembeli-price" class="form-control" required>
            </div>
            <div class="form-actions">
                <button type="button" class="btn" onclick="closeModal()">Batal</button>
                <button type="submit" class="btn btn-primary">Simpan</button>
            </div>
        </form>
    `;
    openModal('Tambah Pembeli', formHtml);

    document.getElementById('form-pembeli').addEventListener('submit', (e) => {
        e.preventDefault();
        savePembeli();
    });
});

window.editPembeli = (id) => {
    currentEditId = id;
    const data = getData();
    const buyer = data.buyers.find(b => b.id === id);
    if (!buyer) return;

    const formHtml = `
        <form id="form-pembeli" autocomplete="off">
            <div class="form-group">
                <label>Nama Pembeli</label>
                <input type="text" id="pembeli-name" class="form-control" value="${buyer.name}" required>
            </div>
            <div class="form-group">
                <label>Kategori</label>
                <select id="pembeli-category" class="form-control" required>
                    <option value="Umum" ${buyer.category !== 'Proyek' ? 'selected' : ''}>Umum</option>
                    <option value="Proyek" ${buyer.category === 'Proyek' ? 'selected' : ''}>Proyek</option>
                </select>
            </div>
            <div class="form-group">
                <label>Alamat</label>
                <input type="text" id="pembeli-address" class="form-control" value="${buyer.address}" required>
            </div>
            <div class="form-group">
                <label>Satuan</label>
                <select id="pembeli-unit" class="form-control" required>
                    <option value="Ton" ${buyer.unit === 'Ton' ? 'selected' : ''}>Ton</option>
                    <option value="Retase" ${buyer.unit === 'Retase' ? 'selected' : ''}>Retase</option>
                    <option value="M3" ${buyer.unit === 'M3' ? 'selected' : ''}>M3</option>
                </select>
            </div>
            <div class="form-group">
                <label>Harga Satuan (Rp)</label>
                <input type="number" id="pembeli-price" class="form-control" value="${buyer.unitPrice}" required>
            </div>
            <div class="form-actions">
                <button type="button" class="btn" onclick="closeModal()">Batal</button>
                <button type="submit" class="btn btn-primary">Simpan Perubahan</button>
            </div>
        </form>
    `;
    openModal('Edit Pembeli', formHtml);

    document.getElementById('form-pembeli').addEventListener('submit', (e) => {
        e.preventDefault();
        savePembeli();
    });
};

function savePembeli() {
    const name = document.getElementById('pembeli-name').value;
    const category = document.getElementById('pembeli-category').value;
    const address = document.getElementById('pembeli-address').value;
    const unit = document.getElementById('pembeli-unit').value;
    const unitPrice = parseFloat(document.getElementById('pembeli-price').value);

    const data = getData();
    let item;
    const expTypes = data.expenseTypes;
    let oldLinkedBuyerId = null;
    if (currentEditId) {
        const oldExp = expTypes.find(e => e.id === currentEditId);
        if (oldExp) oldLinkedBuyerId = oldExp.linkedBuyerId || null;
    }

    if (currentEditId) {
        const index = data.buyers.findIndex(b => b.id === currentEditId);
        if (index > -1) {
            data.buyers[index] = { ...data.buyers[index], name, category, address, unit, unitPrice };
            item = data.buyers[index];
        }
    } else {
        item = { id: generateId(), name, category, address, unit, unitPrice };
        data.buyers.push(item);
    }

    
    // Mapping for Turso (lowercase columns)
    const supabaseItem = {
        id: item.id,
        name: item.name,
        category: item.category,
        address: item.address,
        unit: item.unit,
        unitprice: item.unitPrice
    };

    saveData(data, 'buyers', supabaseItem);
    closeModal();
    render_pembeli();
}

window.deletePembeli = (id) => {
    if (confirm('Apakah Anda yakin ingin menghapus pembeli ini?')) {
        const data = getData();
        data.buyers = data.buyers.filter(b => b.id !== id);
        saveData(data);
        deleteFromDatabase('buyers', id);
        render_pembeli();
    }
};


window.deletePengeluaran = (id) => {
    if (confirm('Apakah Anda yakin ingin menghapus jenis pengeluaran ini?')) {
        const data = getData();
        data.expenseTypes = data.expenseTypes.filter(e => e.id !== id);
        saveData(data);
        deleteFromDatabase('expense_types', id);
        render_pengeluaran();
    }
};



// --- Sopir ---
document.getElementById('btn-add-sopir').addEventListener('click', () => {
    currentEditId = null;
    const formHtml = `
        <form id="form-sopir" autocomplete="off">
            <div class="form-group">
                <label>Nama Sopir</label>
                <input type="text" id="sopir-name" class="form-control" required>
            </div>
            <div class="form-group">
                <label>No. Polisi Kendaraan</label>
                <input type="text" id="sopir-vehicle" class="form-control" required placeholder="Contoh: BE 1234 ABC">
            </div>
            <div class="form-group">
                <label>No. WhatsApp / HP</label>
                <input type="text" id="sopir-phone" class="form-control" required>
            </div>
            <div class="form-actions">
                <button type="button" class="btn" onclick="closeModal()">Batal</button>
                <button type="submit" class="btn btn-primary">Simpan</button>
            </div>
        </form>
    `;
    openModal('Tambah Sopir', formHtml);

    document.getElementById('form-sopir').addEventListener('submit', (e) => {
        e.preventDefault();
        saveSopir();
    });
});

window.editSopir = (id) => {
    currentEditId = id;
    const data = getData();
    const driver = data.drivers.find(d => d.id === id);
    if (!driver) return;

    const formHtml = `
        <form id="form-sopir" autocomplete="off">
            <div class="form-group">
                <label>Nama Sopir</label>
                <input type="text" id="sopir-name" class="form-control" value="${driver.name}" required>
            </div>
            <div class="form-group">
                <label>No. Polisi Kendaraan</label>
                <input type="text" id="sopir-vehicle" class="form-control" value="${driver.vehicleNumber}" required>
            </div>
            <div class="form-group">
                <label>No. WhatsApp / HP</label>
                <input type="text" id="sopir-phone" class="form-control" value="${driver.phone}" required>
            </div>
            <div class="form-actions">
                <button type="button" class="btn" onclick="closeModal()">Batal</button>
                <button type="submit" class="btn btn-primary">Simpan Perubahan</button>
            </div>
        </form>
    `;
    openModal('Edit Sopir', formHtml);

    document.getElementById('form-sopir').addEventListener('submit', (e) => {
        e.preventDefault();
        saveSopir();
    });
};

function saveSopir() {
    const name = document.getElementById('sopir-name').value;
    const vehicleNumber = document.getElementById('sopir-vehicle').value;
    const phone = document.getElementById('sopir-phone').value;

    const data = getData();
    let item;
    const expTypes = data.expenseTypes;
    let oldLinkedBuyerId = null;
    if (currentEditId) {
        const oldExp = expTypes.find(e => e.id === currentEditId);
        if (oldExp) oldLinkedBuyerId = oldExp.linkedBuyerId || null;
    }

    if (currentEditId) {
        const index = data.drivers.findIndex(d => d.id === currentEditId);
        if (index > -1) {
            data.drivers[index] = { ...data.drivers[index], name, vehicleNumber, phone };
            item = data.drivers[index];
        }
    } else {
        item = { id: generateId(), name, vehicleNumber, phone };
        data.drivers.push(item);
    }

    const supabaseItem = {
        id: item.id,
        name: item.name,
        vehiclenumber: item.vehicleNumber,
        phone: item.phone
    };

    saveData(data, 'drivers', supabaseItem);
    closeModal();
    render_sopir();
}

window.deleteSopir = (id) => {
    if (confirm('Hapus data sopir ini?')) {
        const data = getData();
        data.drivers = data.drivers.filter(d => d.id !== id);
        saveData(data);
        deleteFromDatabase('drivers', id);
        render_sopir();
    }
};


// --- Pengeluaran ---
document.getElementById('btn-add-pengeluaran').addEventListener('click', () => {
    currentEditId = null;
    const data = getData();
    let maxOrder = 0;
    if (data.expenseTypes && data.expenseTypes.length > 0) {
        maxOrder = Math.max(...data.expenseTypes.map(e => parseInt(e.order) || 0));
    }
    const nextOrder = maxOrder + 1;
    const formHtml = `
        <form id="form-pengeluaran" autocomplete="off">
            <div class="form-group">
                <label>Nama Pengeluaran</label>
                <input type="text" id="pengeluaran-name" class="form-control" oninput="this.value = this.value.toUpperCase()" required>
            </div>
            <div class="form-group">
                <label>Kategori</label>
                <select id="pengeluaran-category" class="form-control" required>
                    <option value="Operasional">Operasional</option>
                    <option value="Retribusi">Retribusi</option>
                </select>
            </div>
            
            
            <div class="form-group">
                <label>Sifat Pengeluaran</label>
                <select id="pengeluaran-nature" class="form-control" required>
                    <option value="Pasti">Pasti (Tetap)</option>
                    <option value="Tidak Pasti">Tidak Pasti (Opsional)</option>
                </select>
            </div>
            <div class="form-group">
                <label>Satuan (Misal: Ritase, Liter, Orang, dll)</label>
                <input type="text" id="pengeluaran-unit" class="form-control" oninput="this.value = this.value.toUpperCase()" required>
            </div>
            <div class="form-group">
                <label>Harga Satuan / Patokan Harga (Rp)</label>
                <input type="number" id="pengeluaran-price" class="form-control" required value="0">
            </div>
            <div class="form-group">
                <label>No Urut (Tampilan di Form Penjualan)</label>
                <input type="number" id="pengeluaran-order" class="form-control" value="${nextOrder}">
            </div>
            <div class="form-actions">
                <button type="button" class="btn" onclick="closeModal()">Batal</button>
                <button type="submit" class="btn btn-primary">Simpan</button>
            </div>
        </form>
    `;
    openModal('Tambah Jenis Pengeluaran', formHtml);

    document.getElementById('form-pengeluaran').addEventListener('submit', (e) => {
        e.preventDefault();
        savePengeluaran();
    });
});

window.editPengeluaran = (id) => {
    currentEditId = id;
    const data = getData();
    const exp = data.expenseTypes.find(e => e.id === id);
    if (!exp) return;

    const formHtml = `
        <form id="form-pengeluaran" autocomplete="off">
            
            <div class="form-group">
                <label>Nama Pengeluaran</label>
                <input type="text" id="pengeluaran-name" class="form-control" value="${exp.name}" oninput="this.value = this.value.toUpperCase()" required>
            </div>
            <div class="form-group">
                <label>Kategori</label>
                <select id="pengeluaran-category" class="form-control" required>
                    <option value="Operasional" ${exp.category === 'Operasional' ? 'selected' : ''}>Operasional</option>
                    <option value="Retribusi"  ${exp.category === 'Retribusi' ? 'selected' : ''}>Retribusi</option>
                </select>
            </div>
            <div class="form-group">
                <label>Sifat Pengeluaran</label>
                <select id="pengeluaran-nature" class="form-control" required>
                    <option value="Pasti" ${exp.nature === 'Pasti' ? 'selected' : ''}>Pasti (Tetap)</option>
                    <option value="Tidak Pasti" ${exp.nature === 'Tidak Pasti' ? 'selected' : ''}>Tidak Pasti (Opsional)</option>
                </select>
            </div>
            <div class="form-group">
                <label>Satuan (Misal: Ritase, Liter, Orang, dll)</label>
                <input type="text" id="pengeluaran-unit" class="form-control" value="${exp.unit || ''}" oninput="this.value = this.value.toUpperCase()" required>
            </div>
            <div class="form-group">
                <label>Harga Satuan / Patokan Harga (Rp)</label>
                <input type="number" id="pengeluaran-price" class="form-control" value="${exp.basePrice || 0}" required>
            </div>
            <div class="form-group">
                <label>No Urut (Tampilan di Form Penjualan)</label>
                <input type="number" id="pengeluaran-order" class="form-control" value="${exp.order || 0}">
            </div>
            <div class="form-actions">
                <button type="button" class="btn" onclick="closeModal()">Batal</button>
                <button type="submit" class="btn btn-primary">Simpan Perubahan</button>
            </div>
        </form>
    `;
    openModal('Edit Jenis Pengeluaran', formHtml);

    document.getElementById('form-pengeluaran').addEventListener('submit', (e) => {
        e.preventDefault();
        savePengeluaran();
    });
};

function savePengeluaran() {
    const name = document.getElementById('pengeluaran-name').value.toUpperCase();
    const category = document.getElementById('pengeluaran-category').value;
    const nature = document.getElementById('pengeluaran-nature').value;
    const unit = document.getElementById('pengeluaran-unit').value.toUpperCase();
    const basePrice = parseFloat(document.getElementById('pengeluaran-price').value) || 0;
    const order = parseInt(document.getElementById('pengeluaran-order').value) || 0;

    const data = getData();
    let item;
    const expTypes = data.expenseTypes;
    let oldLinkedBuyerId = null;
    let oldLinkedSolarSupplier = null;
    if (currentEditId) {
        const oldExp = expTypes.find(e => e.id === currentEditId);
        if (oldExp) {
            oldLinkedBuyerId = oldExp.linkedBuyerId || null;
            oldLinkedSolarSupplier = oldExp.linkedSolarSupplier || null;
        }
    }

    if (currentEditId) {
        const index = data.expenseTypes.findIndex(e => e.id === currentEditId);
        if (index > -1) {
            data.expenseTypes[index] = { ...data.expenseTypes[index], name, category, nature, unit, basePrice, order, linkedBuyerId: oldLinkedBuyerId, linkedSolarSupplier: oldLinkedSolarSupplier };
            item = data.expenseTypes[index];
        }
    } else {
        item = { id: generateId(), name, category, nature, unit, basePrice, order, linkedBuyerId: null, linkedSolarSupplier: null };
        data.expenseTypes.push(item);
    }

    const supabaseItem = {
        id: item.id,
        name: item.name,
        category: item.category,
        nature: item.nature,
        unit: item.unit,
        baseprice: item.basePrice,
        sort_order: item.order,
        linked_buyer_id: item.linkedBuyerId,
        linked_solar_supplier: item.linkedSolarSupplier
    };

    saveData(data, 'expense_types', supabaseItem);
    closeModal();
    render_pengeluaran();
}


// --- Potongan ---
let bulkPotRows = [];

document.getElementById('btn-add-setoran')?.addEventListener('click', () => addSetoran());
document.getElementById('btn-add-setoran-2')?.addEventListener('click', () => addSetoran());

document.getElementById('btn-add-potongan').addEventListener('click', () => {
    const pageStart = document.getElementById('filter-potongan-start').value;
    const pageEnd = document.getElementById('filter-potongan-end').value;

    bulkPotRows = []; // Start empty
    openBulkPotonganModal(pageStart, pageEnd);
});

function openBulkPotonganModal(start, end) {
    const data = getData();

    // Calculate potential sales for the dropdown
    const salesSummary = {};
    data.transactions
        .filter(t => t.date >= start && t.date <= end)
        .forEach(t => {
            if (t.sales) {
                t.sales.forEach(s => {
                    if (!salesSummary[s.buyerId]) salesSummary[s.buyerId] = 0;
                    salesSummary[s.buyerId] += s.total;
                });
            } else if (t.buyerId) {
                if (!salesSummary[t.buyerId]) salesSummary[t.buyerId] = 0;
                salesSummary[t.buyerId] += t.totalAmount;
            }
        });

    const salesOptions = Object.keys(salesSummary).map(bid => {
        const b = data.buyers.find(x => x.id === bid);
        return `<option value="${bid}" data-amount="${salesSummary[bid]}">${b ? b.name : 'Unknown'} - ${formatCurrency(salesSummary[bid])}</option>`;
    }).join('');

    const formHtml = `
        <div id="bulk-potongan-container">
            <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:1rem; margin-bottom: 1.5rem; background:#f8fafc; padding:1rem; border-radius:0.5rem; border:1px solid #e2e8f0;">
                <div class="form-group" style="margin:0">
                    <label style="font-size:0.75rem; font-weight:600">Tanggal Potongan</label>
                    <input type="date" id="bulk-potongan-date" class="form-control" value="${new Date().toISOString().split('T')[0]}">
                </div>
                <div class="form-group" style="margin:0">
                    <label style="font-size:0.75rem; font-weight:600">Dari Tanggal (Penjualan)</label>
                    <input type="date" id="bulk-date-start" class="form-control" value="${start}" onchange="refreshBulkModal()">
                </div>
                <div class="form-group" style="margin:0">
                    <label style="font-size:0.75rem; font-weight:600">Sampai Tanggal (Penjualan)</label>
                    <input type="date" id="bulk-date-end" class="form-control" value="${end}" onchange="refreshBulkModal()">
                </div>
            </div>

            <div style="margin-bottom: 1.5rem; padding: 1rem; border: 1px dashed #34d399; border-radius: 0.5rem; background: #ecfdf5;">
                <label style="display: block; font-size: 0.75rem; font-weight: 600; color: #065f46; margin-bottom: 0.5rem;">Cepat: Ambil dari Penjualan Periode Ini</label>
                <div style="display: flex; gap: 0.5rem;">
                    <select id="bulk-lookup-select" class="form-control" style="flex: 1;">
                        <option value="">-- Pilih Penjualan --</option>
                        ${salesOptions}
                    </select>
                    <button type="button" class="btn" style="background:#10b981; color:white; padding:0.5rem 1rem;" onclick="addBulkRowFromLookup()">Tambah</button>
                </div>
            </div>

            <div id="bulk-rows-list">
                ${bulkPotRows.length === 0 ? '<p class="text-center text-muted" style="padding:1rem;">Belum ada baris potongan. Gunakan dropdown di atas atau klik Tambah Manual.</p>' : ''}
                ${bulkPotRows.map(row => `
                    <div class="bulk-row" data-id="${row.id}" style="display: flex; gap: 0.75rem; align-items: center; margin-bottom: 0.75rem; background: #f0f9ff; padding: 0.75rem; border-radius: 0.5rem; border: 1px solid #e0f2fe;">
                        <div style="flex: 2;">
                            <label style="display: block; font-size: 0.7rem; margin-bottom: 2px; color: #0c4a6e;">Pembeli</label>
                            <select class="form-control form-control-sm" onchange="updateBulkRow('${row.id}', 'buyerId', this.value)">
                                <option value="">-- Manual --</option>
                                ${data.buyers.map(b => `<option value="${b.id}" ${row.buyerId === b.id ? 'selected' : ''}>${b.name}</option>`).join('')}
                            </select>
                        </div>
                        <div style="flex: 2;">
                            <label style="display: block; font-size: 0.7rem; margin-bottom: 2px; color: #0c4a6e;">Deskripsi</label>
                            <input type="text" class="form-control form-control-sm" value="${row.description || ''}" placeholder="Keterangan..." oninput="updateBulkRow('${row.id}', 'description', this.value)">
                        </div>
                        <div style="flex: 1.5;">
                            <label style="display: block; font-size: 0.7rem; margin-bottom: 2px; color: #0c4a6e;">Jumlah (Rp)</label>
                            <input type="number" class="form-control form-control-sm" value="${row.amount || ''}" oninput="updateBulkRow('${row.id}', 'amount', this.value)">
                        </div>
                        <button type="button" class="btn-icon" style="color: #f43f5e; margin-top: 1rem;" onclick="removeBulkRow('${row.id}')">
                            <span class="material-symbols-outlined" style="font-size:1.2rem">delete</span>
                        </button>
                    </div>
                `).join('')}
            </div>
            
            <button type="button" class="btn" style="background: white; border: 1px solid #e2e8f0; border-radius: 0.5rem; padding: 0.4rem 0.8rem; display: flex; align-items: center; gap: 0.4rem; margin: 1rem 0; font-size:0.85rem;" onclick="addBulkRowManual()">
                <span class="material-symbols-outlined" style="font-size: 1.1rem; color: var(--primary-color);">add_circle</span>
                Tambah Baris Manual
            </button>

            <div class="form-actions" style="margin-top: 1.5rem; border-top: 1px solid #e2e8f0; padding-top: 1rem;">
                <button type="button" class="btn" onclick="closeModal()">Batal</button>
                <button type="button" class="btn btn-primary" onclick="saveBulkPotongan()">Simpan Semua</button>
            </div>
        </div>
    `;

    openModal('Tambah Potongan', formHtml);
}

window.refreshBulkModal = () => {
    const s = document.getElementById('bulk-date-start').value;
    const e = document.getElementById('bulk-date-end').value;
    openBulkPotonganModal(s, e);
};

window.addBulkRowFromLookup = () => {
    const select = document.getElementById('bulk-lookup-select');
    if (!select.value) return;

    const amount = parseFloat(select.options[select.selectedIndex].dataset.amount) || 0;
    const bid = select.value;
    const bName = select.options[select.selectedIndex].text.split(' - ')[0];

    bulkPotRows.push({
        id: generateId(),
        buyerId: bid,
        amount: amount,
        description: `Potongan Penjualan ${bName}`
    });

    window.refreshBulkModal();
};

window.addBulkRowManual = () => {
    bulkPotRows.push({ id: generateId(), buyerId: '', amount: 0, description: '' });
    window.refreshBulkModal();
};

window.updateBulkRow = (id, field, value) => {
    const row = bulkPotRows.find(r => r.id === id);
    if (row) {
        if (field === 'amount') row.amount = parseFloat(value) || 0;
        else row[field] = value;
    }
};

window.removeBulkRow = (id) => {
    bulkPotRows = bulkPotRows.filter(r => r.id !== id);
    window.refreshBulkModal();
};

async function saveBulkPotongan() {
    const data = getData();
    const start = document.getElementById('bulk-date-start').value;
    const end = document.getElementById('bulk-date-end').value;

    if (!data.deductions) data.deductions = [];

    let added = 0;
    bulkPotRows.forEach(row => {
        if (row.amount > 0) {
            data.deductions.push({
                id: generateId(),
                jenis: 'Potongan Penjualan',
                buyerId: row.buyerId,
                date: document.getElementById("bulk-potongan-date").value, dateStart: start, dateEnd: end,
                description: row.description || `Potongan ${start}-${end}`,
                amount: row.amount
            });
            added++;
        }
    });

    if (added === 0) {
        alert('Tidak ada jumlah potongan yang diisi.');
        return;
    }

    saveData(data); // Full local sync

    // Sync potongan via API
    try {
        if (added > 0) {
            const rowsToSync = data.deductions.slice(-added);
            for (const row of rowsToSync) {
                const supabaseItem = {
                    id: row.id,
                    jenis: row.jenis,
                    buyerid: row.buyerId,
                    date: row.date || row.dateStart,
                    datestart: row.dateStart,
                    dateend: row.dateEnd,
                    description: row.description,
                    amount: row.amount
                };
                await fetch('/api/sync', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ table: 'deductions', item: supabaseItem })
                });
            }
            console.log(`✅ Berhasil sinkron ${added} potongan ke Turso`);
        }
    } catch(e) {
        console.error('Gagal sinkron potongan:', e);
        alert(`Gagal menyimpan ke database cloud: ${e.message}. Perubahan mungkin hilang saat refresh.`);
    }

    closeModal();
    render_potongan();
    alert(`Berhasil menyimpan ${added} data potongan.`);
}

window.openAddPotonganForBuyer = (buyerId, date) => {
    currentEditId = null;
    const data = getData();
    const buyerOptions = data.buyers.map(b => `<option value="${b.id}" ${b.id === buyerId ? 'selected' : ''}>${b.name}</option>`).join('');

    const formHtml = `
        <form id="form-potongan" autocomplete="off">
            <div class="form-group">
                <label>Jenis Potongan</label>
                <select id="potongan-jenis" class="form-control" required>
                    <option value="Potongan Penjualan" selected>Potongan Penjualan</option>
                    <option value="Kasbon">Kasbon</option>
                    <option value="Denda">Denda</option>
                    <option value="Lainnya">Lainnya</option>
                </select>
            </div>
            <div class="form-group">
                <label>Pilih Pembeli</label>
                <select id="potongan-buyer-id" class="form-control">
                    <option value="">-- Tidak Terkait Pembeli Spesifik --</option>
                    ${buyerOptions}
                </select>
            </div>
            <div class="form-group">
                <label>Keterangan</label>
                <input type="text" id="potongan-desc" class="form-control" value="Potongan Penjualan tgl ${formatDate(date)}" required>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem">
                <div class="form-group">
                    <label>Dari Tanggal</label>
                    <input type="date" id="potongan-date-start" class="form-control" value="${date}" required>
                </div>
                <div class="form-group">
                    <label>Sampai Tanggal</label>
                    <input type="date" id="potongan-date-end" class="form-control" value="${date}" required>
                </div>
            </div>
            <div class="form-group">
                <label>Jumlah Potongan (Rp)</label>
                <input type="number" id="potongan-amount" class="form-control" required>
            </div>
            <div class="form-actions">
                <button type="button" class="btn" onclick="closeModal()">Batal</button>
                <button type="submit" class="btn btn-primary">Simpan</button>
            </div>
        </form>
    `;
    openModal('Tambah Potongan Penjualan', formHtml);
    focusFirstInput();
    document.getElementById('form-potongan').addEventListener('submit', (e) => {
        e.preventDefault();
        savePotongan();
    });
};

window.editPotongan = (id) => {
    currentEditId = id;
    const data = getData();
    if (!data.deductions) data.deductions = [];
    const pot = data.deductions.find(p => p.id === id);
    if (!pot) return;

    const buyerOptions = data.buyers.map(b => `<option value="${b.id}" ${b.id === pot.buyerId ? 'selected' : ''}>${b.name}</option>`).join('');

    const formHtml = `
        <form id="form-potongan" autocomplete="off">
            <div class="form-group">
                <label>Jenis Potongan</label>
                <select id="potongan-jenis" class="form-control" required>
                    <option value="Potongan Penjualan" ${pot.jenis === 'Potongan Penjualan' ? 'selected' : ''}>Potongan Penjualan</option>
                    <option value="Kasbon" ${pot.jenis === 'Kasbon' ? 'selected' : ''}>Kasbon</option>
                    <option value="Denda" ${pot.jenis === 'Denda' ? 'selected' : ''}>Denda</option>
                    <option value="Lainnya" ${pot.jenis === 'Lainnya' ? 'selected' : ''}>Lainnya</option>
                </select>
            </div>
            <div class="form-group">
                <label>Pilih Pembeli (Opsional)</label>
                <select id="potongan-buyer-id" class="form-control">
                    <option value="">-- Tidak Terkait Pembeli Spesifik --</option>
                    ${buyerOptions}
                </select>
            </div>
            <div class="form-group">
                <label>Keterangan</label>
                <input type="text" id="potongan-desc" class="form-control" value="${pot.description}" required>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem">
                <div class="form-group">
                    <label>Dari Tanggal</label>
                    <input type="date" id="potongan-date-start" class="form-control" value="${pot.dateStart || pot.date || ''}" required>
                </div>
                <div class="form-group">
                    <label>Sampai Tanggal</label>
                    <input type="date" id="potongan-date-end" class="form-control" value="${pot.dateEnd || pot.date || ''}" required>
                </div>
            </div>
            <div class="form-group">
                <label>Jumlah Potongan (Rp)</label>
                <input type="number" id="potongan-amount" class="form-control" value="${pot.amount}" required>
            </div>
            <div class="form-actions">
                <button type="button" class="btn" onclick="closeModal()">Batal</button>
                <button type="submit" class="btn btn-primary">Simpan Perubahan</button>
            </div>
        </form>
    `;
    openModal('Edit Potongan', formHtml);
    focusFirstInput();
    document.getElementById('form-potongan').addEventListener('submit', (e) => {
        e.preventDefault();
        savePotongan();
    });
};

function savePotongan() {
    const jenis = document.getElementById('potongan-jenis').value;
    const buyerId = document.getElementById('potongan-buyer-id').value;
    const dateStart = document.getElementById('potongan-date-start').value;
    const dateEnd = document.getElementById('potongan-date-end').value;
    const description = document.getElementById('potongan-desc').value;
    const amount = parseFloat(document.getElementById('potongan-amount').value) || 0;

    if (dateEnd < dateStart) {
        alert('Sampai Tanggal tidak boleh lebih awal dari Dari Tanggal.');
        return;
    }

    const data = getData();
    if (!data.deductions) data.deductions = [];

    const potData = { jenis, buyerId, dateStart, dateEnd, description, amount };
    let item;
    const expTypes = data.expenseTypes;
    let oldLinkedBuyerId = null;
    if (currentEditId) {
        const oldExp = expTypes.find(e => e.id === currentEditId);
        if (oldExp) oldLinkedBuyerId = oldExp.linkedBuyerId || null;
    }

    if (currentEditId) {
        const index = data.deductions.findIndex(p => p.id === currentEditId);
        if (index > -1) {
            data.deductions[index] = { ...data.deductions[index], ...potData };
            item = data.deductions[index];
        }
    } else {
        item = { id: generateId(), ...potData };
        data.deductions.push(item);
    }

    // Mapping for Turso (lowercase columns)
    const supabaseItem = {
        id: item.id,
        jenis: item.jenis,
        buyerid: item.buyerId,
        date: item.date || item.dateStart || new Date().toISOString().split('T')[0],
        datestart: item.dateStart,
        dateend: item.dateEnd,
        description: item.description,
        amount: item.amount
    };

    saveData(data, 'deductions', supabaseItem);
    closeModal();
    render_potongan();
}

window.deletePotongan = (id) => {
    if (confirm('Apakah Anda yakin ingin menghapus data potongan ini?')) {
        const data = getData();
        data.deductions = data.deductions.filter(p => p.id !== id);
        saveData(data);
        deleteFromDatabase('deductions', id);
        render_potongan();
    }
};

// --- Setoran ---
window.addSetoran = () => openSetoranModal();
window.editSetoran = (id) => {
    const data = getData();
    const item = data.settlements?.find(s => s.id === id);
    if (item) openSetoranModal(item);
};

window.openSetoranModal = (item = null) => {
    const data = getData();
    const title = item ? 'Edit Setoran' : 'Tambah Setoran';
    const categories = [...data.expenseTypes].sort((a, b) => (a.order || 0) - (b.order || 0)).map(e => `<option value="${e.id}" ${item && item.expenseTypeId === e.id ? 'selected' : ''}>${e.name}</option>`).join('');

    const contentHtml = `
        <form id="form-setoran" autocomplete="off">
            <div class="form-group">
                <label>Pilih Jenis Setoran</label>
                <select id="setoran-expense-id" class="form-control" required>
                    <option value="">-- Pilih Jenis --</option>
                    ${categories}
                </select>
            </div>
            <div class="form-actions">
                <button type="button" class="btn" onclick="closeModal()">Batal</button>
                <button type="submit" class="btn btn-primary">Simpan</button>
            </div>
        </form>
    `;
    openModal(title, contentHtml);
    document.getElementById('form-setoran').addEventListener('submit', (e) => {
        e.preventDefault();
        saveSetoran(item ? item.id : null);
    });
};

window.saveSetoran = (id) => {
    const expenseTypeId = document.getElementById('setoran-expense-id').value;
    if (!expenseTypeId) return;

    const data = getData();
    if (!data.settlements) data.settlements = [];

    // Prevent duplicate
    const exists = data.settlements.some(s => s.expenseTypeId === expenseTypeId);
    if (exists && !id) {
        alert('Jenis setoran ini sudah terdaftar.');
        return;
    }

    let item;
    const expTypes = data.expenseTypes;
    let oldLinkedBuyerId = null;
    if (currentEditId) {
        const oldExp = expTypes.find(e => e.id === currentEditId);
        if (oldExp) oldLinkedBuyerId = oldExp.linkedBuyerId || null;
    }
    if (id) {
        const index = data.settlements.findIndex(s => s.id === id);
        if (index > -1) {
            data.settlements[index].expenseTypeId = expenseTypeId;
            item = data.settlements[index];
        }
    } else {
        item = { id: generateId(), expenseTypeId };
        data.settlements.push(item);
    }

    // Mapping for Turso (lowercase columns)
    const supabaseItem = {
        id: item.id,
        expensetypeid: item.expenseTypeId
    };

    saveData(data, 'settlements', supabaseItem);
    closeModal();
    render_potongan();
};

window.deleteSetoran = (id) => {
    if (confirm('Hapus data setoran ini?')) {
        const data = getData();
        data.settlements = data.settlements.filter(s => s.id !== id);
        saveData(data);
        deleteFromDatabase('settlements', id);
        render_potongan();
    }
};

// --- Penjualan ---

// Global for sales form rows
let currentEditTxId = null;
let penjualanRows = [];
let opsExpenseRows = [];
let retExpenseRows = [];


function getWeekLabel(dateString) {
    const parts = dateString.split('-');
    const date = new Date(parts[0], parts[1] - 1, parts[2]);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(date.setDate(diff));
    const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
    
    const fmt = (d) => {
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yy = d.getFullYear();
        return `${dd}/${mm}/${yy}`;
    };
    
    return `${fmt(monday)} - ${fmt(sunday)}`;
}


window.shiftWeek = (direction) => {
    const select = document.getElementById('penjualan-week-filter');
    if (!select || select.options.length === 0) return;
    
    let currentIndex = select.selectedIndex;
    // index 0 is "Semua Tanggal"
    // index 1 is newest week
    // direction -1 = Prev (older) -> index increases
    // direction 1 = Next (newer) -> index decreases
    
    let newIndex = currentIndex;
    
    if (direction === -1) {
        if (currentIndex === 0) newIndex = 1; // if 'All', go to newest week
        else newIndex = currentIndex + 1; // Go older
    } else if (direction === 1) {
        if (currentIndex === 0) return; // 'All' has no newer
        newIndex = currentIndex - 1; // Go newer
        if (newIndex === 0) newIndex = 1; // prevent auto jumping to 'All' when going next
    }
    
    if (newIndex >= 1 && newIndex < select.options.length) {
        select.selectedIndex = newIndex;
        render_penjualan();
    }
};

window.render_penjualan = () => {
    const data = getData();

    // Ensure base pricing for expenses
    let modified = false;
    const sortedTypes = [...data.expenseTypes].sort((a, b) => (a.order || 0) - (b.order || 0));
    sortedTypes.forEach(e => {
        if (e.basePrice === undefined) {
            e.basePrice = 0;
            modified = true;
        }
    });
    if (modified) saveData(data);

    // Setup views
    const listView = document.getElementById('penjualan-list-view');
    const formView = document.getElementById('penjualan-form-view');
    const tbodyList = document.getElementById('tbody-penjualan-list');
    const formContainer = document.getElementById('penjualan-form-container');

    // Pagination / Week Filter Logic
    const weekSelect = document.getElementById('penjualan-week-filter');
    const allTransactions = [...data.transactions].sort((a, b) => new Date(b.date) - new Date(a.date));
    
    // Only populate if empty to preserve user selection across renders
    if (weekSelect && weekSelect.options.length === 0) {
        const weeks = new Set();
        allTransactions.forEach(tx => {
            if(tx.date) weeks.add(getWeekLabel(tx.date));
        });
        
        const weeksArray = Array.from(weeks);
        
        // Ensure current week is in the list
        const todayStr = new Date().toISOString().split('T')[0];
        const currentWeekLabel = getWeekLabel(todayStr);
        if (!weeksArray.includes(currentWeekLabel)) {
            weeksArray.unshift(currentWeekLabel);
        }
        
        weekSelect.innerHTML = '<option value="all">Semua Tanggal</option>';
        weeksArray.forEach(w => {
            weekSelect.innerHTML += `<option value="${w}">${w}</option>`;
        });
        
        weekSelect.value = currentWeekLabel;
    }

    const selectedWeek = weekSelect ? weekSelect.value : 'all';
    let filteredTransactions = allTransactions;
    if (selectedWeek !== 'all') {
        filteredTransactions = allTransactions.filter(tx => tx.date && getWeekLabel(tx.date) === selectedWeek);
    }

    // Update Button states
    const btnPrev = document.getElementById('btn-prev-week');
    const btnNext = document.getElementById('btn-next-week');
    if (weekSelect && btnPrev && btnNext) {
        const idx = weekSelect.selectedIndex;
        btnNext.disabled = (idx <= 1);
        btnPrev.disabled = (idx >= weekSelect.options.length - 1);
        btnNext.style.opacity = btnNext.disabled ? '0.5' : '1';
        btnPrev.style.opacity = btnPrev.disabled ? '0.5' : '1';
    }

    // Switch to List View
    listView.style.display = 'block';
    formView.style.display = 'none';

    // Render List
    tbodyList.innerHTML = '';
    if (filteredTransactions.length === 0) {
        tbodyList.innerHTML = '<tr><td colspan="8" class="text-center text-muted">Belum ada transaksi di minggu ini</td></tr>';
    } else {
        filteredTransactions.forEach(tx => {
            let rincianInfo = '';
            if (tx.sales) {
                rincianInfo = tx.sales.length + ' Baris Barang';
            } else {
                rincianInfo = data.buyers.find(b => b.id === tx.buyerId)?.name || '-';
            }

            const netProfit = tx.totalAmount - (tx.operationalExpense || 0) - (tx.retributionExpense || 0);

            const tr = document.createElement('tr');

            // Get first buyerId for the shortcut (if complex, just use first)
            const firstBuyerId = (tx.sales && tx.sales.length > 0) ? tx.sales[0].buyerId : null;

            tr.innerHTML = `
                <td><input type="checkbox" class="check-penjualan" data-id="${tx.id}"></td>
                <td>${formatDate(tx.date)}</td>
                <td>${rincianInfo}</td>
                <td style="font-weight:600">${formatCurrency(tx.totalAmount)}</td>
                <td class="text-danger">${formatCurrency(tx.operationalExpense || 0)}</td>
                <td class="text-warning">${formatCurrency(tx.retributionExpense || 0)}</td>
                <td style="font-weight:700; color:#10b981;">${formatCurrency(netProfit)}</td>
                <td>
                    <div class="d-flex" style="gap: 0.25rem">
                        <button class="btn btn-sm" style="background:#f59e0b; color:white; padding: 2px 8px; font-size: 0.75rem;" onclick="openAddPotonganForBuyer('${firstBuyerId}', '${tx.date}')" title="Tambah Potongan untuk transaksi ini">Potong</button>
                        <button class="btn btn-sm" style="background:var(--primary-color); color:white; padding: 2px 8px;" onclick="editTransaksi('${tx.id}')">Edit</button>
                        <button class="btn btn-sm" style="background:var(--danger); color:white; padding: 2px 8px;" onclick="deleteTransaksi('${tx.id}')">Hapus</button>
                    </div>
                </td>
            `;
            tbodyList.appendChild(tr);
        });
    }

    // Bind Add button
    document.getElementById('btn-show-add-penjualan').onclick = () => {
        currentEditTxId = null;
        listView.style.display = 'none';
        formView.style.display = 'block';
        document.querySelector('#penjualan-form-view h2').textContent = 'Tambah Data Penjualan';
        initSalesForm(formContainer, data);
    };

    // Bind Back button
    document.getElementById('btn-back-penjualan').onclick = () => {
        listView.style.display = 'block';
        formView.style.display = 'none';
        currentEditTxId = null;
    };
};

window.editTransaksi = (id) => {
    const data = getData();
    const tx = data.transactions.find(t => t.id === id);
    if (!tx) return;

    currentEditTxId = id;

    const listView = document.getElementById('penjualan-list-view');
    const formView = document.getElementById('penjualan-form-view');
    const formContainer = document.getElementById('penjualan-form-container');

    listView.style.display = 'none';
    formView.style.display = 'block';

    const h2 = document.querySelector('#penjualan-form-view h2');
    if (h2) h2.textContent = 'Edit Data Penjualan';

    initSalesForm(formContainer, data, tx);
};

window.deleteTransaksi = (id) => {
    if (confirm('Hapus keseluruhan rekapan transaksi penjualan ini?')) {
        const data = getData();
        data.transactions = data.transactions.filter(t => t.id !== id);
        saveData(data);
        deleteFromDatabase('transactions', id);
        render_penjualan();
    }
};

function initSalesForm(container, data, txToEdit = null) {
    if (txToEdit) {
        // Ensure sales is parsed
        const txSales = typeof txToEdit.sales === 'string' ? JSON.parse(txToEdit.sales) : (txToEdit.sales || []);
        
        penjualanRows = txSales.map(s => ({
            id: generateId(), buyerId: s.buyerId, qty: s.qty, unitPrice: (s.qty > 0 ? s.total / s.qty : 0), total: s.total, driverCount: s.driverCount || 1
        }));

        opsExpenseRows = [];
        const txExpenses = typeof txToEdit.expenseDetails === 'string' ? JSON.parse(txToEdit.expenseDetails) : (txToEdit.expenseDetails || []);
        
        // 1. Load Master Expenses
        const masterOps = [...data.expenseTypes].sort((a, b) => (a.order || 0) - (b.order || 0)).filter(e => e.category === 'Operasional');
        masterOps.forEach(e => {
            const detail = txExpenses.find(d => d.expenseId === e.id);
            if (detail) {
                opsExpenseRows.push({ id: generateId(), expenseId: e.id, name: e.name, nature: e.nature, basePrice: (detail.qty > 0 ? detail.amount / detail.qty : e.basePrice || 0), qty: detail.qty, total: detail.amount });
            } else {
                opsExpenseRows.push({ id: generateId(), expenseId: e.id, name: e.name, nature: e.nature, basePrice: e.basePrice || 0, qty: 0, total: 0 });
            }
        });
        // 2. Load Manual Expenses (No expenseId or not in masterOps)
        txExpenses.forEach(d => {
            const isManual = !d.expenseId || !masterOps.some(e => e.id === d.expenseId);
            // Check if it's actually an Operational expense (we check the master data of all types)
            const masterType = data.expenseTypes.find(e => e.id === d.expenseId);
            if (isManual && (!masterType || masterType.category === 'Operasional')) {
                // If we have both name and amount, and it's not already in opsExpenseRows (by expenseId), it might be manual
                // But we don't want to double-count. However, manual ones have expenseId = null.
                if (!d.expenseId) {
                    opsExpenseRows.push({ id: generateId(), expenseId: null, name: d.name || 'Manual', nature: 'Tidak Pasti', basePrice: (d.qty > 0 ? d.amount / d.qty : 0), qty: d.qty, total: d.amount });
                }
            }
        });

        retExpenseRows = [];
        [...data.expenseTypes].sort((a, b) => (a.order || 0) - (b.order || 0)).filter(e => e.category === 'Retribusi').forEach(e => {
            const detail = txExpenses.find(d => d.expenseId === e.id);
            if (detail) {
                retExpenseRows.push({ id: generateId(), expenseId: e.id, name: e.name, nature: e.nature, basePrice: (detail.qty > 0 ? detail.amount / detail.qty : e.basePrice || 0), qty: detail.qty, total: detail.amount });
            } else {
                retExpenseRows.push({ id: generateId(), expenseId: e.id, name: e.name, nature: e.nature, basePrice: e.basePrice || 0, qty: 0, total: 0 });
            }
        });
    } else {
        // Reset lists for new form
        penjualanRows = [{ id: generateId(), buyerId: '', qty: 0, total: 0, driverCount: 1 }];

        // Populate default ops and ret expenses from master data
        opsExpenseRows = [...data.expenseTypes]
            .sort((a, b) => (a.order || 0) - (b.order || 0))
            .filter(e => e.category === 'Operasional')
            .map(e => ({ id: generateId(), expenseId: e.id, name: e.name, nature: e.nature, basePrice: e.basePrice || 0, qty: 0, total: 0 }));

        retExpenseRows = [...data.expenseTypes]
            .sort((a, b) => (a.order || 0) - (b.order || 0))
            .filter(e => e.category === 'Retribusi')
            .map(e => ({ id: generateId(), expenseId: e.id, name: e.name, nature: e.nature, basePrice: e.basePrice || 0, qty: 0, total: 0 }));
    }

    const txDate = txToEdit ? txToEdit.date : new Date().toISOString().split('T')[0];

    container.innerHTML = `
        <form id="new-penjualan-form" autocomplete="off">
            <!-- Form Penjualan -->
            <div class="card" style="border: 1px solid #bae6fd; box-shadow: 0 4px 6px -1px rgba(186, 230, 253, 0.3);">
                <div class="card-header" style="background:#f0f9ff; border-bottom:1px solid #e0f2fe; padding-bottom: 0.5rem; padding-top:1rem">
                    <h2 style="font-size:1.1rem; color:#0c4a6e;">Form Penjualan</h2>
                </div>
                <div class="card-body">
                    <div class="form-group" style="max-width:300px; margin:0">
                        <label style="font-size:0.8rem">Tanggal</label>
                        <input type="date" id="form-tx-date" class="form-control" style="background:#f8fafc" value="${txDate}" required>
                    </div>
                </div>
            </div>

            <!-- Penjualan List -->
            <div class="card" style="border: 1px solid #bae6fd; box-shadow: 0 4px 6px -1px rgba(186, 230, 253, 0.3);">
                <div class="card-header" style="background:#f0f9ff; border-bottom:1px solid #e0f2fe; padding-bottom: 0.5rem; padding-top:1rem">
                    <h2 style="font-size:1.1rem; color:#0c4a6e;">Penjualan</h2>
                </div>
                <div class="card-body">
                    <div id="penjualan-rows-container"></div>
                    <button type="button" class="btn" id="btn-add-penjualan-row" style="background: white; border:1px solid #bae6fd; margin-top:1rem; font-size: 0.8rem; border-radius: 4px;">
                        <span class="material-symbols-outlined" style="font-size:16px;">add_circle</span> Tambah Baris
                    </button>
                </div>
            </div>

            <!-- Ops Expenses -->
            <div class="card" style="border: 1px solid #bae6fd; box-shadow: 0 4px 6px -1px rgba(186, 230, 253, 0.3);">
                <div class="card-header" style="background:#f0f9ff; border-bottom:1px solid #e0f2fe; padding-bottom: 0.5rem; padding-top:1rem">
                    <h2 style="font-size:1.1rem; color:#0c4a6e;">Pengeluaran Operasional</h2>
                </div>
                <div class="card-body">
                    <div id="ops-rows-container"></div>
                    <button type="button" class="btn" id="btn-add-ops-row" style="background: white; border:1px solid #bae6fd; margin-top:1rem; font-size: 0.8rem; border-radius: 4px;">
                        <span class="material-symbols-outlined" style="font-size:16px;">add_circle</span> Tambah Pengeluaran Operasional
                    </button>
                </div>
            </div>

            <!-- Ret Expenses -->
            <div class="card" style="border: 1px solid #bae6fd; box-shadow: 0 4px 6px -1px rgba(186, 230, 253, 0.3);">
                <div class="card-header" style="background:#f0f9ff; border-bottom:1px solid #e0f2fe; padding-bottom: 0.5rem; padding-top:1rem">
                    <h2 style="font-size:1.1rem; color:#0c4a6e;">Pengeluaran Retribusi</h2>
                </div>
                <div class="card-body">
                    <div id="ret-rows-container"></div>
                    <button type="button" class="btn" id="btn-add-ret-row" style="background: white; border:1px solid #bae6fd; margin-top:1rem; font-size: 0.8rem; border-radius: 4px;">
                        <span class="material-symbols-outlined" style="font-size:16px;">add_circle</span> Tambah Pengeluaran Retribusi
                    </button>
                </div>
            </div>

            <!-- Ringkasan Transaksi -->
            <div class="card" style="border: 1px solid #10b981; box-shadow: 0 4px 6px -1px rgba(16, 185, 129, 0.3); margin-top:2rem;">
                <div class="card-header" style="background:#ecfdf5; border-bottom:1px solid #d1fae5; padding-bottom: 0.5rem; padding-top:1rem">
                    <h2 style="font-size:1.1rem; color:#047857;">Ringkasan / NET Profit</h2>
                </div>
                <div class="card-body" style="background: #f8fafc;">
                    <div class="d-flex justify-between" style="padding:0.5rem 0; border-bottom:1px dashed #cbd5e1;">
                        <span style="font-weight:600; color:#4b5563;">Total Pembelian</span>
                        <span id="summary-total-omzet" style="font-weight:700; color:#111827;">Rp 0</span>
                    </div>
                    <div class="d-flex justify-between" style="padding:0.5rem 0; border-bottom:1px dashed #cbd5e1;">
                        <span style="font-weight:600; color:#4b5563;">Total Pengeluaran Operasional</span>
                        <span id="summary-total-ops" style="font-weight:700; color:#dc2626;">Rp 0</span>
                    </div>
                    <div class="d-flex justify-between" style="padding:0.5rem 0; border-bottom:1px dashed #cbd5e1;">
                        <span style="font-weight:600; color:#4b5563;">Total Pengeluaran Retribusi</span>
                        <span id="summary-total-ret" style="font-weight:700; color:#d97706;">Rp 0</span>
                    </div>
                    <div class="d-flex justify-between" style="padding:1rem 0 0.5rem 0; font-size:1.2rem;">
                        <span style="font-weight:700; color:#065f46;">NET PROFIT</span>
                        <span id="summary-net-profit" style="font-weight:800; color:#10b981;">Rp 0</span>
                    </div>
                </div>
            </div>

            <div class="form-actions" style="margin-top: 2rem;">
                <button type="submit" class="btn btn-primary" style="font-size:1.1rem; padding: 0.75rem 2rem;">Simpan Transaksi</button>
            </div>
        </form>
    `;

    renderSalesRows(data);
    renderOpsRows(data);
    renderRetRows(data);

    document.getElementById('btn-add-penjualan-row').onclick = () => {
        penjualanRows.push({
            id: generateId(),
            buyerId: '',
            qty: 0,
            unitPrice: 0,
            total: 0,
            driverCount: 1,
            hargaBatu: 0,
            sewaBreaker: 0,
            sewaBucket: 0,
            solarBreaker: 0,
            solarBucket: 0
        });
        renderSalesRows(getData());
    };

    document.getElementById('btn-add-ops-row').onclick = () => {
        opsExpenseRows.push({ id: generateId(), expenseId: null, name: '', basePrice: 0, qty: 1, total: 0 });
        renderOpsRows(data);
    };

    document.getElementById('btn-add-ret-row').onclick = () => {
        const totalRit = typeof calculateTotalRitase === 'function' ? calculateTotalRitase() : 0;
        retExpenseRows.push({ id: generateId(), expenseId: '', name: '', basePrice: 0, qty: totalRit || 1, total: 0 });
        renderRetRows(data);
    };

    document.getElementById('new-penjualan-form').onsubmit = (e) => {
        e.preventDefault();
        saveComplexTransaction(data);
    };

    // focus first input (usually date)
    setTimeout(() => focusFirstInput(container), 100);
}

function calculateTotalRitase() {
    let total = 0;
    const data = getData();
    penjualanRows.forEach(row => {
        if (!row.buyerId) return;
        const buyer = data.buyers.find(b => b.id === row.buyerId);
        if (buyer) {
            const isProyekTon = (buyer.category || '').toLowerCase() === 'proyek' && (buyer.unit || '').toLowerCase() === 'ton';
            if (isProyekTon) {
                total += (row.driverCount || 1);
            } else {
                total += (row.qty || 0);
            }
        }
    });
    return total;
}


window.syncLinkedExpensesQty = () => {
    let updated = false;
    const data = getData();
    
    // Check opsExpenseRows
    if (typeof opsExpenseRows !== 'undefined') {
        opsExpenseRows.forEach(r => {
            const expData = data.expenseTypes.find(e => e.id === r.expenseId);
            if (expData && expData.linkedBuyerId) {
                const totalQty = penjualanRows
                    .filter(pr => pr.buyerId === expData.linkedBuyerId)
                    .reduce((acc, pr) => acc + (pr.qty || 0), 0);
                    
                if (r.qty !== totalQty) {
                    r.qty = totalQty;
                    r.total = r.qty * (r.basePrice || 0);
                    updated = true;
                }
            }
        });
    }

    // Check retExpenseRows
    if (typeof retExpenseRows !== 'undefined') {
        retExpenseRows.forEach(r => {
            const expData = data.expenseTypes.find(e => e.id === r.expenseId);
            if (expData && expData.linkedBuyerId) {
                const totalQty = penjualanRows
                    .filter(pr => pr.buyerId === expData.linkedBuyerId)
                    .reduce((acc, pr) => acc + (pr.qty || 0), 0);
                    
                if (r.qty !== totalQty) {
                    r.qty = totalQty;
                    r.total = r.qty * (r.basePrice || 0);
                    updated = true;
                }
            }
        });
    }

    if (updated) {
        if (typeof renderOpsRows === 'function') renderOpsRows(data);
        if (typeof renderRetRows === 'function') renderRetRows(data);
        if (window.updateNetProfitSummary) window.updateNetProfitSummary();
    }
};

function syncRetribusiQty() {
    let totalRit = calculateTotalRitase();
    let updated = false;
    retExpenseRows.forEach(r => {
        // Only auto-sync if nature is 'Pasti'
        if (r.nature === 'Pasti') {
            if (r.qty !== totalRit) {
                r.qty = totalRit;
                r.total = r.qty * (r.basePrice || 0);
                updated = true;
            }
        }
    });
    if (updated) {
        renderRetRows(getData());
        if (window.updateNetProfitSummary) window.updateNetProfitSummary();
    }
}

function renderSalesRows(data) {
    const container = document.getElementById('penjualan-rows-container');
    let html = `
        <div class="d-flex" style="gap:1rem; padding-bottom:0.5rem; border-bottom:1px solid #e5e7eb; margin-bottom:0.5rem; font-size:0.75rem; font-weight:600; color:#4b5563;">
            <div style="flex:2">Pembeli</div>
            <div style="flex:0.8; text-align:center">Jml Sopir</div>
            <div style="flex:1">Qty</div>
            <div style="flex:1.5">Harga Satuan</div>
            <div style="flex:2">Total Harga</div>
            <div style="width:40px"></div>
        </div>
    `;

    let sumTotal = 0;
    penjualanRows.forEach((row) => {
        sumTotal += (row.total || 0);
        let isProyekTon = false;
        let options = '<option value="">Pilih...</option>';
        data.buyers.forEach(b => {
            options += `<option value="${b.id}" ${b.id === row.buyerId ? 'selected' : ''}>${b.name} (${b.category || 'Umum'})</option>`;
            if (row.buyerId === b.id) {
                if (row.unitPrice === undefined) {
                    row.unitPrice = b.unitPrice; // Initialize if not set
                }
                if ((b.category || '').toLowerCase() === 'proyek' && (b.unit || '').toLowerCase() === 'ton') {
                    isProyekTon = true;
                }
            }
        });

        let driverCountHtml = '';
        if (isProyekTon) {
            driverCountHtml = `<input type="number" class="form-control" style="background:#f8fafc; border-color:#cbd5e1; text-align:center" step="1" min="1" value="${row.driverCount || 1}" oninput="updateSalesRow('${row.id}', 'driverCount', this.value)">`;
        } else {
            driverCountHtml = `<input type="text" class="form-control" style="background:#e2e8f0; border-color:#cbd5e1; color:#94a3b8; text-align:center;" value="-" readonly title="Tidak diperlukan">`;
        }

        html += `
            <div class="d-flex align-center" style="gap:1rem; margin-bottom:0.5rem;" data-id="${row.id}">
                <div style="flex:2">
                    <select class="form-control sales-buyer" style="background:#f8fafc; border-color:#cbd5e1;" onchange="updateSalesRow('${row.id}', 'buyerId', this.value)">
                        ${options}
                    </select>
                </div>
                <div style="flex:0.8">
                    ${driverCountHtml}
                </div>
                <div style="flex:1">
                    <input type="number" class="form-control" style="background:#f8fafc; border-color:#cbd5e1;" step="0.01" min="0" value="${row.qty}" oninput="updateSalesRow('${row.id}', 'qty', this.value)">
                </div>
                <div style="flex:1.5">
                    <input type="text" class="form-control" style="background:#f8fafc; border-color:#cbd5e1;" value="${row.unitPrice ? formatCurrency(row.unitPrice) : 'Rp 0'}" readonly>
                </div>
                <div style="flex:1.2">
                    <button type="button" class="btn" style="background:var(--secondary-color); color:white; padding:0.4rem; width:100%; font-size:0.75rem;" onclick="openSetoranDetail('${row.id}')">
                        <span class="material-symbols-outlined" style="font-size:1.1rem; vertical-align:middle">payments</span> Setoran
                    </button>
                </div>
                <div style="flex:2">
                    <input type="text" class="form-control" style="background:#eef2ff; border-color:#c7d2fe; color:#4338ca; font-weight:600;" value="${formatCurrency(row.total)}" readonly>
                </div>
                <div style="width:40px">
                    <button type="button" class="btn-icon text-danger" onclick="removeSalesRow('${row.id}')">
                        <span class="material-symbols-outlined">delete</span>
                    </button>
                </div>
            </div>
        `;
    });

    html += `
        <div class="d-flex align-center" style="gap:1rem; margin-top:0.75rem; padding-top:0.75rem; border-top:1px dashed #cbd5e1;">
            <div style="flex:5.3; text-align:right; font-weight:700; color:#1e293b; font-size:0.9rem;">Total Pembelian:</div>
            <div style="flex:2">
                <input type="text" class="form-control" style="background:transparent; border:none; color:#111827; font-weight:700; font-size:1rem;" value="${formatCurrency(sumTotal)}" readonly>
            </div>
            <div style="width:40px"></div>
        </div>
    `;

    container.innerHTML = html;
    if (window.updateNetProfitSummary) window.updateNetProfitSummary();
}

window.updateSalesRow = (id, field, value) => {
    const row = penjualanRows.find(r => r.id === id);
    if (row) {
        if (field === 'qty') row.qty = parseFloat(value) || 0;
        if (field === 'driverCount') row.driverCount = parseInt(value, 10) || 1;

        if (field === 'buyerId') {
            row.buyerId = value;
            const data = getData();
            const b = data.buyers.find(x => x.id === value);
            if (b) {
                row.hargaBatu = b.unitPrice || 0;
                // Reset others when buyer changes? Or keep them? Usually reset is safer.
                row.sewaBreaker = 0;
                row.sewaBucket = 0;
                row.solarBreaker = 0;
                row.solarBucket = 0;
                row.unitPrice = row.hargaBatu;
            }
        }

        if (['hargaBatu', 'sewaBreaker', 'sewaBucket', 'solarBreaker', 'solarBucket'].includes(field)) {
            row[field] = parseFloat(value) || 0;
            row.unitPrice = (row.hargaBatu || 0) + (row.sewaBreaker || 0) + (row.sewaBucket || 0) + (row.solarBreaker || 0) + (row.solarBucket || 0);
        }

        row.total = row.qty * (row.unitPrice || 0);

        // Full render if buyer changed (to update price defaults)
        if (field === 'buyerId') {
            renderSalesRows(getData());
        } else {
            const rowEl = document.querySelector(`#penjualan-rows-container [data-id="${id}"]`);
            if (rowEl) {
                const totalInput = rowEl.querySelectorAll('input[readonly]')[1]; // second readonly is total
                const unitInput = rowEl.querySelectorAll('input[readonly]')[0]; // first readonly is unitPrice
                if (unitInput) unitInput.value = formatCurrency(row.unitPrice);
                if (totalInput) totalInput.value = formatCurrency(row.total);
            }
            if (window.updateNetProfitSummary) window.updateNetProfitSummary();
        }
    }
    if (typeof syncRetribusiQty === 'function') syncRetribusiQty();
    if (typeof window.syncLinkedExpensesQty === 'function') window.syncLinkedExpensesQty();
};

window.openSetoranDetail = (id) => {
    const row = penjualanRows.find(r => r.id === id);
    if (!row) return;

    const contentHtml = `
        <div style="padding: 0.5rem;">
            <p style="margin-bottom: 1.5rem; font-size: 0.875rem; color: #64748b;">Masukkan rincian setoran per unit untuk baris ini.</p>
            
            <div class="form-group">
                <label>Harga Batu (Base)</label>
                <input type="number" class="form-control" value="${row.hargaBatu || 0}" oninput="updateSalesRow('${id}', 'hargaBatu', this.value)">
            </div>
            
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                <div class="form-group">
                    <label>Sewa Breaker</label>
                    <input type="number" class="form-control" value="${row.sewaBreaker || 0}" oninput="updateSalesRow('${id}', 'sewaBreaker', this.value)">
                </div>
                <div class="form-group">
                    <label>Sewa Bucket</label>
                    <input type="number" class="form-control" value="${row.sewaBucket || 0}" oninput="updateSalesRow('${id}', 'sewaBucket', this.value)">
                </div>
            </div>

            <div style="display:grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                <div class="form-group">
                    <label>Solar Breaker</label>
                    <input type="number" class="form-control" value="${row.solarBreaker || 0}" oninput="updateSalesRow('${id}', 'solarBreaker', this.value)">
                </div>
                <div class="form-group">
                    <label>Solar Bucket</label>
                    <input type="number" class="form-control" value="${row.solarBucket || 0}" oninput="updateSalesRow('${id}', 'solarBucket', this.value)">
                </div>
            </div>

            <div style="margin-top: 1.5rem; padding: 1rem; background: #eef2ff; border-radius: 0.5rem; display: flex; justify-content: space-between; align-items: center;">
                <span style="font-weight: 600; color: #4338ca;">Total Per Unit:</span>
                <span style="font-size: 1.1rem; font-weight: 700; color: #1e1b4b;" id="setoran-modal-total">${formatCurrency(row.unitPrice)}</span>
            </div>

            <div style="margin-top: 2rem; display: flex; justify-content: flex-end;">
                <button class="btn btn-primary" onclick="closeModal()">Selesai</button>
            </div>
        </div>
    `;

    // Overriding updateSalesRow slightly to update the local total in this modal too
    const originalUpdate = window.updateSalesRow;
    window.updateSalesRow = (rid, field, val) => {
        originalUpdate(rid, field, val);
        if (rid === id) {
            const el = document.getElementById('setoran-modal-total');
            if (el) el.textContent = formatCurrency(row.unitPrice);
        }
    };

    openModal('Rincian Setoran', contentHtml);

    window.closeModal = () => {
        window.updateSalesRow = originalUpdate; // Restore
        originalClose();
    };
};

window.removeSalesRow = (id) => {
    penjualanRows = penjualanRows.filter(r => r.id !== id);
    renderSalesRows(getData());
    if (typeof syncRetribusiQty === 'function') syncRetribusiQty();
    if (typeof window.syncLinkedExpensesQty === 'function') window.syncLinkedExpensesQty();
};

window.handleVerticalTab = function(e, colClass, nextColClass, prevColClass) {
    if (e.key === 'Tab') {
        const inputs = Array.from(document.querySelectorAll('.' + colClass)).filter(el => el.offsetParent !== null);
        const index = inputs.indexOf(e.target);
        
        if (e.shiftKey) {
            // Tab Up
            if (index > 0) {
                e.preventDefault();
                inputs[index - 1].focus();
            } else if (index === 0 && prevColClass) {
                const prevInputs = Array.from(document.querySelectorAll('.' + prevColClass)).filter(el => el.offsetParent !== null);
                if (prevInputs.length > 0) {
                    e.preventDefault();
                    prevInputs[prevInputs.length - 1].focus();
                }
            }
        } else {
            // Tab Down
            if (index > -1 && index < inputs.length - 1) {
                e.preventDefault();
                inputs[index + 1].focus();
            } else if (index === inputs.length - 1 && nextColClass) {
                const nextInputs = Array.from(document.querySelectorAll('.' + nextColClass)).filter(el => el.offsetParent !== null);
                if (nextInputs.length > 0) {
                    e.preventDefault();
                    nextInputs[0].focus();
                }
            }
        }
    }
};

function renderOpsRows(data) {
    const container = document.getElementById('ops-rows-container');
    let html = `
        <div class="d-flex" style="gap:1rem; padding-bottom:0.5rem; border-bottom:1px solid #e5e7eb; margin-bottom:0.5rem; font-size:0.75rem; font-weight:600; color:#4b5563;">
            <div style="flex:2">Jenis Pengeluaran</div>
            <div style="flex:1">Qty</div>
            <div style="flex:1.5">Harga Satuan</div>
            <div style="flex:2; text-align:right">Total Harga</div>
            <div style="width:30px"></div>
        </div>
    `;

    let sumTotal = 0;
    opsExpenseRows.forEach((row) => {
        sumTotal += (row.total || 0);
        let labelHtml = '';
        if (row.expenseId) {
            labelHtml = `<div style="flex:2; font-size:0.75rem; font-weight:600; text-transform:uppercase; margin-top:0.5rem;">${row.name}</div>`;
        } else {
            let options = '';
            [...data.expenseTypes].sort((a, b) => (a.order || 0) - (b.order || 0)).filter(e => e.category === 'Operasional').forEach(e => {
                options += `<option value="${e.name}">`;
            });
            labelHtml = `
                <div style="flex:2">
                    <input list="ops-list-${row.id}" class="form-control ops-col-name" onkeydown="handleVerticalTab(event, 'ops-col-name', 'ops-col-qty', null)" placeholder="Ketik/Pilih... (Ops)" style="background:#f8fafc; border-color:#cbd5e1; font-size:0.8rem" value="${row.name || ''}" onchange="updateOpsRow('${row.id}', 'customName', this.value)">
                    <datalist id="ops-list-${row.id}">
                        ${options}
                    </datalist>
                </div>
            `;
        }

        html += `
            <div class="d-flex align-center" style="gap:1rem; margin-bottom:0.75rem;" data-id="${row.id}">
                ${labelHtml}
                <div style="flex:1">
                    <input type="number" class="form-control ops-col-qty" onkeydown="handleVerticalTab(event, 'ops-col-qty', 'ops-col-price', 'ops-col-name')" placeholder="Qty" style="background:#f8fafc; border-color:#cbd5e1; font-size:0.8rem" step="0.01" min="0" value="${row.qty || ''}" oninput="updateOpsRow('${row.id}', 'qty', this.value)">
                </div>
                <div style="flex:1.5">
                    <input type="text" class="form-control ops-col-price" onkeydown="handleVerticalTab(event, 'ops-col-price', null, 'ops-col-qty')" style="background:#f8fafc; border-color:#cbd5e1; font-size:0.8rem" value="${row.basePrice ? formatCurrency(row.basePrice) : 'Rp 0'}" onfocus="this.type='number'; this.value='${row.basePrice || ''}'" onblur="this.type='text'; updateOpsRow('${row.id}', 'basePrice', this.value)">
                </div>
                <div style="flex:2">
                    <input type="text" class="form-control" style="background:#eef2ff; border-color:#c7d2fe; color:#4338ca; font-weight:600; text-align:right; font-size:0.8rem" value="${row.total ? formatCurrency(row.total) : 'Rp 0'}" readonly>
                </div>
                <div style="width:30px">
                     <button type="button" class="btn-icon text-danger" onclick="removeOpsRow('${row.id}')"><span class="material-symbols-outlined" style="font-size:18px">close</span></button>
                </div>
            </div>
        `;
    });

    html += `
        <div class="d-flex align-center" style="gap:1rem; margin-top:0.75rem; padding-top:0.75rem; border-top:1px dashed #cbd5e1;">
            <div style="flex:4.5; text-align:right; font-weight:700; color:#1e293b; font-size:0.9rem;">Total Operasional:</div>
            <div style="flex:2">
                <input type="text" class="form-control" style="background:transparent; border:none; color:#dc2626; font-weight:700; font-size:1rem; text-align:right" value="${formatCurrency(sumTotal)}" readonly>
            </div>
            <div style="width:30px"></div>
        </div>
    `;

    container.innerHTML = html;
    if (window.updateNetProfitSummary) window.updateNetProfitSummary();
}

window.updateOpsRow = (id, field, value) => {
    const row = opsExpenseRows.find(r => r.id === id);
    if (row) {
        let needsFullRender = (field === 'customName' || field === 'expenseId');

        if (field === 'name') row.name = value;
        if (field === 'qty') row.qty = parseFloat(value) || 0;
        if (field === 'basePrice') {
            const cleanStr = value.toString().replace(/[^0-9.-]+/g, "");
            row.basePrice = parseFloat(cleanStr) || 0;
        }
        if (field === 'expenseId') {
            row.expenseId = value;
            const data = getData();
            const exp = data.expenseTypes.find(e => e.id === value);
            if (exp) {
                row.name = exp.name;
                row.basePrice = exp.basePrice || 0;
            }
        }
        if (field === 'customName') {
            if (!value.trim()) return;
            row.name = value.trim();
            const data = getData();
            let exp = data.expenseTypes.find(e => e.name.toLowerCase() === row.name.toLowerCase() && e.category === 'Operasional');
            if (exp) {
                row.expenseId = exp.id;
                row.basePrice = exp.basePrice || 0;
            } else {
                // Do NOT save to master data
                row.expenseId = null;
                row.basePrice = 0;
            }
        }
        row.total = row.qty * (row.basePrice || 0);

        if (needsFullRender) {
            renderOpsRows(getData());
        } else {
            const rowEl = document.querySelector(`#ops-rows-container [data-id="${id}"]`);
            if (rowEl) {
                const totalInput = rowEl.querySelector('input[readonly]');
                if (totalInput) totalInput.value = formatCurrency(row.total);
            }
            if (window.updateNetProfitSummary) window.updateNetProfitSummary();
        }
    }
};

window.removeOpsRow = (id) => {
    opsExpenseRows = opsExpenseRows.filter(r => r.id !== id);
    renderOpsRows(getData());
};

function renderRetRows(data) {
    const container = document.getElementById('ret-rows-container');
    let html = `
        <div class="d-flex" style="gap:1rem; padding-bottom:0.5rem; border-bottom:1px solid #e5e7eb; margin-bottom:0.5rem; font-size:0.75rem; font-weight:600; color:#4b5563;">
            <div style="flex:2">Jenis Retribusi</div>
            <div style="flex:1">Qty</div>
            <div style="flex:1.5">Harga Satuan</div>
            <div style="flex:2; text-align:right">Total Harga</div>
            <div style="width:30px"></div>
        </div>
    `;

    let sumTotal = 0;
    retExpenseRows.forEach((row) => {
        sumTotal += (row.total || 0);
        let labelHtml = '';
        if (row.expenseId) {
            labelHtml = `<div style="flex:2; font-size:0.75rem; font-weight:600; text-transform:uppercase; margin-top:0.5rem;">${row.name}</div>`;
        } else {
            let options = '';
            [...data.expenseTypes].sort((a, b) => (a.order || 0) - (b.order || 0)).filter(e => e.category === 'Retribusi').forEach(e => {
                options += `<option value="${e.name}">`;
            });
            labelHtml = `
                <div style="flex:2">
                    <input list="ret-list-${row.id}" class="form-control" placeholder="Ketik/Pilih... (Ret)" style="background:#f8fafc; border-color:#cbd5e1; font-size:0.8rem" value="${row.name || ''}" onchange="updateRetRow('${row.id}', 'customName', this.value)">
                    <datalist id="ret-list-${row.id}">
                        ${options}
                    </datalist>
                </div>
            `;
        }

        html += `
            <div class="d-flex align-center" style="gap:1rem; margin-bottom:0.75rem;" data-id="${row.id}">
                ${labelHtml}
                <div style="flex:1">
                    <input type="number" class="form-control" placeholder="Qty" style="background:#f8fafc; border-color:#cbd5e1; font-size:0.8rem" step="0.01" min="0" value="${row.qty || ''}" oninput="updateRetRow('${row.id}', 'qty', this.value)">
                </div>
                <div style="flex:1.5">
                    <input type="text" class="form-control" style="background:#f8fafc; border-color:#cbd5e1; font-size:0.8rem" value="${row.basePrice ? formatCurrency(row.basePrice) : 'Rp 0'}" onfocus="this.type='number'; this.value='${row.basePrice || ''}'" onblur="this.type='text'; updateRetRow('${row.id}', 'basePrice', this.value)">
                </div>
                <div style="flex:2">
                    <input type="text" class="form-control" style="background:#eef2ff; border-color:#c7d2fe; color:#4338ca; font-weight:600; text-align:right; font-size:0.8rem" value="${row.total ? formatCurrency(row.total) : 'Rp 0'}" readonly>
                </div>
                <div style="width:30px">
                     <button type="button" class="btn-icon text-danger" onclick="removeRetRow('${row.id}')"><span class="material-symbols-outlined" style="font-size:18px">close</span></button>
                </div>
            </div>
        `;
    });

    html += `
        <div class="d-flex align-center" style="gap:1rem; margin-top:0.75rem; padding-top:0.75rem; border-top:1px dashed #cbd5e1;">
            <div style="flex:4.5; text-align:right; font-weight:700; color:#1e293b; font-size:0.9rem;">Total Retribusi:</div>
            <div style="flex:2">
                <input type="text" class="form-control" style="background:transparent; border:none; color:#d97706; font-weight:700; font-size:1rem; text-align:right" value="${formatCurrency(sumTotal)}" readonly>
            </div>
            <div style="width:30px"></div>
        </div>
    `;

    container.innerHTML = html;
    if (window.updateNetProfitSummary) window.updateNetProfitSummary();
}

window.updateRetRow = (id, field, value) => {
    const row = retExpenseRows.find(r => r.id === id);
    if (row) {
        let needsFullRender = (field === 'customName' || field === 'expenseId');

        if (field === 'qty') row.qty = parseFloat(value) || 0;
        if (field === 'basePrice') {
            const cleanStr = value.toString().replace(/[^0-9.-]+/g, "");
            row.basePrice = parseFloat(cleanStr) || 0;
        }
        if (field === 'expenseId') {
            row.expenseId = value;
            const data = getData();
            const exp = data.expenseTypes.find(e => e.id === value);
            if (exp) {
                row.name = exp.name;
                row.basePrice = exp.basePrice || 0;
            }
        }
        if (field === 'customName') {
            if (!value.trim()) return;
            row.name = value.trim();
            const data = getData();
            let exp = data.expenseTypes.find(e => e.name.toLowerCase() === row.name.toLowerCase() && e.category === 'Retribusi');
            if (exp) {
                row.expenseId = exp.id;
                row.basePrice = exp.basePrice || 0;
            } else {
                // Do NOT save to master data
                row.expenseId = null;
                row.basePrice = 0;
            }
        }
        row.total = row.qty * (row.basePrice || 0);

        if (needsFullRender) {
            renderRetRows(getData());
        } else {
            const rowEl = document.querySelector(`#ret-rows-container [data-id="${id}"]`);
            if (rowEl) {
                const totalInput = rowEl.querySelector('input[readonly]');
                if (totalInput) totalInput.value = formatCurrency(row.total);
            }
            if (window.updateNetProfitSummary) window.updateNetProfitSummary();
        }
    }
};

window.removeRetRow = (id) => {
    retExpenseRows = retExpenseRows.filter(r => r.id !== id);
    renderRetRows(getData());
};

function saveComplexTransaction(data) {
    const date = document.getElementById('form-tx-date').value;

    const validSales = penjualanRows.filter(r => r.buyerId && r.qty > 0);
    if (validSales.length === 0) {
        alert('Minimal isi satu baris penjualan yang valid.');
        return;
    }

    let totalOps = 0;
    const opsDetails = opsExpenseRows.filter(r => r.qty > 0 && (r.expenseId || r.name)).map(r => {
        totalOps += r.total;
        return { expenseId: r.expenseId, name: r.name, qty: r.qty, amount: r.total, category: 'Operasional' };
    });

    let totalRet = 0;
    const retDetails = retExpenseRows.filter(r => r.qty > 0 && (r.expenseId || r.name)).map(r => {
        totalRet += r.total;
        return { expenseId: r.expenseId, name: r.name, qty: r.qty, amount: r.total, category: 'Retribusi' };
    });

    const totalAmount = validSales.reduce((acc, row) => acc + row.total, 0);

    const transaction = {
        id: currentEditTxId || generateId(),
        date,
        buyerId: validSales[0]?.buyerId || null,
        driverId: null, // Sopir tidak ada di rincian ini secara global
        sales: validSales.map(r => ({
            buyerId: r.buyerId,
            qty: r.qty,
            total: r.total,
            driverCount: r.driverCount || 1,
            hargaBatu: r.hargaBatu || 0,
            sewaBreaker: r.sewaBreaker || 0,
            sewaBucket: r.sewaBucket || 0,
            solarBreaker: r.solarBreaker || 0,
            solarBucket: r.solarBucket || 0
        })),
        totalAmount,
        operationalExpense: totalOps,
        retributionExpense: totalRet,
        expenseDetails: [...opsDetails, ...retDetails],
        status: 'Belum Lunas', // By default
        created_at: new Date().toISOString()
    };

    // Mapping for Turso (lowercase columns)
    const supabaseItem = {
        id: transaction.id,
        date: transaction.date,
        buyerid: transaction.buyerId,
        driverid: transaction.driverId,
        totalamount: transaction.totalAmount,
        operationalexpense: transaction.operationalExpense,
        retributionexpense: transaction.retributionExpense,
        status: transaction.status,
        sales: transaction.sales,
        expenses: transaction.expenseDetails
    };

    if (currentEditTxId) {
        const idx = data.transactions.findIndex(t => t.id === currentEditTxId);
        if (idx > -1) {
            transaction.status = data.transactions[idx].status;
            transaction.created_at = data.transactions[idx].created_at;
            data.transactions[idx] = transaction;
        }
        currentEditTxId = null;
        alert('Data Penjualan berhasil diperbarui!');
    } else {
        data.transactions.push(transaction);
        alert('Penjualan ritase/harian berhasil disimpan!');
    }

    saveData(data, 'transactions', supabaseItem);
    render_penjualan();
}

window.updateNetProfitSummary = () => {
    const totalOmzet = penjualanRows.reduce((acc, row) => acc + (row.total || 0), 0);
    const totalOps = opsExpenseRows.reduce((acc, row) => acc + (row.total || 0), 0);
    const totalRet = retExpenseRows.reduce((acc, row) => acc + (row.total || 0), 0);
    const netProfit = totalOmzet - totalOps - totalRet;

    const elOmzet = document.getElementById('summary-total-omzet');
    const elOps = document.getElementById('summary-total-ops');
    const elRet = document.getElementById('summary-total-ret');
    const elNet = document.getElementById('summary-net-profit');

    if (elOmzet) elOmzet.textContent = formatCurrency(totalOmzet);
    if (elOps) elOps.textContent = formatCurrency(totalOps);
    if (elRet) elRet.textContent = formatCurrency(totalRet);
    if (elNet) elNet.textContent = formatCurrency(netProfit);
};

// --- Helper Kalkulasi Pembayaran & Sisa Piutang Transaksi ---
window.getTransactionPaymentInfo = (tx, buyerId = null) => {
    if (!tx) {
        return {
            total: 0,
            paid: 0,
            remaining: 0,
            status: 'Belum Lunas',
            payments: [],
            lastPayment: null
        };
    }

    // 1. Calculate Total Tagihan for this transaction or buyer
    let total = 0;
    let txSales = [];
    if (Array.isArray(tx.sales)) {
        txSales = tx.sales;
    } else if (typeof tx.sales === 'string' && tx.sales.trim()) {
        try {
            txSales = JSON.parse(tx.sales);
            if (!Array.isArray(txSales)) txSales = [];
        } catch (e) {
            txSales = [];
        }
    }

    if (buyerId && txSales.length > 0) {
        const buyerSales = txSales.filter(s => s.buyerId === buyerId);
        if (buyerSales.length > 0) {
            total = buyerSales.reduce((sum, s) => sum + (parseFloat(s.total) || 0), 0);
        } else {
            total = parseFloat(tx.totalAmount || tx.totalamount) || 0;
        }
    } else {
        total = parseFloat(tx.totalAmount || tx.totalamount) || 0;
        if (total === 0 && txSales.length > 0) {
            total = txSales.reduce((sum, s) => sum + (parseFloat(s.total) || 0), 0);
        }
    }

    // 2. Parse Payments
    let payments = [];
    if (Array.isArray(tx.payments)) {
        payments = [...tx.payments];
    } else if (typeof tx.payments === 'string' && tx.payments.trim()) {
        try {
            payments = JSON.parse(tx.payments);
            if (!Array.isArray(payments)) payments = [];
        } catch (e) {
            payments = [];
        }
    }

    // 3. Calculate Paid Amount
    let paid = 0;
    if (payments.length > 0) {
        paid = payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
    } else if (tx.paidAmount !== undefined && tx.paidAmount !== null && tx.paidAmount > 0) {
        paid = parseFloat(tx.paidAmount) || 0;
    } else if (tx.paid_amount !== undefined && tx.paid_amount !== null && tx.paid_amount > 0) {
        paid = parseFloat(tx.paid_amount) || 0;
    } else if (tx.status === 'Lunas') {
        paid = total;
    }

    total = Math.round(total * 100) / 100;
    paid = Math.round(paid * 100) / 100;

    // 4. Calculate Remaining Balance
    let remaining = Math.max(0, Math.round((total - paid) * 100) / 100);
    if (remaining < 0.5) remaining = 0;

    // 5. Determine Accurate Status
    let status = 'Belum Lunas';
    if (paid >= total - 0.5 && total > 0) {
        status = 'Lunas';
        remaining = 0;
    } else if (paid > 0) {
        status = 'Sebagian';
    } else {
        status = 'Belum Lunas';
    }

    // 6. Extract Last Payment Info
    let lastPayment = null;
    if (payments.length > 0) {
        lastPayment = payments[payments.length - 1];
    } else if (tx.paidAt || tx.paid_at) {
        lastPayment = {
            date: tx.paidAt || tx.paid_at,
            method: tx.paymentMethod || tx.payment_method || 'Tunai / Cash',
            note: tx.paymentNote || tx.payment_note || '',
            amount: paid
        };
    }

    return {
        total,
        paid,
        remaining,
        status,
        payments,
        lastPayment
    };
};

// --- Penagihan ---
window.render_penagihan = () => {
    const data = getData();
    const container = document.getElementById('penagihan-content') || document.querySelector('#penagihan .card-body');
    if (!container) return;

    const selectBuyerEl = document.getElementById('filter-penagihan-buyer');
    const startEl = document.getElementById('filter-penagihan-start');
    const endEl = document.getElementById('filter-penagihan-end');
    const statusEl = document.getElementById('filter-penagihan-status');

    const filterBuyerId = selectBuyerEl ? selectBuyerEl.value : '';
    const startDate = startEl ? startEl.value : '';
    const endDate = endEl ? endEl.value : '';
    const filterStatus = statusEl ? statusEl.value : '';

    // 1. Gather all sales segments with calculated partial payment information
    const allBuyerSales = [];
    (data.transactions || []).forEach(t => {
        // Filter by Date
        if (startDate && t.date < startDate) return;
        if (endDate && t.date > endDate) return;

        let txSales = [];
        if (Array.isArray(t.sales)) {
            txSales = t.sales;
        } else if (typeof t.sales === 'string' && t.sales.trim()) {
            try {
                txSales = JSON.parse(t.sales);
                if (!Array.isArray(txSales)) txSales = [];
            } catch (e) {
                txSales = [];
            }
        }

        if (txSales && txSales.length > 0) {
            txSales.forEach(s => {
                const bId = s.buyerId || t.buyerId || t.buyerid;
                const payInfo = getTransactionPaymentInfo(t, bId);
                allBuyerSales.push({
                    txId: t.id,
                    date: t.date,
                    buyerId: bId,
                    amount: parseFloat(s.total) || 0,
                    qty: parseFloat(s.qty) || 0,
                    driverCount: s.driverCount || 1,
                    hargaBatu: s.hargaBatu || 0,
                    status: payInfo.status,
                    paidAmount: payInfo.paid,
                    remainingAmount: payInfo.remaining,
                    lastPayment: payInfo.lastPayment,
                    payments: payInfo.payments
                });
            });
        } else if (t.buyerId || t.buyerid) {
            const bId = t.buyerId || t.buyerid;
            const payInfo = getTransactionPaymentInfo(t, bId);
            allBuyerSales.push({
                txId: t.id,
                date: t.date,
                buyerId: bId,
                amount: parseFloat(t.totalAmount || t.totalamount) || 0,
                qty: parseFloat(t.qty) || 0,
                driverCount: 1,
                hargaBatu: 0,
                status: payInfo.status,
                paidAmount: payInfo.paid,
                remainingAmount: payInfo.remaining,
                lastPayment: payInfo.lastPayment,
                payments: payInfo.payments
            });
        }
    });

    // 2. Group all sales by buyerId
    const grouped = {};
    allBuyerSales.forEach(s => {
        if (!s.buyerId) return;
        if (!grouped[s.buyerId]) grouped[s.buyerId] = [];
        grouped[s.buyerId].push(s);
    });

    // 3. Populate / Update Buyer Dropdown
    if (selectBuyerEl) {
        const currentSelected = selectBuyerEl.value;
        const sortedBuyers = [...(data.buyers || [])].sort((a, b) => (a.name || '').localeCompare(b.name || ''));

        let selectHtml = '<option value="">Semua Pembeli</option>';
        sortedBuyers.forEach(b => {
            const bSegments = grouped[b.id] || [];
            const unpaidCount = bSegments.filter(s => s.status !== 'Lunas').length;
            const totalCount = bSegments.length;
            const marker = totalCount > 0 ? ` • (${unpaidCount > 0 ? `${unpaidCount} Belum Lunas / ` : ''}${totalCount} Transaksi)` : '';
            const isSelected = b.id === currentSelected ? 'selected' : '';
            selectHtml += `<option value="${b.id}" ${isSelected}>${b.name}${marker}</option>`;
        });

        // Any buyer IDs in grouped not in master list
        Object.keys(grouped).forEach(bId => {
            if (!sortedBuyers.some(b => b.id === bId)) {
                const isSelected = bId === currentSelected ? 'selected' : '';
                selectHtml += `<option value="${bId}" ${isSelected}>Pembeli (${bId}) • (${grouped[bId].length} Transaksi)</option>`;
            }
        });

        selectBuyerEl.innerHTML = selectHtml;
        if (currentSelected && [...selectBuyerEl.options].some(opt => opt.value === currentSelected)) {
            selectBuyerEl.value = currentSelected;
        }
    }

    // 4. Calculate Global Metrics for current date / buyer filter
    const targetSalesForStats = filterBuyerId ? (grouped[filterBuyerId] || []) : allBuyerSales;
    const grandTotalSales = targetSalesForStats.reduce((sum, s) => sum + s.amount, 0);
    const grandTotalUnpaid = targetSalesForStats.reduce((sum, s) => sum + s.remainingAmount, 0);
    const grandTotalPaid = targetSalesForStats.reduce((sum, s) => sum + s.paidAmount, 0);

    const countUnpaid = targetSalesForStats.filter(s => s.status === 'Belum Lunas').length;
    const countPartial = targetSalesForStats.filter(s => s.status === 'Sebagian').length;
    const countPaid = targetSalesForStats.filter(s => s.status === 'Lunas').length;
    const countTotal = targetSalesForStats.length;

    // 5. Check if total list is empty
    if (allBuyerSales.length === 0) {
        container.innerHTML = `
            <div style="text-align:center; padding:3.5rem 1.5rem; background:#f8fafc; border-radius:var(--radius-lg); border:1px dashed var(--border-color);">
                <span class="material-symbols-outlined" style="font-size: 48px; color: #94a3b8; margin-bottom: 0.5rem; display: inline-block;">receipt_long</span>
                <h3 style="font-size: 1.1rem; color: #1e293b; margin-bottom: 0.25rem;">Belum Ada Transaksi Penjualan</h3>
                <p style="color: #64748b; font-size: 0.875rem; margin: 0;">Tidak ditemukan transaksi penjualan untuk periode filter yang dipilih.</p>
            </div>
        `;
        return;
    }

    // 6. Filter buyers according to buyer selection
    const buyerIdsToRender = filterBuyerId ? [filterBuyerId] : Object.keys(grouped);

    // 7. Render HTML with Metrics Header
    let html = `
        <!-- Ringkasan Statistik Penagihan -->
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
            <div style="background: white; padding: 1.1rem 1.25rem; border-radius: var(--radius-lg); border: 1px solid var(--border-color); border-left: 4px solid var(--primary-color); box-shadow: var(--shadow-sm);">
                <div style="font-size: 0.75rem; font-weight: 600; color: #64748b; text-transform: uppercase; margin-bottom: 0.25rem;">Total Tagihan Penjualan</div>
                <div style="font-size: 1.35rem; font-weight: 700; color: #1e293b;">${formatCurrency(grandTotalSales)}</div>
                <div style="font-size: 0.75rem; color: #64748b; margin-top: 0.25rem;"><strong>${countTotal}</strong> total transaksi tercatat</div>
            </div>
            <div style="background: white; padding: 1.1rem 1.25rem; border-radius: var(--radius-lg); border: 1px solid #fecdd3; border-left: 4px solid #ef4444; box-shadow: var(--shadow-sm);">
                <div style="font-size: 0.75rem; font-weight: 600; color: #dc2626; text-transform: uppercase; margin-bottom: 0.25rem;">Sisa Piutang (Belum Lunas)</div>
                <div style="font-size: 1.35rem; font-weight: 700; color: #dc2626;">${formatCurrency(grandTotalUnpaid)}</div>
                <div style="font-size: 0.75rem; color: #dc2626; margin-top: 0.25rem;"><strong>${countUnpaid}</strong> belum dibayar ${countPartial > 0 ? `• <strong>${countPartial}</strong> sebagian` : ''}</div>
            </div>
            <div style="background: white; padding: 1.1rem 1.25rem; border-radius: var(--radius-lg); border: 1px solid #bbf7d0; border-left: 4px solid #10b981; box-shadow: var(--shadow-sm);">
                <div style="font-size: 0.75rem; font-weight: 600; color: #166534; text-transform: uppercase; margin-bottom: 0.25rem;">Sudah Diterima (Lunas)</div>
                <div style="font-size: 1.35rem; font-weight: 700; color: #16a34a;">${formatCurrency(grandTotalPaid)}</div>
                <div style="font-size: 0.75rem; color: #166534; margin-top: 0.25rem;"><strong>${countPaid}</strong> transaksi telah lunas</div>
            </div>
        </div>
    `;

    let renderedBuyerCards = 0;

    for (const buyerId of buyerIdsToRender) {
        const buyer = (data.buyers || []).find(b => b.id === buyerId) || { name: 'Pembeli' };
        const bName = buyer.name || 'Pembeli';
        const rawSegments = grouped[buyerId] || [];

        // Apply status filter if active
        let filteredSegments = rawSegments;
        if (filterStatus) {
            filteredSegments = rawSegments.filter(s => s.status === filterStatus);
        }

        if (filteredSegments.length === 0) continue;
        renderedBuyerCards++;

        const buyerTotalAll = rawSegments.reduce((sum, s) => sum + s.amount, 0);
        const buyerTotalPaid = rawSegments.reduce((sum, s) => sum + s.paidAmount, 0);
        const buyerTotalUnpaid = rawSegments.reduce((sum, s) => sum + s.remainingAmount, 0);

        const buyerUnpaidCount = rawSegments.filter(s => s.status === 'Belum Lunas').length;
        const buyerPartialCount = rawSegments.filter(s => s.status === 'Sebagian').length;

        html += `
            <div style="border: 1px solid var(--border-color); border-radius: var(--radius-lg); margin-bottom: 1.5rem; overflow: hidden; background: white; box-shadow: var(--shadow-sm);">
                <div style="background: #f8fafc; padding: 1rem 1.5rem; border-bottom: 1px solid var(--border-color); display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem;">
                    <div>
                        <div style="display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap;">
                            <span class="material-symbols-outlined" style="color: var(--primary-color); font-size: 22px;">storefront</span>
                            <h3 style="margin: 0; font-size: 1.15rem; font-weight: 700; color: #0f172a; text-transform: uppercase;">${bName}</h3>
                            <span class="badge badge-primary" style="font-size: 0.75rem;">${rawSegments.length} TRANSAKSI</span>
                            <span class="badge" style="background: #e0e7ff; color: #4338ca; font-size: 0.75rem;">${buyer.type || 'PROYEK'}</span>
                            ${buyerTotalUnpaid > 0 ? `<span class="badge" style="background: #fee2e2; color: #dc2626; font-size: 0.75rem;">${buyerUnpaidCount} BELUM LUNAS</span>` : `<span class="badge" style="background: #dcfce7; color: #166534; font-size: 0.75rem;">SEMUA LUNAS ✓</span>`}
                            ${buyerPartialCount > 0 ? `<span class="badge" style="background: #fef3c7; color: #b45309; font-size: 0.75rem;">${buyerPartialCount} SEBAGIAN</span>` : ''}
                        </div>
                        <div style="font-size: 0.8rem; color: #64748b; margin-top: 0.25rem;">
                            Alamat: ${buyer.address || '-'} | Satuan: ${buyer.unit || '-'} | Harga Satuan: ${formatCurrency(buyer.pricePerUnit || 0)}
                        </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap;">
                        <div style="text-align: right; background: #ffffff; padding: 0.35rem 0.85rem; border-radius: var(--radius-md); border: 1px solid var(--border-color); font-size: 0.85rem;">
                            <div style="color: #64748b; font-size: 0.75rem;">SISA PIUTANG: <strong style="color: ${buyerTotalUnpaid > 0 ? '#dc2626' : '#16a34a'}; font-size: 0.95rem;">${formatCurrency(buyerTotalUnpaid)}</strong></div>
                            <div style="color: #64748b; font-size: 0.75rem;">TERBAYAR: <strong style="color: #16a34a;">${formatCurrency(buyerTotalPaid)}</strong> / <strong style="color: #1e293b;">${formatCurrency(buyerTotalAll)}</strong></div>
                        </div>
                        <button class="btn btn-secondary btn-sm" onclick="printTagihan('${buyerId}')" title="Cetak Rekap Tagihan & Rincian Piutang" style="display: flex; align-items: center; gap: 0.35rem;">
                            <span class="material-symbols-outlined" style="font-size: 18px;">print</span> Cetak Invoice
                        </button>
                        ${buyerTotalUnpaid > 0 ? `
                            <button class="btn btn-sm" style="background: #10b981; color: white; display: flex; align-items: center; gap: 0.35rem; font-weight: 700; padding: 0.45rem 0.9rem;" onclick="openBulkPaymentAllocationModal('${buyerId}')" title="Alokasikan Pembayaran Otomatis (FIFO / Cicilan)">
                                <span class="material-symbols-outlined" style="font-size: 18px;">price_check</span> Catat Pembayaran Masuk
                            </button>
                        ` : `
                            <button class="btn btn-sm" style="background: #e2e8f0; color: #64748b; cursor: not-allowed; display: flex; align-items: center; gap: 0.35rem; font-weight: 600;" disabled>
                                <span class="material-symbols-outlined" style="font-size: 18px;">check_circle</span> Tagihan Lunas
                            </button>
                        `}
                    </div>
                </div>
                <div class="table-responsive" style="margin: 0;">
                    <table class="table" style="margin-bottom: 0;">
                        <thead>
                            <tr style="background: #ffffff; border-bottom: 2px solid var(--border-color);">
                                <th style="width: 14%;">Tanggal Transaksi</th>
                                <th style="width: 22%;">Keterangan Penjualan</th>
                                <th style="width: 10%; text-align: right;">Volume</th>
                                <th style="width: 14%; text-align: right;">Tagihan (Rp)</th>
                                <th style="width: 14%; text-align: right;">Terbayar & Sisa</th>
                                <th style="width: 14%; text-align: center;">Status Pembayaran</th>
                                <th style="width: 12%; text-align: center;">Aksi</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${filteredSegments.map(s => {
                                const isLunas = s.status === 'Lunas';
                                const isPartial = s.status === 'Sebagian';

                                let statusBadge = '';
                                if (isLunas) {
                                    statusBadge = `
                                        <span class="badge" style="background: #ecfdf5; color: #059669; border: 1px solid #a7f3d0; padding: 0.3rem 0.6rem; font-weight: 700; display: inline-flex; align-items: center; gap: 0.25rem;">
                                            <span class="material-symbols-outlined" style="font-size: 15px;">check_circle</span> LUNAS
                                        </span>
                                    `;
                                } else if (isPartial) {
                                    statusBadge = `
                                        <span class="badge" style="background: #fffbeb; color: #d97706; border: 1px solid #fde68a; padding: 0.3rem 0.6rem; font-weight: 700; display: inline-flex; align-items: center; gap: 0.25rem;">
                                            <span class="material-symbols-outlined" style="font-size: 15px;">pending</span> SEBAGIAN
                                        </span>
                                    `;
                                } else {
                                    statusBadge = `
                                        <span class="badge" style="background: #fff1f2; color: #e11d48; border: 1px solid #fecdd3; padding: 0.3rem 0.6rem; font-weight: 700; display: inline-flex; align-items: center; gap: 0.25rem;">
                                            <span class="material-symbols-outlined" style="font-size: 15px;">schedule</span> BELUM LUNAS
                                        </span>
                                    `;
                                }

                                const paymentMeta = (isLunas || isPartial) && s.lastPayment ? `
                                    <div style="font-size: 0.75rem; color: #475569; margin-top: 0.25rem; line-height: 1.25;">
                                        <span>${formatDate(s.lastPayment.date)}</span>
                                        ${s.lastPayment.method ? ` • <span style="font-weight:600; color:#334155;">${s.lastPayment.method}</span>` : ''}
                                        ${s.lastPayment.note ? `<br><span style="color:#64748b; font-style:italic;">"${s.lastPayment.note}"</span>` : ''}
                                    </div>
                                ` : '';

                                return `
                                    <tr style="${isLunas ? 'background: #fbfdfc;' : isPartial ? 'background: #fffefb;' : ''}">
                                        <td style="font-weight: 600; color: #1e293b;">
                                            ${formatDate(s.date)}
                                        </td>
                                        <td>
                                            <div style="font-weight: 600; color: #334155;">Penjualan Ritase / Batu</div>
                                            <div style="font-size: 0.75rem; color: #64748b;">Jumlah Sopir: ${s.driverCount}</div>
                                        </td>
                                        <td style="text-align: right; font-weight: 600; color: #334155;">
                                            ${s.qty.toLocaleString('id-ID')} <small style="color: #64748b; font-weight: normal;">${buyer.unit || 'Ton'}</small>
                                        </td>
                                        <td style="text-align: right; font-weight: 700; color: #1e293b; font-size: 0.95rem;">
                                            ${formatCurrency(s.amount)}
                                        </td>
                                        <td style="text-align: right; font-size: 0.85rem;">
                                            <div style="color: #16a34a; font-weight: 700;">${formatCurrency(s.paidAmount)}</div>
                                            <div style="color: ${s.remainingAmount > 0 ? '#dc2626' : '#64748b'}; font-weight: ${s.remainingAmount > 0 ? '700' : 'normal'}; font-size: 0.8rem;">
                                                ${s.remainingAmount > 0 ? `Kurang: ${formatCurrency(s.remainingAmount)}` : 'Sisa: Rp 0'}
                                            </div>
                                        </td>
                                        <td style="text-align: center;">
                                            ${statusBadge}
                                            ${paymentMeta}
                                        </td>
                                        <td style="text-align: center;">
                                            ${isLunas ? `
                                                <div style="display: flex; gap: 0.25rem; justify-content: center; flex-wrap: wrap;">
                                                    <button class="btn btn-sm" style="background:#f1f5f9; color:#334155; padding:0.25rem 0.5rem; font-size:0.75rem;" onclick="openPaymentHistoryModal('${s.txId}', '${buyerId}')" title="Lihat Rincian & Riwayat Pembayaran">
                                                        <span class="material-symbols-outlined" style="font-size:15px;">receipt_long</span> Rincian
                                                    </button>
                                                    <button class="btn btn-sm btn-danger" style="padding:0.25rem 0.45rem; font-size:0.75rem;" onclick="cancelPayment('${s.txId}')" title="Batalkan Pelunasan">
                                                        <span class="material-symbols-outlined" style="font-size:15px;">undo</span>
                                                    </button>
                                                </div>
                                            ` : isPartial ? `
                                                <div style="display: flex; gap: 0.25rem; justify-content: center; flex-wrap: wrap;">
                                                    <button class="btn btn-sm" style="background:#f59e0b; color:white; padding:0.25rem 0.6rem; font-size:0.75rem; font-weight:600;" onclick="openPaymentModal('${s.txId}', '${buyerId}')" title="Bayar Cicilan Sisa Tagihan">
                                                        <span class="material-symbols-outlined" style="font-size:15px;">add_card</span> Cicil
                                                    </button>
                                                    <button class="btn btn-sm" style="background:#e2e8f0; color:#334155; padding:0.25rem 0.45rem; font-size:0.75rem;" onclick="openPaymentHistoryModal('${s.txId}', '${buyerId}')" title="Lihat Riwayat Cicilan">
                                                        <span class="material-symbols-outlined" style="font-size:15px;">history</span> (${(s.payments || []).length})
                                                    </button>
                                                </div>
                                            ` : `
                                                <button class="btn btn-sm" style="background:#10b981; color:white; padding:0.3rem 0.75rem; font-size:0.75rem; border-radius:var(--radius-md); font-weight:600;" onclick="openPaymentModal('${s.txId}', '${buyerId}')" title="Buka Form Pembayaran">
                                                    <span class="material-symbols-outlined" style="font-size:16px;">payments</span> Bayar
                                                </button>
                                            `}
                                        </td>
                                    </tr>
                                `;
                            }).join('')}
                        </tbody>
                        <tfoot>
                            <tr style="background:#f8fafc; font-weight:700; border-top:2px solid var(--border-color);">
                                <td colspan="3" style="text-align:right; color:#475569; font-size:0.85rem;">TOTAL KESELURUHAN (${bName}):</td>
                                <td style="text-align:right; font-size:1.05rem; color:#1e293b;">${formatCurrency(buyerTotalAll)}</td>
                                <td style="text-align:right; font-size:0.85rem;">
                                    <div style="color:#16a34a;">Lunas: ${formatCurrency(buyerTotalPaid)}</div>
                                    <div style="color:#dc2626;">Piutang: ${formatCurrency(buyerTotalUnpaid)}</div>
                                </td>
                                <td colspan="2" style="text-align:center; font-size:0.8rem; color:#64748b;">
                                    ${buyerTotalUnpaid === 0 ? '<span style="color:#16a34a; font-weight:bold;">SEMUA TRANSAKSI LUNAS</span>' : `<span style="color:#dc2626; font-weight:bold;">${buyerUnpaidCount} TRANSAKSI BELUM LUNAS</span>`}
                                </td>
                            </tr>
                        </tfoot>
                    </table>
                </div>
            </div>
        `;
    }

    if (renderedBuyerCards === 0) {
        html += `
            <div style="text-align:center; padding:3.5rem 1.5rem; background:#f8fafc; border-radius:var(--radius-lg); border:1px dashed var(--border-color);">
                <span class="material-symbols-outlined" style="font-size: 48px; color: #10b981; margin-bottom: 0.5rem; display: inline-block;">task_alt</span>
                <h3 style="font-size: 1.1rem; color: #1e293b; margin-bottom: 0.25rem;">Tidak Ada Data Penagihan yang Sesuai Filter</h3>
                <p style="color: #64748b; font-size: 0.875rem; margin: 0;">Silakan ubah filter status atau rentang tanggal untuk melihat transaksi lainnya.</p>
            </div>
        `;
    }

    container.innerHTML = html;
};

// --- Modal Pembayaran Tunggal / Cicilan Transaksi ---
window.openPaymentModal = (txId, buyerId) => {
    const data = getData();
    const tx = (data.transactions || []).find(t => t.id === txId);
    if (!tx) {
        alert('Transaksi tidak ditemukan!');
        return;
    }

    const buyer = (data.buyers || []).find(b => b.id === (buyerId || tx.buyerId));
    const buyerName = buyer ? buyer.name : 'Pembeli';
    const payInfo = getTransactionPaymentInfo(tx, buyerId);

    const today = new Date().toISOString().split('T')[0];
    const defaultPayAmount = payInfo.remaining;

    const formHtml = `
        <form id="form-pembayaran-tagihan" autocomplete="off">
            <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 0.85rem 1.1rem; margin-bottom: 1.25rem;">
                <div style="font-weight: 700; color: #166534; font-size: 0.95rem; margin-bottom: 0.35rem; display: flex; align-items: center; gap: 0.4rem;">
                    <span class="material-symbols-outlined" style="font-size: 20px;">receipt_long</span>
                    Rincian Tagihan Penjualan
                </div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; font-size: 0.85rem; color: #374151;">
                    <div><strong>Pembeli:</strong> ${buyerName}</div>
                    <div><strong>Tanggal Transaksi:</strong> ${formatDate(tx.date)}</div>
                    <div><strong>Total Tagihan:</strong> <span style="font-weight: 700;">${formatCurrency(payInfo.total)}</span></div>
                    <div><strong>Sudah Terbayar:</strong> <span style="color: #16a34a; font-weight: 700;">${formatCurrency(payInfo.paid)}</span></div>
                    <div style="grid-column: span 2; border-top: 1px dashed #bbf7d0; padding-top: 0.4rem; display: flex; justify-content: space-between; align-items: center;">
                        <span style="font-weight: 600;">Sisa Tagihan yang Harus Dibayar:</span>
                        <span style="color: #dc2626; font-weight: 800; font-size: 1.1rem;">${formatCurrency(payInfo.remaining)}</span>
                    </div>
                </div>
            </div>

            <div class="form-group">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.25rem;">
                    <label style="margin:0;">Nominal yang Dibayar Sekarang (Rp) <span style="color:var(--danger)">*</span></label>
                    <button type="button" class="btn btn-sm" style="background:#e0e7ff; color:#4338ca; padding:0.15rem 0.5rem; font-size:0.75rem; font-weight:600;" onclick="document.getElementById('bayar-amount').value = ${defaultPayAmount}; document.getElementById('bayar-amount').dispatchEvent(new Event('input'));">
                        Bayar Penuh (${formatCurrency(defaultPayAmount)})
                    </button>
                </div>
                <input type="number" id="bayar-amount" class="form-control" value="${defaultPayAmount}" min="1" max="${payInfo.remaining}" step="any" required style="font-size: 1.1rem; font-weight: 700; color: #0f172a;">
                <div id="bayar-sim-info" style="font-size: 0.8rem; color: #64748b; margin-top: 0.35rem; font-weight: 500;"></div>
            </div>

            <div class="form-group">
                <label>Tanggal Pembayaran <span style="color:var(--danger)">*</span></label>
                <input type="date" id="bayar-date" class="form-control" value="${today}" required>
            </div>

            <div class="form-group">
                <label>Metode Pembayaran <span style="color:var(--danger)">*</span></label>
                <select id="bayar-method" class="form-control" required>
                    <option value="Tunai / Cash" selected>Tunai / Cash</option>
                    <option value="Transfer Bank BCA">Transfer Bank BCA</option>
                    <option value="Transfer Bank BRI">Transfer Bank BRI</option>
                    <option value="Transfer Bank Mandiri">Transfer Bank Mandiri</option>
                    <option value="Transfer Bank Lainnya">Transfer Bank Lainnya</option>
                    <option value="Cek / Giro">Cek / Giro</option>
                </select>
            </div>

            <div class="form-group">
                <label>Keterangan / Catatan Pembayaran</label>
                <input type="text" id="bayar-note" class="form-control" placeholder="Contoh: Transfer via Rekening BCA / Cicilan Tahap 1" oninput="this.value = this.value.toUpperCase()">
            </div>

            <div class="form-actions" style="margin-top: 1.5rem;">
                <button type="button" class="btn" onclick="closeModal()">Batal</button>
                <button type="submit" class="btn btn-primary" style="background: #10b981; color: white;">
                    <span class="material-symbols-outlined">save</span> Simpan Pembayaran
                </button>
            </div>
        </form>
    `;

    openModal('Form Pembayaran / Cicilan Tagihan', formHtml, '600px');

    const amountInput = document.getElementById('bayar-amount');
    const simInfoEl = document.getElementById('bayar-sim-info');

    const updateSimInfo = () => {
        const inputVal = parseFloat(amountInput.value) || 0;
        const remainingAfter = Math.max(0, payInfo.remaining - inputVal);
        if (remainingAfter <= 0.01) {
            simInfoEl.innerHTML = `<span style="color: #059669; font-weight: 700;">✓ Status Akhir: LUNAS PENUH (Sisa: Rp 0)</span>`;
        } else {
            simInfoEl.innerHTML = `<span style="color: #d97706; font-weight: 700;">⏳ Status Akhir: DIBAYAR SEBAGIAN (Sisa Kurang: ${formatCurrency(remainingAfter)})</span>`;
        }
    };
    amountInput.addEventListener('input', updateSimInfo);
    updateSimInfo();

    document.getElementById('form-pembayaran-tagihan').addEventListener('submit', async (e) => {
        e.preventDefault();
        const payAmount = parseFloat(document.getElementById('bayar-amount').value) || 0;
        const payDate = document.getElementById('bayar-date').value;
        const payMethod = document.getElementById('bayar-method').value;
        const payNote = document.getElementById('bayar-note').value.trim();

        if (payAmount <= 0) {
            alert('Nominal pembayaran harus lebih besar dari Rp 0!');
            return;
        }

        if (!payDate) {
            alert('Tanggal pembayaran wajib diisi!');
            return;
        }

        const currentData = getData();
        const targetTx = currentData.transactions.find(t => t.id === txId);
        if (targetTx) {
            const currentPayments = Array.isArray(targetTx.payments) 
                ? [...targetTx.payments] 
                : (typeof targetTx.payments === 'string' && targetTx.payments.trim() ? JSON.parse(targetTx.payments) : []);

            const newPaymentEntry = {
                id: 'PAY-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
                date: payDate,
                amount: payAmount,
                method: payMethod,
                note: payNote,
                createdAt: new Date().toISOString()
            };

            currentPayments.push(newPaymentEntry);
            const newTotalPaid = currentPayments.reduce((acc, p) => acc + (parseFloat(p.amount) || 0), 0);
            const totalTxAmount = parseFloat(targetTx.totalAmount) || 0;
            const newStatus = (newTotalPaid >= totalTxAmount - 0.5) ? 'Lunas' : 'Sebagian';

            targetTx.payments = currentPayments;
            targetTx.paidAmount = newTotalPaid;
            targetTx.status = newStatus;
            targetTx.paidAt = payDate;
            targetTx.paymentMethod = payMethod;
            targetTx.paymentNote = payNote;

            const supabaseItem = {
                id: targetTx.id,
                date: targetTx.date,
                buyerid: targetTx.buyerId,
                driverid: targetTx.driverId,
                totalamount: targetTx.totalAmount,
                operationalexpense: targetTx.operationalExpense,
                retributionexpense: targetTx.retributionExpense,
                status: newStatus,
                paid_amount: newTotalPaid,
                paid_at: payDate,
                payment_method: payMethod,
                payment_note: payNote,
                payments: JSON.stringify(currentPayments),
                sales: targetTx.sales,
                expenses: targetTx.expenseDetails
            };

            await saveData(currentData, 'transactions', supabaseItem);
            closeModal();
            render_penagihan();
            showToast(`✅ Pembayaran Rp ${payAmount.toLocaleString('id-ID')} berhasil dicatat. Status: ${newStatus.toUpperCase()}!`);
        }
    });
};

// --- Modal Alokasi Pembayaran Massal / FIFO Otomatis untuk Pembeli ---
window.openBulkPaymentAllocationModal = (buyerId) => {
    const data = getData();
    const buyer = (data.buyers || []).find(b => b.id === buyerId);
    const buyerName = buyer ? buyer.name : 'Pembeli ini';

    // 1. Ambil nilai filter rentang tanggal aktif dari halaman Penagihan jika sudah diinput sebelumnya
    const startFilterEl = document.getElementById('filter-penagihan-start');
    const endFilterEl = document.getElementById('filter-penagihan-end');
    let curFilterStart = startFilterEl ? startFilterEl.value : '';
    let curFilterEnd = endFilterEl ? endFilterEl.value : '';

    // Helper untuk mengambil transaksi belum lunas berdasarkan rentang tanggal
    const getCandidates = (sDate, eDate) => {
        const list = [];
        (data.transactions || []).forEach(t => {
            if (sDate && t.date < sDate) return;
            if (eDate && t.date > eDate) return;

            let txSales = [];
            if (Array.isArray(t.sales)) {
                txSales = t.sales;
            } else if (typeof t.sales === 'string' && t.sales.trim()) {
                try { txSales = JSON.parse(t.sales); } catch(e){}
            }

            let isBuyerMatch = false;
            let buyerQty = 0;
            let driverCount = 1;

            if (txSales && txSales.length > 0) {
                const matches = txSales.filter(s => (s.buyerId || t.buyerId || t.buyerid) === buyerId);
                if (matches.length > 0) {
                    isBuyerMatch = true;
                    buyerQty = matches.reduce((sum, s) => sum + (parseFloat(s.qty) || 0), 0);
                    driverCount = matches[0]?.driverCount || 1;
                }
            } else if (t.buyerId === buyerId || t.buyerid === buyerId) {
                isBuyerMatch = true;
                buyerQty = parseFloat(t.qty) || 0;
                driverCount = 1;
            }

            if (isBuyerMatch) {
                const info = getTransactionPaymentInfo(t, buyerId);
                if (info.remaining > 0) {
                    list.push({
                        tx: t,
                        info: info,
                        qty: buyerQty,
                        driverCount: driverCount
                    });
                }
            }
        });

        // Urutkan transaksi tertua terlebih dahulu (FIFO)
        list.sort((a, b) => (a.tx.date || '').localeCompare(b.tx.date || ''));
        return list;
    };

    let candidateTxs = getCandidates(curFilterStart, curFilterEnd);
    let totalOutstanding = candidateTxs.reduce((sum, item) => sum + item.info.remaining, 0);
    const today = new Date().toISOString().split('T')[0];

    const formHtml = `
        <form id="form-bulk-allocation" autocomplete="off" style="font-size: 0.9rem;">
            <!-- Header Info & Filter Rentang Tanggal -->
            <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 10px; padding: 1rem 1.25rem; margin-bottom: 1.25rem;">
                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem; margin-bottom: 0.75rem;">
                    <div>
                        <div style="font-weight: 800; color: #166534; font-size: 1.05rem; display: flex; align-items: center; gap: 0.4rem;">
                            <span class="material-symbols-outlined" style="font-size: 22px; color: #16a34a;">account_balance_wallet</span>
                            Catat Pembayaran Masuk (FIFO / Cicilan)
                        </div>
                        <div style="font-size: 0.85rem; color: #374151; margin-top: 0.2rem;">
                            Pembeli: <strong style="font-size: 0.95rem; color: #1e293b;">${buyerName}</strong> • Sisa Piutang Periode Ini: <strong id="bulk-header-outstanding" style="color:#dc2626; font-size:1.15rem; font-weight:800;">${formatCurrency(totalOutstanding)}</strong> (<span id="bulk-header-count" style="font-weight:700;">${candidateTxs.length}</span> Transaksi Belum Lunas)
                        </div>
                    </div>
                </div>

                <!-- Rentang Tanggal Filter Bar di dalam Modal -->
                <div style="background: white; border: 1px solid #dcfce7; border-radius: 8px; padding: 0.5rem 0.85rem; display: flex; align-items: center; flex-wrap: wrap; gap: 0.6rem; font-size: 0.85rem;">
                    <label style="font-weight: 700; color: #166534; margin: 0; display: flex; align-items: center; gap: 0.3rem;">
                        <span class="material-symbols-outlined" style="font-size: 18px; color: #16a34a;">date_range</span>
                        Rentang Transaksi:
                    </label>
                    <input type="date" id="bulk-filter-start" class="form-control" style="width: auto; padding: 0.25rem 0.5rem; font-size: 0.85rem;" value="${curFilterStart}" onchange="window.updateBulkCandidateList()">
                    <span style="color: #64748b; font-weight: bold;">s/d</span>
                    <input type="date" id="bulk-filter-end" class="form-control" style="width: auto; padding: 0.25rem 0.5rem; font-size: 0.85rem;" value="${curFilterEnd}" onchange="window.updateBulkCandidateList()">
                    <button type="button" class="btn btn-sm" style="background: #10b981; color: white; padding: 0.3rem 0.65rem; font-size: 0.8rem; font-weight: 600;" onclick="window.updateBulkCandidateList()">
                        Terapkan Rentang
                    </button>
                    <button type="button" class="btn btn-sm" style="background: #e2e8f0; color: #475569; padding: 0.3rem 0.65rem; font-size: 0.8rem;" onclick="document.getElementById('bulk-filter-start').value=''; document.getElementById('bulk-filter-end').value=''; window.updateBulkCandidateList();" title="Tampilkan seluruh transaksi belum lunas tanpa filter tanggal">
                        Semua Tanggal
                    </button>
                </div>
            </div>

            <!-- Input Utama Pembayaran (2 Kolom Grid) -->
            <div style="display: grid; grid-template-columns: 1.2fr 1fr; gap: 1.25rem; margin-bottom: 1rem;">
                <div class="form-group" style="margin-bottom: 0;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.35rem;">
                        <label style="margin:0; font-weight: 700; color: #1e293b;">Nominal Pembayaran Masuk (Rp) <span style="color:var(--danger)">*</span></label>
                        <button type="button" id="btn-pay-all-bulk" class="btn btn-sm" style="background:#e0e7ff; color:#4338ca; padding:0.15rem 0.55rem; font-size:0.75rem; font-weight:700; border-radius: 4px;" onclick="window.setBulkPayAll()">
                            Bayar Sesuai Total (${formatCurrency(totalOutstanding)})
                        </button>
                    </div>
                    <input type="number" id="bulk-total-pay" class="form-control" value="${totalOutstanding}" min="1" step="any" required style="font-size: 1.25rem; font-weight: 800; color: #0f172a; border: 2px solid #6366f1; background: #f8faff; padding: 0.5rem 0.75rem;">
                </div>

                <div class="form-group" style="margin-bottom: 0;">
                    <label style="font-weight: 700; color: #1e293b; margin-bottom: 0.35rem;">Tanggal Pembayaran <span style="color:var(--danger)">*</span></label>
                    <input type="date" id="bulk-pay-date" class="form-control" value="${today}" required style="padding: 0.55rem 0.75rem;">
                </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1.2fr; gap: 1.25rem; margin-bottom: 1.25rem;">
                <div class="form-group" style="margin-bottom: 0;">
                    <label style="font-weight: 600; color: #334155; margin-bottom: 0.35rem;">Metode Pembayaran <span style="color:var(--danger)">*</span></label>
                    <select id="bulk-pay-method" class="form-control" required style="padding: 0.55rem 0.75rem;">
                        <option value="Tunai / Cash" selected>Tunai / Cash</option>
                        <option value="Transfer Bank BCA">Transfer Bank BCA</option>
                        <option value="Transfer Bank BRI">Transfer Bank BRI</option>
                        <option value="Transfer Bank Mandiri">Transfer Bank Mandiri</option>
                        <option value="Transfer Bank Lainnya">Transfer Bank Lainnya</option>
                        <option value="Cek / Giro">Cek / Giro</option>
                    </select>
                </div>

                <div class="form-group" style="margin-bottom: 0;">
                    <label style="font-weight: 600; color: #334155; margin-bottom: 0.35rem;">Catatan / No. Bukti Pembayaran</label>
                    <input type="text" id="bulk-pay-note" class="form-control" placeholder="Contoh: Transfer BCA a.n CV RESEP / Pelunasan Periode Ini" oninput="this.value = this.value.toUpperCase()" style="padding: 0.55rem 0.75rem;">
                </div>
            </div>

            <!-- Simulasi Alokasi Header -->
            <div style="margin-bottom: 0.5rem; display: flex; justify-content: space-between; align-items: center;">
                <div style="font-size: 0.875rem; font-weight: 700; color: #1e293b; display: flex; align-items: center; gap: 0.35rem;">
                    <span class="material-symbols-outlined" style="font-size: 18px; color: #4f46e5;">format_list_bulleted</span>
                    Rincian Alokasi Per Transaksi (FIFO Otomatis):
                </div>
                <div style="font-size: 0.75rem; color: #64748b;">
                    *Nominal alokasi per baris dapat disesuaikan langsung jika diperlukan
                </div>
            </div>

            <!-- Tabel Transaksi Lebar -->
            <div style="max-height: 320px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 8px; margin-bottom: 1.25rem; background: white; box-shadow: inset 0 1px 2px rgba(0,0,0,0.03);">
                <table class="table" style="margin: 0; font-size: 0.85rem; width: 100%;">
                    <thead style="position: sticky; top: 0; background: #f8fafc; z-index: 2; border-bottom: 2px solid var(--border-color);">
                        <tr>
                            <th style="width: 40px; text-align: center;"><input type="checkbox" id="check-all-alloc" checked onchange="window.toggleAllAllocChecks(this)"></th>
                            <th style="width: 130px;">Tgl Transaksi</th>
                            <th style="width: 130px; text-align: center;">Volume / Qty</th>
                            <th style="text-align: right; width: 140px;">Total Tagihan</th>
                            <th style="text-align: right; width: 140px;">Sisa Piutang</th>
                            <th style="text-align: right; width: 180px;">Alokasi Bayar (Rp)</th>
                            <th style="text-align: center; width: 160px;">Status Baru</th>
                        </tr>
                    </thead>
                    <tbody id="bulk-alloc-tbody">
                    </tbody>
                </table>
            </div>

            <!-- Live Allocation Summary Footer -->
            <div style="background: #f8fafc; border: 1px solid var(--border-color); border-radius: 8px; padding: 0.85rem 1.15rem; margin-bottom: 1.25rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem; font-size: 0.875rem;">
                <div>
                    Total Uang Masuk: <strong id="summary-total-in" style="color: #0f172a; font-size: 1rem;">${formatCurrency(totalOutstanding)}</strong> • 
                    Teralokasi: <strong id="summary-total-used" style="color: #16a34a; font-size: 1rem;">Rp 0</strong>
                </div>
                <div id="summary-diff-container">
                    <span id="summary-diff-badge" class="badge" style="background: #ecfdf5; color: #059669; font-weight: 700; padding: 0.4rem 0.8rem; font-size: 0.8rem;">
                        Alokasi Pas (Sisa Rp 0)
                    </span>
                </div>
            </div>

            <div class="form-actions" style="margin-top: 1rem; padding-top: 1rem;">
                <button type="button" class="btn" style="padding: 0.6rem 1.25rem;" onclick="closeModal()">Batal</button>
                <button type="submit" class="btn btn-primary" style="background: #10b981; color: white; padding: 0.6rem 1.75rem; font-weight: 700; font-size: 0.95rem;">
                    <span class="material-symbols-outlined">save</span> Simpan & Terapkan Pembayaran
                </button>
            </div>
        </form>
    `;

    openModal(`Catat Pembayaran Masuk - ${buyerName}`, formHtml, '950px');

    // Helper render baris tabel transaksi
    const renderTableRows = (txList) => {
        const tbody = document.getElementById('bulk-alloc-tbody');
        if (!tbody) return;

        if (txList.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="7" class="text-center text-muted" style="padding: 2.5rem 1rem;">
                        <span class="material-symbols-outlined" style="font-size: 32px; color: #94a3b8; display: block; margin-bottom: 0.5rem;">event_busy</span>
                        <strong style="color: #475569;">Tidak ada transaksi piutang yang ditemukan pada rentang tanggal ini.</strong>
                        <div style="font-size: 0.8rem; margin-top: 0.35rem; color: #64748b;">Silakan sesuaikan filter tanggal atau klik tombol <em>"Semua Tanggal"</em> di atas.</div>
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = txList.map(item => {
            const unitStr = buyer.unit || 'Ton';
            return `
                <tr id="row-alloc-${item.tx.id}" data-tx-id="${item.tx.id}" data-max-remaining="${item.info.remaining}">
                    <td style="text-align: center;">
                        <input type="checkbox" class="alloc-row-check" data-tx-id="${item.tx.id}" checked onchange="window.recalculateBulkAllocations()">
                    </td>
                    <td style="font-weight: 600; color: #1e293b;">
                        ${formatDate(item.tx.date)}
                    </td>
                    <td style="text-align: center; color: #475569;">
                        ${item.qty ? `${item.qty.toLocaleString('id-ID')} ${unitStr}` : '-'}
                        ${item.driverCount > 1 ? `<small style="display:block; color:#64748b;">(${item.driverCount} Sopir)</small>` : ''}
                    </td>
                    <td style="text-align: right; color: #475569;">
                        ${formatCurrency(item.info.total)}
                    </td>
                    <td style="text-align: right; font-weight: 700; color: #dc2626;">
                        ${formatCurrency(item.info.remaining)}
                    </td>
                    <td style="text-align: right;">
                        <input type="number" class="form-control form-control-sm alloc-row-input" data-tx-id="${item.tx.id}" data-max="${item.info.remaining}" value="0" min="0" max="${item.info.remaining}" step="any" style="text-align: right; font-weight: 700; color: #0f172a; padding: 0.3rem 0.5rem; border-color: #cbd5e1;" oninput="window.handleManualAllocInput('${item.tx.id}')">
                    </td>
                    <td style="text-align: center;" id="status-cell-${item.tx.id}">
                        <span class="badge" style="background:#fff1f2; color:#e11d48;">BELUM LUNAS</span>
                    </td>
                </tr>
            `;
        }).join('');
    };

    // Fungsi pembaruan saat filter rentang tanggal diubah dalam modal
    window.updateBulkCandidateList = () => {
        const sDate = document.getElementById('bulk-filter-start')?.value || '';
        const eDate = document.getElementById('bulk-filter-end')?.value || '';
        candidateTxs = getCandidates(sDate, eDate);
        totalOutstanding = candidateTxs.reduce((sum, item) => sum + item.info.remaining, 0);

        const outEl = document.getElementById('bulk-header-outstanding');
        const countEl = document.getElementById('bulk-header-count');
        const payAllBtn = document.getElementById('btn-pay-all-bulk');
        const payInput = document.getElementById('bulk-total-pay');

        if (outEl) outEl.textContent = formatCurrency(totalOutstanding);
        if (countEl) countEl.textContent = candidateTxs.length;
        if (payAllBtn) payAllBtn.textContent = `Bayar Sesuai Total (${formatCurrency(totalOutstanding)})`;
        if (payInput) payInput.value = totalOutstanding;

        renderTableRows(candidateTxs);
        window.recalculateBulkAllocations();
    };

    window.setBulkPayAll = () => {
        const payInput = document.getElementById('bulk-total-pay');
        if (payInput) {
            payInput.value = totalOutstanding;
            window.recalculateBulkAllocations();
        }
    };

    // Inisialisasi baris tabel pertama kali
    renderTableRows(candidateTxs);

    window.toggleAllAllocChecks = (masterCheck) => {
        const checks = document.querySelectorAll('.alloc-row-check');
        checks.forEach(c => c.checked = masterCheck.checked);
        window.recalculateBulkAllocations();
    };

    window.recalculateBulkAllocations = () => {
        const totalPayInput = document.getElementById('bulk-total-pay');
        if (!totalPayInput) return;

        let availableMoney = parseFloat(totalPayInput.value) || 0;
        const totalIn = availableMoney;
        let totalUsed = 0;

        const rowChecks = document.querySelectorAll('.alloc-row-check');
        rowChecks.forEach(chk => {
            const txId = chk.dataset.txId;
            const inputEl = document.querySelector(`.alloc-row-input[data-tx-id="${txId}"]`);
            if (!inputEl) return;
            const maxRemaining = parseFloat(inputEl.dataset.max) || 0;
            const statusCell = document.getElementById(`status-cell-${txId}`);

            if (chk.checked && availableMoney > 0.001) {
                let allocated = Math.min(availableMoney, maxRemaining);
                allocated = Math.round(allocated * 100) / 100;
                inputEl.value = allocated;
                inputEl.disabled = false;
                availableMoney = Math.round((availableMoney - allocated) * 100) / 100;
                totalUsed = Math.round((totalUsed + allocated) * 100) / 100;

                const remainingAfter = Math.max(0, Math.round((maxRemaining - allocated) * 100) / 100);
                if (remainingAfter <= 0.01) {
                    if (statusCell) statusCell.innerHTML = `<span class="badge" style="background:#ecfdf5; color:#059669; font-weight:700;">✓ LUNAS</span>`;
                } else if (allocated > 0) {
                    if (statusCell) statusCell.innerHTML = `<span class="badge" style="background:#fffbeb; color:#d97706; font-weight:700;">⏳ SEBAGIAN (Sisa ${formatCurrency(remainingAfter)})</span>`;
                } else {
                    if (statusCell) statusCell.innerHTML = `<span class="badge" style="background:#fff1f2; color:#e11d48;">BELUM LUNAS</span>`;
                }
            } else {
                inputEl.value = 0;
                inputEl.disabled = !chk.checked;
                if (statusCell) statusCell.innerHTML = `<span class="badge" style="background:#fff1f2; color:#e11d48;">BELUM LUNAS</span>`;
            }
        });

        // Update Summary Footer
        const summaryInEl = document.getElementById('summary-total-in');
        const summaryUsedEl = document.getElementById('summary-total-used');
        if (summaryInEl) summaryInEl.textContent = formatCurrency(totalIn);
        if (summaryUsedEl) summaryUsedEl.textContent = formatCurrency(totalUsed);

        const diff = Math.round((totalIn - totalUsed) * 100) / 100;
        const diffBadge = document.getElementById('summary-diff-badge');
        if (diffBadge) {
            if (Math.abs(diff) < 0.5) {
                diffBadge.style.background = '#ecfdf5';
                diffBadge.style.color = '#059669';
                diffBadge.textContent = 'Alokasi Pas (Sisa Rp 0)';
            } else if (diff > 0) {
                diffBadge.style.background = '#fef3c7';
                diffBadge.style.color = '#b45309';
                diffBadge.textContent = `Ada Sisa Uang: ${formatCurrency(diff)}`;
            } else {
                diffBadge.style.background = '#fee2e2';
                diffBadge.style.color = '#dc2626';
                diffBadge.textContent = `Kekurangan Uang: ${formatCurrency(Math.abs(diff))}`;
            }
        }
    };

    window.handleManualAllocInput = (changedTxId) => {
        let totalUsed = 0;
        const rowInputs = document.querySelectorAll('.alloc-row-input');
        rowInputs.forEach(inputEl => {
            const txId = inputEl.dataset.txId;
            const val = parseFloat(inputEl.value) || 0;
            const maxRemaining = parseFloat(inputEl.dataset.max) || 0;
            const statusCell = document.getElementById(`status-cell-${txId}`);

            totalUsed = Math.round((totalUsed + val) * 100) / 100;
            const remainingAfter = Math.max(0, Math.round((maxRemaining - val) * 100) / 100);

            if (remainingAfter <= 0.01) {
                if (statusCell) statusCell.innerHTML = `<span class="badge" style="background:#ecfdf5; color:#059669; font-weight:700;">✓ LUNAS</span>`;
            } else if (val > 0) {
                if (statusCell) statusCell.innerHTML = `<span class="badge" style="background:#fffbeb; color:#d97706; font-weight:700;">⏳ SEBAGIAN (Sisa ${formatCurrency(remainingAfter)})</span>`;
            } else {
                if (statusCell) statusCell.innerHTML = `<span class="badge" style="background:#fff1f2; color:#e11d48;">BELUM LUNAS</span>`;
            }
        });

        const totalPayInput = document.getElementById('bulk-total-pay');
        const totalIn = parseFloat(totalPayInput.value) || 0;

        const summaryInEl = document.getElementById('summary-total-in');
        const summaryUsedEl = document.getElementById('summary-total-used');
        if (summaryInEl) summaryInEl.textContent = formatCurrency(totalIn);
        if (summaryUsedEl) summaryUsedEl.textContent = formatCurrency(totalUsed);

        const diff = Math.round((totalIn - totalUsed) * 100) / 100;
        const diffBadge = document.getElementById('summary-diff-badge');
        if (diffBadge) {
            if (Math.abs(diff) < 0.5) {
                diffBadge.style.background = '#ecfdf5';
                diffBadge.style.color = '#059669';
                diffBadge.textContent = 'Alokasi Pas (Sisa Rp 0)';
            } else if (diff > 0) {
                diffBadge.style.background = '#fef3c7';
                diffBadge.style.color = '#b45309';
                diffBadge.textContent = `Ada Sisa Uang: ${formatCurrency(diff)}`;
            } else {
                diffBadge.style.background = '#fee2e2';
                diffBadge.style.color = '#dc2626';
                diffBadge.textContent = `Alokasi Melebihi Uang Masuk (${formatCurrency(Math.abs(diff))})`;
            }
        }
    };

    document.getElementById('bulk-total-pay').addEventListener('input', window.recalculateBulkAllocations);
    window.recalculateBulkAllocations();

    // Form submission
    document.getElementById('form-bulk-allocation').addEventListener('submit', async (e) => {
        e.preventDefault();
        const payDate = document.getElementById('bulk-pay-date').value;
        const payMethod = document.getElementById('bulk-pay-method').value;
        const payNote = document.getElementById('bulk-pay-note').value.trim();

        if (!payDate) {
            alert('Tanggal pembayaran wajib diisi!');
            return;
        }

        const allocationsToApply = [];
        const rowInputs = document.querySelectorAll('.alloc-row-input');
        rowInputs.forEach(inputEl => {
            const txId = inputEl.dataset.txId;
            const allocVal = parseFloat(inputEl.value) || 0;
            if (allocVal > 0) {
                allocationsToApply.push({ txId, amount: allocVal });
            }
        });

        if (allocationsToApply.length === 0) {
            alert('Belum ada nominal pembayaran yang dialokasikan ke transaksi!');
            return;
        }

        const currentData = getData();
        const batchCode = 'BATCH-' + Date.now();

        for (const alloc of allocationsToApply) {
            const targetTx = currentData.transactions.find(t => t.id === alloc.txId);
            if (targetTx) {
                const currentPayments = Array.isArray(targetTx.payments) 
                    ? [...targetTx.payments] 
                    : (typeof targetTx.payments === 'string' && targetTx.payments.trim() ? JSON.parse(targetTx.payments) : []);

                const newPaymentEntry = {
                    id: 'PAY-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
                    batchId: batchCode,
                    date: payDate,
                    amount: alloc.amount,
                    method: payMethod,
                    note: payNote ? payNote : 'Alokasi Pembayaran Masuk (FIFO)',
                    createdAt: new Date().toISOString()
                };

                currentPayments.push(newPaymentEntry);
                const newTotalPaid = currentPayments.reduce((acc, p) => acc + (parseFloat(p.amount) || 0), 0);
                const totalTxAmount = parseFloat(targetTx.totalAmount || targetTx.totalamount) || 0;
                const newStatus = (newTotalPaid >= totalTxAmount - 0.5) ? 'Lunas' : 'Sebagian';

                targetTx.payments = currentPayments;
                targetTx.paidAmount = newTotalPaid;
                targetTx.status = newStatus;
                targetTx.paidAt = payDate;
                targetTx.paymentMethod = payMethod;
                targetTx.paymentNote = payNote;

                const supabaseItem = {
                    id: targetTx.id,
                    date: targetTx.date,
                    buyerid: targetTx.buyerId || targetTx.buyerid,
                    driverid: targetTx.driverId || targetTx.driverid,
                    totalamount: targetTx.totalAmount || targetTx.totalamount,
                    operationalexpense: targetTx.operationalExpense || targetTx.operationalexpense,
                    retributionexpense: targetTx.retributionExpense || targetTx.retributionexpense,
                    status: newStatus,
                    paid_amount: newTotalPaid,
                    paid_at: payDate,
                    payment_method: payMethod,
                    payment_note: payNote,
                    payments: JSON.stringify(currentPayments),
                    sales: targetTx.sales,
                    expenses: targetTx.expenseDetails || targetTx.expenses
                };

                await saveData(currentData, 'transactions', supabaseItem);
            }
        }

        closeModal();
        render_penagihan();
        showToast(`✅ Berhasil mencatat pembayaran untuk ${allocationsToApply.length} transaksi ${buyerName}!`);
    });
};

// --- Modal Riwayat Pembayaran & Edit / Hapus Cicilan ---
window.openPaymentHistoryModal = (txId, buyerId) => {
    const data = getData();
    const tx = (data.transactions || []).find(t => t.id === txId);
    if (!tx) return;

    const buyer = (data.buyers || []).find(b => b.id === (buyerId || tx.buyerId));
    const buyerName = buyer ? buyer.name : 'Pembeli';
    const payInfo = getTransactionPaymentInfo(tx, buyerId);

    const historyHtml = `
        <div style="background: #f8fafc; border: 1px solid var(--border-color); border-radius: 8px; padding: 0.85rem 1.1rem; margin-bottom: 1.25rem;">
            <div style="font-weight: 700; color: #0f172a; font-size: 0.95rem; margin-bottom: 0.35rem; display: flex; align-items: center; gap: 0.4rem;">
                <span class="material-symbols-outlined" style="font-size: 20px; color: var(--primary-color);">history</span>
                Riwayat Pembayaran Transaksi
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; font-size: 0.85rem; color: #374151;">
                <div><strong>Pembeli:</strong> ${buyerName}</div>
                <div><strong>Tanggal Transaksi:</strong> ${formatDate(tx.date)}</div>
                <div><strong>Total Tagihan:</strong> ${formatCurrency(payInfo.total)}</div>
                <div><strong>Total Terbayar:</strong> <span style="color: #16a34a; font-weight: 700;">${formatCurrency(payInfo.paid)}</span></div>
                <div><strong>Sisa Piutang:</strong> <span style="color: ${payInfo.remaining > 0 ? '#dc2626' : '#16a34a'}; font-weight: 700;">${formatCurrency(payInfo.remaining)}</span></div>
                <div><strong>Status:</strong> ${payInfo.status === 'Lunas' ? '<span class="badge" style="background:#ecfdf5; color:#059669; font-weight:bold;">LUNAS</span>' : payInfo.status === 'Sebagian' ? '<span class="badge" style="background:#fffbeb; color:#d97706; font-weight:bold;">SEBAGIAN</span>' : '<span class="badge" style="background:#fff1f2; color:#e11d48; font-weight:bold;">BELUM LUNAS</span>'}</div>
            </div>
        </div>

        <div style="margin-bottom: 0.75rem; display: flex; justify-content: space-between; align-items: center;">
            <h4 style="margin: 0; font-size: 0.9rem; color: #1e293b;">Rincian Pembayaran Masuk:</h4>
            ${payInfo.remaining > 0 ? `
                <button class="btn btn-sm" style="background: #10b981; color: white; padding: 0.25rem 0.6rem; font-size: 0.75rem;" onclick="closeModal(); openPaymentModal('${txId}', '${buyerId}')">
                    + Tambah Pembayaran / Cicilan
                </button>
            ` : ''}
        </div>

        <div style="max-height: 250px; overflow-y: auto; border: 1px solid var(--border-color); border-radius: 8px; margin-bottom: 1.5rem;">
            <table class="table" style="margin: 0; font-size: 0.85rem;">
                <thead style="background: #f1f5f9; position: sticky; top: 0;">
                    <tr>
                        <th style="width: 30px; text-align: center;">No</th>
                        <th>Tanggal Bayar</th>
                        <th style="text-align: right;">Nominal</th>
                        <th>Metode</th>
                        <th>Catatan</th>
                        <th style="width: 50px; text-align: center;">Aksi</th>
                    </tr>
                </thead>
                <tbody>
                    ${payInfo.payments.length === 0 ? `
                        <tr>
                            <td colspan="6" style="text-align: center; color: #64748b; padding: 1.5rem;">
                                ${tx.status === 'Lunas' ? `Pembayaran tercatat lunas (${formatDate(tx.paidAt)} via ${tx.paymentMethod || 'Tunai'})` : 'Belum ada riwayat pembayaran yang tercatat.'}
                            </td>
                        </tr>
                    ` : payInfo.payments.map((p, idx) => `
                        <tr>
                            <td style="text-align: center;">${idx + 1}</td>
                            <td style="font-weight: 600;">${formatDate(p.date)}</td>
                            <td style="text-align: right; font-weight: 700; color: #16a34a;">${formatCurrency(p.amount)}</td>
                            <td>${p.method || '-'}</td>
                            <td style="color: #64748b; font-style: italic;">${p.note || '-'}</td>
                            <td style="text-align: center;">
                                <button class="btn btn-sm btn-danger" style="padding: 0.15rem 0.35rem; font-size: 0.7rem;" onclick="window.deletePaymentEntry('${txId}', '${p.id}', '${buyerId}')" title="Hapus Riwayat Cicilan Ini">
                                    <span class="material-symbols-outlined" style="font-size: 14px;">delete</span>
                                </button>
                            </td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>

        <div class="form-actions">
            <button type="button" class="btn btn-primary" onclick="closeModal()">Tutup</button>
        </div>
    `;

    openModal('Rincian & Riwayat Pembayaran', historyHtml, '850px');
};

// --- Hapus Item Cicilan Spesifik ---
window.deletePaymentEntry = async (txId, paymentId, buyerId) => {
    if (!confirm('Apakah Anda yakin ingin menghapus catatan pembayaran ini? Saldo tagihan akan dikembalikan.')) {
        return;
    }

    const currentData = getData();
    const targetTx = currentData.transactions.find(t => t.id === txId);
    if (!targetTx) return;

    let currentPayments = Array.isArray(targetTx.payments) 
        ? [...targetTx.payments] 
        : (typeof targetTx.payments === 'string' && targetTx.payments.trim() ? JSON.parse(targetTx.payments) : []);

    currentPayments = currentPayments.filter(p => p.id !== paymentId);

    const newTotalPaid = currentPayments.reduce((acc, p) => acc + (parseFloat(p.amount) || 0), 0);
    const totalTxAmount = parseFloat(targetTx.totalAmount) || 0;
    const newStatus = (newTotalPaid >= totalTxAmount - 0.5 && totalTxAmount > 0) 
        ? 'Lunas' 
        : (newTotalPaid > 0 ? 'Sebagian' : 'Belum Lunas');

    const lastP = currentPayments.length > 0 ? currentPayments[currentPayments.length - 1] : null;

    targetTx.payments = currentPayments;
    targetTx.paidAmount = newTotalPaid;
    targetTx.status = newStatus;
    targetTx.paidAt = lastP ? lastP.date : null;
    targetTx.paymentMethod = lastP ? lastP.method : null;
    targetTx.paymentNote = lastP ? lastP.note : null;

    const supabaseItem = {
        id: targetTx.id,
        date: targetTx.date,
        buyerid: targetTx.buyerId,
        driverid: targetTx.driverId,
        totalamount: targetTx.totalAmount,
        operationalexpense: targetTx.operationalExpense,
        retributionexpense: targetTx.retributionExpense,
        status: newStatus,
        paid_amount: newTotalPaid,
        paid_at: targetTx.paidAt,
        payment_method: targetTx.paymentMethod,
        payment_note: targetTx.paymentNote,
        payments: JSON.stringify(currentPayments),
        sales: targetTx.sales,
        expenses: targetTx.expenseDetails
    };

    await saveData(currentData, 'transactions', supabaseItem);
    render_penagihan();
    openPaymentHistoryModal(txId, buyerId);
    showToast('Catatan pembayaran berhasil dihapus.');
};

// --- Batalkan Semua Pembayaran Transaksi (Reset to Belum Lunas) ---
window.cancelPayment = async (txId) => {
    if (!confirm('Apakah Anda yakin ingin membatalkan seluruh pembayaran transaksi ini dan mengembalikannya ke BELUM LUNAS?')) {
        return;
    }

    const currentData = getData();
    const targetTx = currentData.transactions.find(t => t.id === txId);
    if (targetTx) {
        targetTx.status = 'Belum Lunas';
        targetTx.paidAmount = 0;
        targetTx.paidAt = null;
        targetTx.paymentMethod = null;
        targetTx.paymentNote = null;
        targetTx.payments = [];

        const supabaseItem = {
            id: targetTx.id,
            date: targetTx.date,
            buyerid: targetTx.buyerId,
            driverid: targetTx.driverId,
            totalamount: targetTx.totalAmount,
            operationalexpense: targetTx.operationalExpense,
            retributionexpense: targetTx.retributionExpense,
            status: 'Belum Lunas',
            paid_amount: 0,
            paid_at: null,
            payment_method: null,
            payment_note: null,
            payments: JSON.stringify([]),
            sales: targetTx.sales,
            expenses: targetTx.expenseDetails
        };

        await saveData(currentData, 'transactions', supabaseItem);
        render_penagihan();
        showToast('Status transaksi dikembalikan ke BELUM LUNAS');
    }
};

// --- Cetak Invoice & Rekap Piutang Terintegrasi ---
window.printTagihan = (buyerId) => {
    const data = getData();
    const buyer = (data.buyers || []).find(b => b.id === buyerId);
    if (!buyer) return;

    const startEl = document.getElementById('filter-penagihan-start');
    const endEl = document.getElementById('filter-penagihan-end');
    const statusEl = document.getElementById('filter-penagihan-status');
    const startDate = startEl ? startEl.value : '';
    const endDate = endEl ? endEl.value : '';
    const filterStatus = statusEl ? statusEl.value : '';

    const segments = [];
    (data.transactions || []).forEach(t => {
        if (startDate && t.date < startDate) return;
        if (endDate && t.date > endDate) return;

        const info = getTransactionPaymentInfo(t, buyerId);
        if (filterStatus && info.status !== filterStatus) return;

        let txSales = [];
        if (Array.isArray(t.sales)) {
            txSales = t.sales;
        } else if (typeof t.sales === 'string' && t.sales.trim()) {
            try { txSales = JSON.parse(t.sales); } catch(e){}
        }

        if (txSales && txSales.length > 0) {
            txSales.forEach(s => {
                const bId = s.buyerId || t.buyerId || t.buyerid;
                if (bId === buyerId) {
                    segments.push({
                        txId: t.id,
                        date: t.date,
                        amount: parseFloat(s.total) || 0,
                        qty: parseFloat(s.qty) || 0,
                        driverCount: s.driverCount || 1,
                        status: info.status,
                        paidAmount: info.paid,
                        remainingAmount: info.remaining,
                        paidAt: info.lastPayment?.date,
                        paymentMethod: info.lastPayment?.method,
                        paymentNote: info.lastPayment?.note
                    });
                }
            });
        } else if (t.buyerId === buyerId || t.buyerid === buyerId) {
            segments.push({
                txId: t.id,
                date: t.date,
                amount: parseFloat(t.totalAmount || t.totalamount) || 0,
                qty: parseFloat(t.qty) || 0,
                driverCount: 1,
                status: info.status,
                paidAmount: info.paid,
                remainingAmount: info.remaining,
                paidAt: info.lastPayment?.date,
                paymentMethod: info.lastPayment?.method,
                paymentNote: info.lastPayment?.note
            });
        }
    });

    segments.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    const totalSales = segments.reduce((sum, s) => sum + s.amount, 0);
    const totalPaid = segments.reduce((sum, s) => sum + s.paidAmount, 0);
    const totalUnpaid = segments.reduce((sum, s) => sum + s.remainingAmount, 0);

    const periodText = (startDate || endDate) 
        ? `Periode: ${startDate ? formatDate(startDate) : '-'} s.d ${endDate ? formatDate(endDate) : '-'}` 
        : 'Seluruh Riwayat Transaksi';

    let html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Cetak Tagihan / Invoice - ${buyer.name}</title>
            <style>
                body { font-family: 'Inter', Arial, sans-serif; color: #1e293b; line-height: 1.3; padding: 20px; font-size: 13px; background: white; }
                .header { text-align: center; margin-bottom: 20px; padding-bottom: 10px; border-bottom: 2px solid #e2e8f0; }
                .header h1 { margin: 0 0 5px 0; font-size: 22px; color: #0f172a; }
                .info-table { width: 100%; margin-bottom: 15px; }
                .info-table td { padding: 3px 0; }
                .data-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
                .data-table th, .data-table td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; }
                .data-table th { background: #f8fafc; font-weight: 600; color: #475569; }
                .text-right { text-align: right !important; }
                .text-center { text-align: center !important; }
                .badge-lunas { color: #059669; font-weight: bold; background: #ecfdf5; padding: 2px 6px; border-radius: 4px; border: 1px solid #a7f3d0; font-size: 11px; }
                .badge-sebagian { color: #d97706; font-weight: bold; background: #fffbeb; padding: 2px 6px; border-radius: 4px; border: 1px solid #fde68a; font-size: 11px; }
                .badge-belum { color: #e11d48; font-weight: bold; background: #fff1f2; padding: 2px 6px; border-radius: 4px; border: 1px solid #fecdd3; font-size: 11px; }
                .total-row th { background: #f8fafc; font-size: 14px; color: #0f172a; padding: 8px 10px; }
                @media print {
                    body { -webkit-print-color-adjust: exact; padding: 0; }
                    .no-print { display: none; }
                }
            </style>
        </head>
        <body>
            <div class="no-print" style="margin-bottom:20px; text-align:right;">
                <button onclick="window.print()" style="padding:10px 20px; background:#10b981; color:white; border:none; border-radius:5px; cursor:pointer; font-weight:bold; font-size: 14px;">🖨️ Cetak Sekarang</button>
            </div>
            
            <div class="header">
                <img src="${window.location.origin}/HEADER%20RESEP.png" alt="Header CV RESEP" style="width: 100%; max-width: 800px; height: auto; display: block; margin: 0 auto 15px auto;">
                <h1 style="font-size: 20px;">INVOICE & REKAP PIUTANG</h1>
                <p style="margin:0; color:#64748b;">${periodText}</p>
            </div>

            <table class="info-table">
                <tr>
                    <td style="width: 120px; color:#64748b;">Kepada Yth.</td>
                    <td style="font-weight: bold; font-size: 15px;">: ${buyer.name}</td>
                </tr>
                <tr>
                    <td style="color:#64748b;">Alamat</td>
                    <td>: ${buyer.address || '-'}</td>
                </tr>
                <tr>
                    <td style="color:#64748b;">Tanggal Cetak</td>
                    <td>: ${formatDate()}</td>
                </tr>
            </table>

            <table class="data-table">
                <thead>
                    <tr>
                        <th style="width: 35px;" class="text-center">No</th>
                        <th style="width: 15%;">Tanggal</th>
                        <th>Keterangan</th>
                        <th class="text-center" style="width: 12%;">Volume</th>
                        <th class="text-right" style="width: 15%;">Tagihan (Rp)</th>
                        <th class="text-right" style="width: 15%;">Terbayar (Rp)</th>
                        <th class="text-right" style="width: 15%;">Sisa Piutang</th>
                        <th class="text-center" style="width: 12%;">Status</th>
                    </tr>
                </thead>
                <tbody>
    `;

    let no = 1;
    if (segments.length === 0) {
        html += `<tr><td colspan="8" class="text-center" style="padding: 20px; color:#64748b;">Tidak ada rincian transaksi</td></tr>`;
    }

    segments.forEach(s => {
        const isLunas = s.status === 'Lunas';
        const isPartial = s.status === 'Sebagian';
        const badgeClass = isLunas ? 'badge-lunas' : isPartial ? 'badge-sebagian' : 'badge-belum';
        const statusText = isLunas ? 'LUNAS' : isPartial ? 'SEBAGIAN' : 'BELUM LUNAS';
        const subInfo = (isLunas || isPartial) && s.paidAt ? `<div style="font-size: 10px; color: #64748b;">${formatDate(s.paidAt)}</div>` : '';

        html += `
            <tr>
                <td class="text-center">${no++}</td>
                <td>${formatDate(s.date)}</td>
                <td>Penjualan Batu (${s.driverCount || 1} Sopir)${s.paymentNote ? ` - <small style="color:#475569;">${s.paymentNote}</small>` : ''}</td>
                <td class="text-center">${s.qty.toLocaleString('id-ID')} ${buyer.unit || 'unit'}</td>
                <td class="text-right">${formatCurrency(s.amount)}</td>
                <td class="text-right" style="color: #059669; font-weight: 600;">${formatCurrency(s.paidAmount)}</td>
                <td class="text-right" style="color: ${s.remainingAmount > 0 ? '#dc2626' : '#64748b'}; font-weight: ${s.remainingAmount > 0 ? 'bold' : 'normal'};">${formatCurrency(s.remainingAmount)}</td>
                <td class="text-center">
                    <span class="${badgeClass}">${statusText}</span>
                    ${subInfo}
                </td>
            </tr>
        `;
    });

    html += `
                </tbody>
                <tfoot>
                    <tr class="total-row">
                        <th colspan="4" class="text-right">TOTAL TAGIHAN :</th>
                        <th class="text-right" colspan="4">${formatCurrency(totalSales)}</th>
                    </tr>
                    <tr class="total-row">
                        <th colspan="4" class="text-right" style="color: #059669;">TOTAL PEMBAYARAN MASUK (TERBAYAR) :</th>
                        <th class="text-right" style="color: #059669;" colspan="4">${formatCurrency(totalPaid)}</th>
                    </tr>
                    <tr class="total-row">
                        <th colspan="4" class="text-right" style="color: #dc2626;">SISA PIUTANG BERSIH :</th>
                        <th class="text-right" style="color: #dc2626; font-size: 15px;" colspan="4">${formatCurrency(totalUnpaid)}</th>
                    </tr>
                </tfoot>
            </table>

            <div style="margin-top: 30px; text-align: right; padding-right: 50px;">
                <p style="margin-bottom: 60px; color:#64748b;">Hormat Kami,</p>
                <p style="font-weight: bold; border-bottom: 1px solid #1e293b; display: inline-block; padding-bottom: 2px;">CV. RESEP</p>
            </div>
        </body>
        </html>
    `;

    const printWin = window.open('', '_blank');
    if (printWin) {
        printWin.document.open();
        printWin.document.write(html);
        printWin.document.close();
        printWin.focus();
        setTimeout(() => printWin.print(), 500);
    } else {
        alert('Browser memblokir popup. Izinkan popup untuk mencetak tagihan.');
    }
};

window.printRekapSolar = () => {
    const data = getData();
    const startEl = document.getElementById('filter-solar-start');
    const endEl = document.getElementById('filter-solar-end');
    const filterSelect = document.getElementById('filter-solar-supplier');

    const startDate = startEl ? startEl.value : '';
    const endDate = endEl ? endEl.value : '';
    const activeSupplierFilter = filterSelect ? filterSelect.value : '';

    // 1. Get calculated FIFO solar records
    const solarRecords = getCalculatedSolarRecords(data);

    // Filter by Date Range and Supplier
    let filteredRecords = solarRecords.filter(s => {
        if (startDate && s.date < startDate) return false;
        if (endDate && s.date > endDate) return false;
        if (activeSupplierFilter && (s.supplier || 'LAINNYA').toUpperCase().trim() !== activeSupplierFilter) return false;
        return true;
    });

    // Sort chronological (ascending) for reporting & running balance
    filteredRecords.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Calculate totals & stats
    let totalMasuk = 0;
    let totalKeluar = 0;
    const supplierStats = {};

    filteredRecords.forEach(s => {
        const sup = (s.supplier || 'LAINNYA').toUpperCase().trim();
        if (!supplierStats[sup]) supplierStats[sup] = { masuk: 0, keluar: 0, sisa: 0 };
        if (s.type === 'Masuk') {
            totalMasuk += s.amount;
            supplierStats[sup].masuk += s.amount;
        } else if (s.type === 'Keluar') {
            totalKeluar += s.amount;
            supplierStats[sup].keluar += s.amount;
        }
    });

    Object.keys(supplierStats).forEach(sup => {
        supplierStats[sup].sisa = supplierStats[sup].masuk - supplierStats[sup].keluar;
    });
    const totalSaldo = totalMasuk - totalKeluar;

    const periodText = (startDate || endDate)
        ? `Periode: ${startDate ? formatDate(startDate) : '-'} s.d ${endDate ? formatDate(endDate) : '-'}`
        : 'Seluruh Periode';
    const supplierText = activeSupplierFilter ? `Pemasok: ${activeSupplierFilter}` : 'Semua Pemasok';

    let runningBalance = 0;
    let rowsHtml = '';
    if (filteredRecords.length === 0) {
        rowsHtml = `<tr><td colspan="6" class="text-center" style="padding: 20px; color:#64748b;">Tidak ada transaksi data solar pada rentang filter ini.</td></tr>`;
    } else {
        filteredRecords.forEach((s, idx) => {
            const masuk = s.type === 'Masuk' ? s.amount : 0;
            const keluar = s.type === 'Keluar' ? s.amount : 0;
            runningBalance += (masuk - keluar);

            rowsHtml += `
                <tr>
                    <td class="text-center">${idx + 1}</td>
                    <td>${formatDate(s.date)}</td>
                    <td style="font-weight: 600;">${(s.supplier || '-').toUpperCase()}</td>
                    <td class="text-right" style="color: #166534; font-weight: ${masuk > 0 ? '600' : 'normal'};">${masuk > 0 ? masuk.toLocaleString('id-ID') : '-'}</td>
                    <td class="text-right" style="color: #991b1b; font-weight: ${keluar > 0 ? '600' : 'normal'};">${keluar > 0 ? keluar.toLocaleString('id-ID') : '-'}</td>
                    <td class="text-right" style="font-weight: bold; color: ${runningBalance >= 0 ? '#0f172a' : '#b91c1c'};">${runningBalance.toLocaleString('id-ID')}</td>
                </tr>
            `;
        });
    }

    // Supplier summary cards in print
    let supCardsHtml = '';
    Object.keys(supplierStats).sort().forEach(sup => {
        const st = supplierStats[sup];
        supCardsHtml += `
            <div style="flex: 1; min-width: 140px; border: 1px solid #cbd5e1; border-radius: 4px; padding: 6px 10px; background: #f8fafc; font-size: 12px;">
                <div style="font-weight: bold; color: #334155; margin-bottom: 2px;">Stok ${sup}</div>
                <div style="font-size: 14px; font-weight: bold; color: ${st.sisa >= 0 ? '#0f766e' : '#b91c1c'};">${st.sisa.toLocaleString('id-ID')} Liter</div>
                <div style="font-size: 11px; color: #64748b;">Msk: ${st.masuk.toLocaleString('id-ID')}L | Kel: ${st.keluar.toLocaleString('id-ID')}L</div>
            </div>
        `;
    });

    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Cetak Rekapitulasi Solar</title>
            <style>
                body { font-family: 'Inter', Arial, sans-serif; color: #1e293b; line-height: 1.2; padding: 20px; font-size: 13px; background: white; }
                .header { text-align: center; margin-bottom: 15px; padding-bottom: 8px; border-bottom: 2px solid #e2e8f0; }
                .header h1 { margin: 0 0 4px 0; font-size: 20px; color: #0f172a; }
                .info-table { width: 100%; margin-bottom: 12px; }
                .info-table td { padding: 2px 0; font-size: 13px; }
                .data-table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
                .data-table th, .data-table td { border: 1px solid #cbd5e1; padding: 5px 8px; text-align: left; }
                .data-table th { background: #f8fafc; font-weight: 600; color: #475569; }
                .text-right { text-align: right !important; }
                .text-center { text-align: center !important; }
                .total-row th { background: #f1f5f9; font-size: 14px; color: #0f172a; padding: 6px 8px; }
                @media print {
                    body { -webkit-print-color-adjust: exact; padding: 0; }
                    .no-print { display: none; }
                }
            </style>
        </head>
        <body>
            <div class="no-print" style="margin-bottom:20px; text-align:right;">
                <button onclick="window.print()" style="padding:8px 18px; background:#10b981; color:white; border:none; border-radius:5px; cursor:pointer; font-weight:bold; font-size: 13px;">🖨️ Cetak Sekarang</button>
            </div>
            
            <div class="header">
                <img src="${window.location.origin}/HEADER%20RESEP.png" alt="Header CV RESEP" style="width: 100%; max-width: 800px; height: auto; display: block; margin: 0 auto 12px auto;">
                <h1>REKAPITULASI PEMAKAIAN & STOK SOLAR</h1>
                <p style="margin:0; color:#64748b; font-size: 13px;">${periodText} | ${supplierText}</p>
            </div>

            <table class="info-table">
                <tr>
                    <td style="width: 120px; color:#64748b;">Tanggal Cetak</td>
                    <td style="font-weight: 600;">: ${formatDate()}</td>
                    <td style="text-align: right; color:#64748b;">Total Data: <strong>${filteredRecords.length} Transaksi</strong></td>
                </tr>
            </table>

            <table class="data-table">
                <thead>
                    <tr>
                        <th style="width: 40px;" class="text-center">No</th>
                        <th style="width: 120px;">Tanggal</th>
                        <th>Pemasok</th>
                        <th style="width: 110px;" class="text-right">Masuk (L)</th>
                        <th style="width: 110px;" class="text-right">Keluar (L)</th>
                        <th style="width: 120px;" class="text-right">Saldo (L)</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
                <tfoot>
                    <tr class="total-row">
                        <th colspan="3" class="text-right">TOTAL :</th>
                        <th class="text-right" style="color: #166534;">+ ${totalMasuk.toLocaleString('id-ID')}</th>
                        <th class="text-right" style="color: #991b1b;">- ${totalKeluar.toLocaleString('id-ID')}</th>
                        <th class="text-right" style="color: ${totalSaldo >= 0 ? '#0f766e' : '#b91c1c'};">${totalSaldo.toLocaleString('id-ID')}</th>
                    </tr>
                </tfoot>
            </table>

            <div style="margin-top: 15px; margin-bottom: 20px;">
                <div style="font-weight: bold; font-size: 12px; color: #475569; margin-bottom: 6px; text-transform: uppercase;">Ringkasan Stok Per Pemasok (Periode Ini):</div>
                <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                    ${supCardsHtml || '<div style="font-size:12px; color:#94a3b8;">-</div>'}
                </div>
            </div>

            <div style="margin-top: 30px; display: flex; justify-content: space-between; padding: 0 40px;">
                <div style="text-align: center;">
                    <p style="margin-bottom: 50px; color:#64748b; font-size: 13px;">Petugas Lapangan,</p>
                    <p style="font-weight: bold; border-bottom: 1px solid #1e293b; display: inline-block; padding-bottom: 2px; min-width: 120px;">( &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; )</p>
                </div>
                <div style="text-align: center;">
                    <p style="margin-bottom: 50px; color:#64748b; font-size: 13px;">Hormat Kami,</p>
                    <p style="font-weight: bold; border-bottom: 1px solid #1e293b; display: inline-block; padding-bottom: 2px;">CV. RESEP</p>
                </div>
            </div>
        </body>
        </html>
    `;

    const printWin = window.open('', '_blank');
    if (printWin) {
        printWin.document.open();
        printWin.document.write(html);
        printWin.document.close();
        printWin.focus();
        setTimeout(() => printWin.print(), 500);
    } else {
        alert('Browser memblokir popup. Izinkan popup untuk mencetak rekapitulasi.');
    }
};

// --- Excel Import / Export ---

window.exportPenjualanExcel = () => {
    if (!window.XLSX) { alert('Pustaka Excel belum siap, coba lagi sebentar.'); return; }
    const data = getData();

    // --- Sheet 1: Penjualan ---
    const penjHeaders = ['Tanggal', 'Nama Pembeli', 'Jumlah Sopir', 'Qty', 'Harga Satuan', 'Total Penjualan'];
    const penjRows = [];
    data.transactions.forEach(tx => {
        (tx.sales || []).forEach(s => {
            const buyer = data.buyers.find(b => b.id === s.buyerId);
            const unitPrice = s.qty > 0 ? Math.round(s.total / s.qty) : 0;
            penjRows.push([
                tx.date,
                buyer ? buyer.name : '',
                s.driverCount || 1,
                s.qty,
                unitPrice,
                s.total
            ]);
        });
    });

    // --- Sheet 2: Pengeluaran ---
    const expHeaders = ['Tanggal', 'Jenis Pengeluaran', 'Kategori', 'Qty', 'Total'];
    const expRows = [];
    data.transactions.forEach(tx => {
        (tx.expenseDetails || []).forEach(d => {
            let category = d.category;
            let name = d.name;
            if (!category && d.expenseId) {
                const expType = data.expenseTypes.find(e => e.id === d.expenseId);
                if (expType) {
                    category = expType.category;
                    name = expType.name;
                }
            } else if (!category) {
                category = 'Operasional'; // Fallback for old manual expenses
            }

            expRows.push([
                tx.date,
                name || 'Manual',
                category || 'Operasional',
                d.qty,
                d.amount
            ]);
        });
    });

    const wb = XLSX.utils.book_new();

    const ws1 = XLSX.utils.aoa_to_sheet([penjHeaders, ...penjRows]);
    // Set column widths
    ws1['!cols'] = [{ wch: 12 }, { wch: 22 }, { wch: 12 }, { wch: 8 }, { wch: 15 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'Penjualan');

    const ws2 = XLSX.utils.aoa_to_sheet([expHeaders, ...expRows]);
    ws2['!cols'] = [{ wch: 12 }, { wch: 25 }, { wch: 14 }, { wch: 8 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Pengeluaran');

    const today = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `penjualan_${today}.xlsx`);
    showToast('File Excel berhasil diunduh!');
};

window.downloadPenjualanTemplate = () => {
    if (!window.XLSX) { alert('Pustaka Excel belum siap, coba lagi sebentar.'); return; }

    // --- Sheet 1: Penjualan ---
    const penjHeaders = ['Tanggal', 'Nama Pembeli', 'Jumlah Sopir', 'Qty', 'Harga Satuan', 'Total Penjualan'];
    const penjExample = [
        ['2026-04-15', 'Nama Pembeli Contoh', 1, 10.5, 50000, 525000],
        ['2026-04-15', 'Nama Pembeli Lain', 1, 5, 60000, 300000]
    ];

    // --- Sheet 2: Pengeluaran ---
    const expHeaders = ['Tanggal', 'Jenis Pengeluaran', 'Kategori', 'Qty', 'Total'];
    const expExample = [
        ['2026-04-15', 'Solar Excavator', 'Operasional', 20, 150000],
        ['2026-04-15', 'Retribusi Desa', 'Retribusi', 1, 50000]
    ];

    const wb = XLSX.utils.book_new();

    const ws1 = XLSX.utils.aoa_to_sheet([penjHeaders, ...penjExample]);
    ws1['!cols'] = [{ wch: 12 }, { wch: 22 }, { wch: 12 }, { wch: 8 }, { wch: 15 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'Penjualan');

    const ws2 = XLSX.utils.aoa_to_sheet([expHeaders, ...expExample]);
    ws2['!cols'] = [{ wch: 12 }, { wch: 25 }, { wch: 14 }, { wch: 8 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Pengeluaran');

    XLSX.writeFile(wb, `template_import_penjualan.xlsx`);
    showToast('Template Import berhasil diunduh!');
};

window.importPenjualanExcel = (input) => {
    if (!window.XLSX) { alert('Pustaka Excel belum siap.'); return; }
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const wb = XLSX.read(e.target.result, { type: 'binary', cellDates: false });
            const data = getData();

            // --- Parse Sheet Penjualan ---
            const ws1 = wb.Sheets['Penjualan'];
            if (!ws1) { alert('Sheet "Penjualan" tidak ditemukan di file Excel!'); return; }
            const penjRows = XLSX.utils.sheet_to_json(ws1, { header: 1, defval: '' });

            // --- Parse Sheet Pengeluaran ---
            const ws2 = wb.Sheets['Pengeluaran'];
            const expRows = ws2 ? XLSX.utils.sheet_to_json(ws2, { header: 1, defval: '' }) : [];

            // Group penjualan rows by date
            const txByDate = {};
            const penjData = penjRows.slice(1); // skip header
            penjData.forEach(row => {
                const [date, buyerName, driverCount, qty, unitPrice, total] = row;
                if (!date || !buyerName) return;

                // Normalize date (Excel serial or string)
                let dateStr = typeof date === 'number'
                    ? XLSX.SSF.format('yyyy-mm-dd', date)
                    : String(date).trim();

                // Find or create buyer
                let buyer = data.buyers.find(b => b.name.toLowerCase() === String(buyerName).toLowerCase().trim());
                if (!buyer) {
                    buyer = { id: generateId(), name: String(buyerName).trim(), category: 'Umum', unit: 'Ritase', unitPrice: 0 };
                    data.buyers.push(buyer);
                }

                if (!txByDate[dateStr]) txByDate[dateStr] = { sales: [], expenseDetails: [] };
                txByDate[dateStr].sales.push({
                    buyerId: buyer.id,
                    qty: parseFloat(qty) || 0,
                    total: parseFloat(total) || 0,
                    driverCount: parseInt(driverCount) || 1
                });
            });

            // Group expenses by date
            const expData = expRows.slice(1);
            expData.forEach(row => {
                const [date, expName, category, qty, total] = row;
                if (!date || !expName) return;

                let dateStr = typeof date === 'number'
                    ? XLSX.SSF.format('yyyy-mm-dd', date)
                    : String(date).trim();

                let expType = data.expenseTypes.find(e => e.name.toLowerCase() === String(expName).toLowerCase().trim());
                if (!expType) {
                    const cat = String(category || 'Operasional').trim();
                    expType = { id: generateId(), name: String(expName).trim(), category: cat, unit: '', basePrice: 0 };
                    data.expenseTypes.push(expType);
                }

                if (!txByDate[dateStr]) txByDate[dateStr] = { sales: [], expenseDetails: [] };
                txByDate[dateStr].expenseDetails.push({
                    expenseId: expType.id,
                    qty: parseFloat(qty) || 0,
                    amount: parseFloat(total) || 0
                });
            });

            // Build and upsert transactions
            let added = 0, updated = 0;
            Object.entries(txByDate).forEach(([date, txData]) => {
                const totalAmount = txData.sales.reduce((s, r) => s + r.total, 0);
                const totalOps = txData.expenseDetails
                    .filter(d => {
                        const et = data.expenseTypes.find(e => e.id === d.expenseId);
                        return et && et.category === 'Operasional';
                    })
                    .reduce((s, d) => s + d.amount, 0);
                const totalRet = txData.expenseDetails
                    .filter(d => {
                        const et = data.expenseTypes.find(e => e.id === d.expenseId);
                        return et && et.category === 'Retribusi';
                    })
                    .reduce((s, d) => s + d.amount, 0);

                const existing = data.transactions.find(t => t.date === date);
                const tx = {
                    id: existing ? existing.id : generateId(),
                    date,
                    sales: txData.sales,
                    totalAmount,
                    operationalExpense: totalOps,
                    retributionExpense: totalRet,
                    expenseDetails: txData.expenseDetails,
                    status: existing ? existing.status : 'Belum Lunas',
                    createdAt: existing ? existing.createdAt : new Date().toISOString()
                };

                if (existing) {
                    const idx = data.transactions.findIndex(t => t.date === date);
                    data.transactions[idx] = tx;
                    updated++;
                } else {
                    data.transactions.push(tx);
                    added++;
                }
            });

            // Sort transactions by date desc
            data.transactions.sort((a, b) => b.date.localeCompare(a.date));
            saveData(data);
            render_penjualan();
            showToast(`Import selesai: ${added} baru, ${updated} diperbarui`);
        } catch (err) {
            alert('Gagal membaca file Excel: ' + err.message);
            console.error(err);
        } finally {
            input.value = ''; // Reset input
        }
    };
    reader.readAsBinaryString(file);
};

// --- Laporan ---
window.render_laporan = () => {
    const data = getData();
    const container = document.querySelector('#laporan .card-body');

    // Default to current week: Monday to Sunday
    const today = new Date();
    const dayOfWeek = today.getDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    const monday = new Date(today);
    monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const lastWeek = monday; // "from" date

    container.innerHTML = `
        <div class="d-flex" style="gap:1rem; margin-bottom:1.5rem; background:var(--bg-color); padding:1.25rem; border-radius:var(--radius-lg); flex-wrap:wrap">
            <div class="form-group" style="margin:0; flex:1; min-width:200px">
                <label style="margin-bottom:0.25rem;">Dari Tanggal</label>
                <input type="date" id="filter-start" class="form-control" value="${lastWeek.toISOString().split('T')[0]}">
            </div>
            <div class="form-group" style="margin:0; flex:1; min-width:200px">
                <label style="margin-bottom:0.25rem;">Sampai Tanggal</label>
                <input type="date" id="filter-end" class="form-control" value="${sunday.toISOString().split('T')[0]}">
            </div>
            <div class="d-flex align-center" style="margin-top:1.25rem; gap: 0.75rem;">
                <button class="btn btn-primary" id="btn-filter-laporan" style="padding:0.625rem 1.5rem">
                    <span class="material-symbols-outlined" style="font-size:18px; vertical-align:middle">bar_chart</span>
                    Tampilkan Laporan
                </button>
                <button class="btn" onclick="openQuickPotonganModal()" style="padding:0.625rem 1.5rem; background:#f43f5e; color:white; border:none; border-radius:var(--radius-md); display:flex; align-items:center; gap:0.4rem; cursor:pointer; font-weight:500;">
                    <span class="material-symbols-outlined" style="font-size:18px">content_cut</span>
                    Tambah Potongan
                </button>
            </div>
        </div>
        <div id="laporan-result"></div>
    `;

    // Populate the Quick Setoran dropdown
    const reportSetoranType = document.getElementById('report-setoran-type');
    if (reportSetoranType) {
        reportSetoranType.innerHTML = '<option value="">-- Pilih Jenis --</option>' +
            data.expenseTypes.map(e => `<option value="${e.id}">${e.name}</option>`).join('');
    }

    window.generateLaporan = () => {
        const start = document.getElementById('filter-start').value;
        const end = document.getElementById('filter-end').value;
        const res = document.getElementById('laporan-result');

        if (!start || !end) return;

        const filtered = data.transactions.filter(t => t.date >= start && t.date <= end);

        // --- DATA AGGREGATION (Grouped by Name + Price) ---

        // 1. Income
        const incomeGroups = [];
        filtered.forEach(tx => {
            tx.sales.forEach(s => {
                const price = s.qty > 0 ? s.total / s.qty : 0;
                // Find existing group for the same buyer AND price
                let group = incomeGroups.find(g => g.buyerId === s.buyerId && Math.abs(g.price - price) < 1);
                if (!group) {
                    const b = data.buyers.find(x => x.id === s.buyerId);
                    group = { buyerId: s.buyerId, name: b ? b.name : 'Umum', price: price, qty: 0, total: 0 };
                    incomeGroups.push(group);
                }
                group.qty += s.qty;
                group.total += s.total;
            });
        });

        // 2. Ops Expenses - look up name and category
        const opsGroups = [];
        filtered.forEach(tx => {
            (tx.expenseDetails || []).forEach(d => {
                let category = d.category;
                let name = d.name;
                if (!category && d.expenseId) {
                    const expType = data.expenseTypes.find(e => e.id === d.expenseId);
                    if (expType) {
                        category = expType.category;
                        name = expType.name;
                    }
                } else if (!category) {
                    category = 'Operasional'; // Fallback for old manual expenses
                }

                if (category !== 'Operasional') return;

                const price = d.qty > 0 ? d.amount / d.qty : 0;
                let group = opsGroups.find(g => g.name === name && Math.abs(g.price - price) < 1);
                if (!group) {
                    group = { name: name || 'Manual', price: price, qty: 0, total: 0 };
                    opsGroups.push(group);
                }
                group.qty += d.qty;
                group.total += d.amount;
            });
        });

        // 3. Retri Expenses - look up name and category
        const retGroups = [];
        filtered.forEach(tx => {
            (tx.expenseDetails || []).forEach(d => {
                let category = d.category;
                let name = d.name;
                if (!category && d.expenseId) {
                    const expType = data.expenseTypes.find(e => e.id === d.expenseId);
                    if (expType) {
                        category = expType.category;
                        name = expType.name;
                    }
                }

                if (category !== 'Retribusi') return;

                const price = d.qty > 0 ? d.amount / d.qty : 0;
                let group = retGroups.find(g => g.name === name && Math.abs(g.price - price) < 1);
                if (!group) {
                    group = { name: name || 'Manual', price: price, qty: 0, total: 0 };
                    retGroups.push(group);
                }
                group.qty += d.qty;
                group.total += d.amount;
            });
        });

        // 4. Potongan - Filter where deduction range overlaps with report range
        const filteredDeductions = (data.deductions || []).filter(p => {
            const pStart = p.dateStart || p.date; // Fallback for old data
            const pEnd = p.dateEnd || p.date;
            return pStart <= end && pEnd >= start;
        });

        // Totals
        const totalIncome = incomeGroups.reduce((sum, g) => sum + g.total, 0);

        // 1b. Rincian Setoran Aggregation
        const setoranAgg = { hargaBatu: 0, lainnya: [] };
        // Base Harga Batu still comes from sales (since it's volume-based)
        filtered.forEach(tx => {
            if (tx.sales) {
                tx.sales.forEach(s => setoranAgg.hargaBatu += (s.hargaBatu || (s.unitPrice * (s.qty || 0)) || 0));
            }
        });

        // Other Setoran: list from registered Daftar Setoran, amounts summed from expenseDetails in transactions
        const registeredTypeIds = [...new Set((data.settlements || []).map(s => s.expenseTypeId))];
        registeredTypeIds.forEach(typeId => {
            const expType = data.expenseTypes.find(e => e.id === typeId);
            if (!expType) return;

            // Always sum from expenseDetails — works for both Operasional and Retribusi
            let total = 0;
            filtered.forEach(tx => {
                (tx.expenseDetails || []).forEach(d => {
                    if (d.expenseId === typeId) total += (d.amount || 0);
                });
            });

            setoranAgg.lainnya.push({ name: expType.name, total });
        });

        // 2. Operational Expense
        const totalOps = opsGroups.reduce((sum, g) => sum + g.total, 0);
        const totalRet = retGroups.reduce((sum, g) => sum + g.total, 0);
        const totalDeductions = filteredDeductions.reduce((sum, p) => sum + p.amount, 0);

        // Net Profit (Based on image calculation: Income - Ops - Retri)
        const netProfitValue = totalIncome - totalOps - totalRet;
        // Final Net (After Potongan)
        const finalNet = netProfitValue - totalDeductions;

        // Date formatting for header
        const dStart = new Date(start);
        const dEnd = new Date(end);
        const monthNames = ["JANUARI", "FEBRUARI", "MARET", "APRIL", "MEI", "JUNI", "JULI", "AGUSTUS", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DESEMBER"];
        const monthName = monthNames[dStart.getMonth()];

        res.innerHTML = `
            <style>
                .report-body { font-family: Arial, sans-serif; color: #000; padding: 20px; background: #fff; max-width: 850px; margin: 0 auto; line-height: 1.2; }
                .report-title { text-align: center; font-weight: bold; font-size: 18px; margin-bottom: 20px; text-transform: uppercase; }
                .period-table { width: 100%; border: 2px solid #000; border-collapse: collapse; margin-bottom: 20px; }
                .period-table td { border: 1px solid #000; padding: 5px 10px; font-weight: bold; text-align: center; }
                .bg-blue { background-color: #4472c4; color: #fff; }
                
                .data-table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
                .data-table th { border-top: 2px solid #000; border-bottom: 2px solid #000; padding: 5px 8px; text-align: left; font-size: 13px; font-weight: bold; }
                .data-table td { padding: 4px 8px; font-size: 13px; }
                .summary-row td { border-top: 2px solid #000; border-bottom: 2px solid #000; font-weight: bold; padding: 8px; }
                .net-profit-box { border: 2px solid #000; font-weight: bold; font-size: 15px; display: flex; justify-content: space-between; padding: 10px; margin-top: 5px; }
                
                .text-right { text-align: right !important; }
                .text-center { text-align: center !important; }
                
                .potongan-page { break-before: page; margin-top: 40px; border-top: 1px dashed #ccc; padding-top: 40px; }
                
                .btn-export { margin-bottom: 20px; }
                @media print {
                    .no-print { display: none !important; }
                    .report-body { padding: 0; width: 100%; max-width: none; border: none; }
                    .potongan-page { border-top: none; }
                    @page { margin: 1cm; }
                }
            </style>

            <div class="btn-export no-print">
                <button class="btn btn-primary" onclick="printLaporanPDF()" style="background:#0ea5e9">
                    <span class="material-symbols-outlined">download</span> Ekspor ke PDF
                </button>
            </div>

            <div class="report-body" id="printable-report">
                <!-- PAGE 1: MAIN REPORT -->
                <div class="report-title">LAPORAN MINGGUAN TAMBANG BATU</div>
                
                <table class="period-table">
                    <tr class="bg-blue">
                        <td width="30%">BULAN</td>
                        <td width="70%">${monthName}</td>
                    </tr>
                    <tr>
                        <td>TANGGAL</td>
                        <td>${dStart.getDate()} &nbsp;&nbsp;&nbsp; - &nbsp;&nbsp;&nbsp; ${dEnd.getDate()}</td>
                    </tr>
                </table>

                <table class="data-table">
                    <thead>
                        <tr>
                            <th width="45%">PENDAPATAN</th>
                            <th width="10%" class="text-center">QTY</th>
                            <th width="20%" class="text-right">HARGA</th>
                            <th width="25%" class="text-right">TOTAL</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${incomeGroups.length === 0 ? '<tr><td colspan="4" class="text-center">Tidak ada pendapatan</td></tr>' : ''}
                        ${incomeGroups.map(g => `
                        <tr>
                            <td>JUAL ${g.name.toUpperCase()}</td>
                            <td class="text-center">${g.qty > 0 ? (g.qty % 1 === 0 ? g.qty : g.qty.toFixed(2).replace('.', ',')) : ''}</td>
                            <td class="text-right">${g.price > 0 ? g.price.toLocaleString('id-ID') : ''}</td>
                            <td class="text-right">${g.total.toLocaleString('id-ID')}</td>
                        </tr>`).join('')}
                        <tr class="summary-row">
                            <td colspan="3">TOTAL PENDAPATAN</td>
                            <td class="text-right">${totalIncome.toLocaleString('id-ID')}</td>
                        </tr>
                    </tbody>
                </table>

                <table class="data-table">
                    <thead>
                        <tr>
                            <th>PENGELUARAN OPERASIONAL</th>
                            <th class="text-center">QTY</th>
                            <th class="text-right">HARGA</th>
                            <th class="text-right">TOTAL</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${opsGroups.length === 0 ? '<tr><td colspan="4" class="text-center">Tidak ada pengeluaran ops</td></tr>' : ''}
                        ${opsGroups.map(g => `
                        <tr>
                            <td>${g.name}</td>
                            <td class="text-center">${g.qty > 0 ? (g.qty % 1 === 0 ? g.qty : g.qty.toFixed(2).replace('.', ',')) : ''}</td>
                            <td class="text-right">${g.price > 0 ? g.price.toLocaleString('id-ID') : ''}</td>
                            <td class="text-right">${g.total.toLocaleString('id-ID')}</td>
                        </tr>`).join('')}
                        <tr class="summary-row">
                            <td colspan="3">TOTAL PENGELUARAN OPR</td>
                            <td class="text-right">${totalOps.toLocaleString('id-ID')}</td>
                        </tr>
                    </tbody>

                    <thead>
                        <tr>
                            <th>PENGELUARAN RETRIBUSI</th>
                            <th class="text-center">QTY</th>
                            <th class="text-right">HARGA</th>
                            <th class="text-right">TOTAL</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${retGroups.length === 0 ? '<tr><td colspan="4" class="text-center">Tidak ada pengeluaran retri</td></tr>' : ''}
                        ${retGroups.map(g => `
                        <tr>
                            <td>${g.name}</td>
                            <td class="text-center">${g.qty > 0 ? (g.qty % 1 === 0 ? g.qty : g.qty.toFixed(2).replace('.', ',')) : ''}</td>
                            <td class="text-right">${g.price > 0 ? g.price.toLocaleString('id-ID') : ''}</td>
                            <td class="text-right">${g.total.toLocaleString('id-ID')}</td>
                        </tr>`).join('')}
                        <tr class="summary-row">
                            <td colspan="3">TOTAL PENGELUARAN RETRI</td>
                            <td class="text-right">${totalRet.toLocaleString('id-ID')}</td>
                        </tr>
                    </tbody>
                </table>

                <div class="net-profit-box">
                    <div style="width: 75%; text-align: center;">NET PROFIT</div>
                    <div style="width: 25%; text-align: right;">${netProfitValue.toLocaleString('id-ID')}</div>
                </div>



                <!-- PAGE 2: SETORAN & POTONGAN (Separate Page) -->
                <div class="potongan-page">
                    <div class="report-title">RINCIAN SETORAN & POTONGAN</div>
                    <table class="period-table">
                        <tr class="bg-blue">
                            <td width="30%">PERIODE</td>
                            <td width="70%">${formatDate(start)} - ${formatDate(end)}</td>
                        </tr>
                    </table>

                    <!-- Table 1: Setoran -->
                    <table class="data-table" style="margin-top: 20px;">
                        <thead>
                            <tr>
                                <th colspan="2">RINCIAN SETORAN</th>
                                <th class="text-right">TOTAL</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td colspan="2">NET PROFIT</td>
                                <td class="text-right">${netProfitValue.toLocaleString('id-ID')}</td>
                            </tr>
                            ${setoranAgg.lainnya.map(l => `
                            <tr>
                                <td colspan="2">${l.name.toUpperCase()}</td>
                                <td class="text-right">${l.total.toLocaleString('id-ID')}</td>
                            </tr>`).join('')}
                            <tr class="summary-row">
                                <td colspan="2">TOTAL SETORAN (A)</td>
                                <td class="text-right">${(netProfitValue + setoranAgg.lainnya.reduce((acc, l) => acc + l.total, 0)).toLocaleString('id-ID')}</td>
                            </tr>
                        </tbody>
                    </table>
                    
                    <!-- Table 2: Potongan -->
                    <table class="data-table" style="margin-top: 20px;">
                        <thead>
                            <tr>
                                <th width="25%">TANGGAL</th>
                                <th width="55%">KETERANGAN POTONGAN</th>
                                <th width="20%" class="text-right">JUMLAH</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${filteredDeductions.length === 0 ? '<tr><td colspan="3" class="text-center">Tidak ada potongan</td></tr>' :
                filteredDeductions.map(p => {
                    const buyer = data.buyers.find(b => b.id === p.buyerId);
                    const buyerInfo = buyer ? ` (${buyer.name})` : '';
                    return `
                                <tr>
                                    <td>${p.dateStart && p.dateEnd ? `${formatDate(p.dateStart)} - ${formatDate(p.dateEnd)}` : formatDate(p.date)}</td>
                                    <td>${p.jenis || 'Lainnya'}${buyerInfo} - ${p.description}</td>
                                    <td class="text-right">${p.amount.toLocaleString('id-ID')}</td>
                                </tr>`;
                }).join('')}
                            <tr class="summary-row">
                                <td colspan="2" class="text-right">TOTAL POTONGAN (B)</td>
                                <td class="text-right">${totalDeductions.toLocaleString('id-ID')}</td>
                            </tr>
                        </tbody>
                    </table>
                    
                    <div class="net-profit-box" style="margin-top: 30px; background: #f8fafc; border: 2px solid #000;">
                        <div style="width: 75%; text-align: center;">SISA PENDAPATAN AKHIR (NET PROFIT + A - B)</div>
                        <div style="width: 25%; text-align: right; color: #166534;">${(netProfitValue + setoranAgg.lainnya.reduce((acc, l) => acc + l.total, 0) - totalDeductions).toLocaleString('id-ID')}</div>
                    </div>
                    

                </div>
            </div>
        `;
    };

    document.getElementById('btn-filter-laporan').addEventListener('click', window.generateLaporan);
};

window.addQuickSetoran = () => {
    const expenseTypeId = document.getElementById('report-setoran-type').value;
    if (!expenseTypeId) {
        alert('Silakan pilih jenis setoran!');
        return;
    }

    const data = getData();
    if (!data.settlements) data.settlements = [];

    // Prevent duplicate
    const exists = data.settlements.some(s => s.expenseTypeId === expenseTypeId);
    if (exists) {
        showToast('Jenis setoran ini sudah terdaftar');
        return;
    }

    data.settlements.push({ id: generateId(), expenseTypeId });
    saveData(data);
    showToast('Jenis setoran berhasil didaftarkan');

    // Refresh report
    if (window.generateLaporan) window.generateLaporan();
};

// Tambah Potongan Cepat dari halaman Laporan Mingguan
window.openQuickPotonganModal = () => {
    // Ambil tanggal dari filter laporan jika tersedia, atau default ke minggu ini
    const startEl = document.getElementById('filter-start');
    const endEl = document.getElementById('filter-end');

    let start, end;
    if (startEl && startEl.value && endEl && endEl.value) {
        start = startEl.value;
        end = endEl.value;
    } else {
        // Default: minggu ini (Senin - Minggu)
        const today = new Date();
        const dayOfWeek = today.getDay();
        const monday = new Date(today);
        monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        start = monday.toISOString().split('T')[0];
        end = sunday.toISOString().split('T')[0];
    }

    bulkPotRows = [];
    openBulkPotonganModal(start, end);

    // Setelah modal ditutup, perbarui laporan jika terbuka
    const origClose = window.closeModal;
    window.closeModal = () => {
        origClose();
        window.closeModal = origClose;
        if (window.generateLaporan) window.generateLaporan();
    };
};

// ==========================================
// BULK ACTIONS LOGIC
// ==========================================

function initBulkDeleteListeners() {
    const bulkConfigs = [
        { type: 'penjualan', tableId: 'table-penjualan-list', cacheKey: 'transactions', supabaseTable: 'transactions', renderFn: 'render_penjualan' },
        { type: 'pembeli', tableId: 'table-pembeli', cacheKey: 'buyers', supabaseTable: 'buyers', renderFn: 'render_pembeli' },
        { type: 'sopir', tableId: 'table-sopir', cacheKey: 'drivers', supabaseTable: 'drivers', renderFn: 'render_sopir' },
        { type: 'pengeluaran', tableId: 'table-pengeluaran', cacheKey: 'expenseTypes', supabaseTable: 'expense_types', renderFn: 'render_pengeluaran' },
        { type: 'setoran', tableId: 'table-setoran', cacheKey: 'settlements', supabaseTable: 'settlements', renderFn: 'render_potongan' },
        { type: 'potongan', tableId: 'table-potongan', cacheKey: 'deductions', supabaseTable: 'deductions', renderFn: 'render_potongan' }
    ];

    bulkConfigs.forEach(config => {
        const checkAll = document.getElementById(`check-all-${config.type}`);
        const btnBulk = document.getElementById(`btn-bulk-delete-${config.type}`);

        if (checkAll) {
            checkAll.addEventListener('change', (e) => {
                const isChecked = e.target.checked;
                const checkboxes = document.querySelectorAll(`.check-${config.type}`);
                checkboxes.forEach(cb => cb.checked = isChecked);
                updateBulkDeleteButton(config.type);
            });
        }

        if (btnBulk) {
            btnBulk.addEventListener('click', () => {
                const checkboxes = document.querySelectorAll(`.check-${config.type}:checked`);
                const selectedIds = Array.from(checkboxes).map(cb => cb.dataset.id);

                if (selectedIds.length === 0) return;

                if (confirm(`Apakah Anda yakin ingin menghapus ${selectedIds.length} data terpilih?`)) {
                    executeBulkDelete(config, selectedIds);
                }
            });
        }
    });

    // Global listener for individual checkboxes (Efficiency via delegation)
    document.addEventListener('change', (e) => {
        if (e.target.classList.contains('check-penjualan') || 
            e.target.classList.contains('check-pembeli') || 
            e.target.classList.contains('check-sopir') || 
            e.target.classList.contains('check-pengeluaran') || 
            e.target.classList.contains('check-setoran') || 
            e.target.classList.contains('check-potongan')) {
            
            const type = e.target.className.replace('check-', '');
            updateBulkDeleteButton(type);
        }
    });
}

function updateBulkDeleteButton(type) {
    const btn = document.getElementById(`btn-bulk-delete-${type}`);
    const checkAll = document.getElementById(`check-all-${type}`);
    if (!btn) return;

    const checkedCount = document.querySelectorAll(`.check-${type}:checked`).length;
    const totalCount = document.querySelectorAll(`.check-${type}`).length;

    if (checkedCount > 0) {
        btn.style.display = 'flex';
        btn.style.alignItems = 'center';
    } else {
        btn.style.display = 'none';
    }

    if (checkAll) {
        checkAll.checked = checkedCount > 0 && checkedCount === totalCount;
        checkAll.indeterminate = checkedCount > 0 && checkedCount < totalCount;
    }
}

async function executeBulkDelete(config, ids) {
    const data = getData();
    
    // Update Cache
    data[config.cacheKey] = data[config.cacheKey].filter(item => !ids.includes(item.id));
    saveData(data); // Local storage update

    // Turso Delete
        // Database Delete
    try {
        for (const id of ids) {
            await deleteFromDatabase(config.supabaseTable, id);
        }
        console.log(`✅ Berhasil hapus bulk dari Turso (${config.supabaseTable})`);
    } catch (e) {
        console.error(`❌ Gagal hapus bulk dari Turso (${config.supabaseTable}):`, e);
        alert(`Beberapa data mungkin gagal dihapus dari cloud, silakan refresh.`);
    }

    // Reset Check All
    const checkAll = document.getElementById(`check-all-${config.type}`);
    if (checkAll) checkAll.checked = false;

    // Refresh UI
    if (window[config.renderFn]) {
        window[config.renderFn]();
    }
    
    updateBulkDeleteButton(config.type);
}

// --- SOLAR MANAGEMENT ---
// --- SOLAR MANAGEMENT ---
window.saveSolarSupplierToDatabase = async (name) => {
    if (!name || !name.trim() || name === '__NEW__' || name === '-') return;
    const cleanName = name.trim().toUpperCase();
    const data = getData();
    if (!data.solarSuppliers) data.solarSuppliers = [];

    let existing = data.solarSuppliers.find(s => (typeof s === 'string' ? s : s.name).toUpperCase() === cleanName);
    let item;
    if (existing) {
        item = typeof existing === 'string' ? { id: generateId(), name: cleanName, created_at: new Date().toISOString() } : existing;
    } else {
        item = {
            id: generateId(),
            name: cleanName,
            created_at: new Date().toISOString()
        };
        data.solarSuppliers.push(item);
    }

    try {
        await saveData(data, 'solar_suppliers', {
            id: item.id,
            name: item.name,
            created_at: item.created_at || new Date().toISOString()
        });
        console.log(`✅ Pemasok solar "${cleanName}" tersimpan ke database.`);
    } catch (err) {
        console.error("Gagal menyimpan supplier ke database:", err);
    }
    return item;
};

function getAllSolarSuppliers(data) {
    const supSet = new Set();
    (data.solarSuppliers || []).forEach(s => {
        const name = typeof s === 'string' ? s : s.name;
        if (name && name.trim()) supSet.add(name.trim().toUpperCase());
    });
    (data.solar || []).forEach(s => {
        if (s.supplier && s.supplier.trim()) supSet.add(s.supplier.trim().toUpperCase());
    });
    (data.expenseTypes || []).forEach(e => {
        if (e.linkedSolarSupplier && e.linkedSolarSupplier.trim()) {
            supSet.add(e.linkedSolarSupplier.trim().toUpperCase());
        }
    });
    if (data.solarRowOverrides) {
        Object.values(data.solarRowOverrides).forEach(sup => {
            if (sup && sup.trim()) supSet.add(sup.trim().toUpperCase());
        });
    }
    if (data.solarDateOverrides) {
        Object.values(data.solarDateOverrides).forEach(sup => {
            if (sup && sup.trim()) supSet.add(sup.trim().toUpperCase());
        });
    }
    return Array.from(supSet).sort();
}

window.handleTableSolarSupplierChange = async (selectEl, id, isAuto, date) => {
    let chosenSupplier = selectEl.value;
    if (chosenSupplier === '__NEW__') {
        const input = prompt('Masukkan Nama Pemasok Solar Baru (Contoh: PT. PERTAMINA, MAS SEPTA, PERTAMINA DEX):');
        if (!input || !input.trim()) {
            selectEl.value = selectEl.getAttribute('data-prev-val') || '';
            return;
        }
        chosenSupplier = input.trim().toUpperCase();
    }

    // Save new supplier to database
    await window.saveSolarSupplierToDatabase(chosenSupplier);

    const data = getData();

    if (isAuto) {
        // Save override ONLY for this specific row ID
        if (!data.solarRowOverrides) data.solarRowOverrides = {};
        data.solarRowOverrides[id] = chosenSupplier;
        
        const overrideItem = {
            id: `row-${id}`,
            date: date,
            supplier: chosenSupplier,
            created_at: new Date().toISOString()
        };
        await saveData(data, 'solar_overrides', overrideItem);
        render_solar();
    } else {
        if (!data.solar) data.solar = [];
        const index = data.solar.findIndex(s => s.id === id);
        if (index > -1) {
            data.solar[index].supplier = chosenSupplier;
            const solarItem = {
                id: data.solar[index].id,
                date: data.solar[index].date,
                type: data.solar[index].type,
                amount: parseFloat(data.solar[index].amount) || 0,
                description: data.solar[index].description || '',
                supplier: chosenSupplier,
                created_at: data.solar[index].created_at || new Date().toISOString()
            };
            data.solar[index] = solarItem;
            await saveData(data, 'solar', solarItem);
            render_solar();
        }
    }
};

window.openAddSolarSupplierModal = () => {
    const data = getData();
    const solarExpenses = (data.expenseTypes || []).filter(e => 
        (e.name && e.name.toUpperCase().includes('SOLAR')) || e.linkedSolarSupplier
    );

    let expenseCheckboxes = '';
    if (solarExpenses.length > 0) {
        expenseCheckboxes = `
            <div class="form-group" style="margin-top: 1rem; border-top: 1px dashed #e2e8f0; padding-top: 0.75rem;">
                <label style="font-size: 0.85rem; font-weight: 600; color: #475569;">Hubungkan Pengeluaran Otomatis (Opsional):</label>
                <div style="display: flex; flex-direction: column; gap: 0.4rem; margin-top: 0.25rem;">
                    ${solarExpenses.map(exp => `
                        <label style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; font-weight: normal; cursor: pointer;">
                            <input type="checkbox" name="linked_solar_exp" value="${exp.id}">
                            <span>${exp.name} ${exp.linkedSolarSupplier ? `<small style="color:#64748b;">(Saat ini: ${exp.linkedSolarSupplier})</small>` : ''}</span>
                        </label>
                    `).join('')}
                </div>
            </div>
        `;
    }

    const formHtml = `
        <form id="form-add-supplier" autocomplete="off">
            <div class="form-group">
                <label>Nama Pemasok Solar <span style="color:var(--danger)">*</span></label>
                <input type="text" id="new-solar-supplier-name" class="form-control" placeholder="Contoh: PT. PERTAMINA, MAS SEPTA, A" required oninput="this.value = this.value.toUpperCase()">
            </div>
            <div class="form-group">
                <label>Stok Awal / Beli Solar (Liter) <small style="color:#64748b;">(Opsional, isi jika ada pengisian awal)</small></label>
                <input type="number" id="new-solar-initial-stock" class="form-control" step="0.01" placeholder="0" value="0">
            </div>
            <div class="form-group">
                <label>Tanggal Masuk</label>
                <input type="date" id="new-solar-date" class="form-control" value="${new Date().toISOString().split('T')[0]}">
            </div>
            <div class="form-group">
                <label>Keterangan</label>
                <input type="text" id="new-solar-supplier-desc" class="form-control" value="STOK AWAL PEMASOK" oninput="this.value = this.value.toUpperCase()">
            </div>
            ${expenseCheckboxes}
            <div class="form-actions" style="margin-top: 1.5rem;">
                <button type="button" class="btn" onclick="closeModal()">Batal</button>
                <button type="submit" class="btn btn-primary">Simpan Pemasok</button>
            </div>
        </form>
    `;

    openModal('Tambah Pemasok Solar', formHtml);

    document.getElementById('form-add-supplier').addEventListener('submit', async (e) => {
        e.preventDefault();
        const supplierName = document.getElementById('new-solar-supplier-name').value.trim().toUpperCase();
        if (!supplierName) {
            alert('Nama pemasok wajib diisi!');
            return;
        }

        // Save supplier to database
        await window.saveSolarSupplierToDatabase(supplierName);

        const initialStock = parseFloat(document.getElementById('new-solar-initial-stock').value) || 0;
        const date = document.getElementById('new-solar-date').value || new Date().toISOString().split('T')[0];
        const desc = document.getElementById('new-solar-supplier-desc').value.trim().toUpperCase();

        const currentData = getData();
        if (!currentData.solar) currentData.solar = [];

        // If initial stock > 0, create initial solar transaction
        if (initialStock > 0) {
            const solarItem = {
                id: generateId(),
                date: date,
                supplier: supplierName,
                type: 'Masuk',
                amount: initialStock,
                description: desc || 'STOK AWAL PEMASOK',
                created_at: new Date().toISOString()
            };
            currentData.solar.push(solarItem);
            await saveData(currentData, 'solar', solarItem);
        }

        // Link any selected expense types to this new supplier
        const checkedBoxes = document.querySelectorAll('input[name="linked_solar_exp"]:checked');
        for (const cb of checkedBoxes) {
            const expId = cb.value;
            const expIndex = (currentData.expenseTypes || []).findIndex(exp => exp.id === expId);
            if (expIndex > -1) {
                currentData.expenseTypes[expIndex].linkedSolarSupplier = supplierName;
                const item = currentData.expenseTypes[expIndex];
                const supabaseItem = {
                    id: item.id,
                    name: item.name,
                    category: item.category,
                    nature: item.nature,
                    unit: item.unit,
                    baseprice: item.basePrice,
                    sort_order: item.order,
                    linked_buyer_id: item.linkedBuyerId,
                    linked_solar_supplier: item.linkedSolarSupplier
                };
                await saveData(currentData, 'expense_types', supabaseItem);
            }
        }

        closeModal();
        if (window.render_solar) window.render_solar();
        if (window.render_pengeluaran) window.render_pengeluaran();
        alert(`Pemasok "${supplierName}" berhasil disimpan ke database!`);
    });
};

window.openBulkUpdateSolarSupplierModal = () => {
    const data = getData();
    const suppliers = getAllSolarSuppliers(data);
    const startFilter = document.getElementById('filter-solar-start') ? document.getElementById('filter-solar-start').value : '';
    const endFilter = document.getElementById('filter-solar-end') ? document.getElementById('filter-solar-end').value : '';
    const today = new Date().toISOString().split('T')[0];

    const defaultStart = startFilter || today;
    const defaultEnd = endFilter || today;

    let supplierOptions = '';
    suppliers.forEach(sup => {
        supplierOptions += `<option value="${sup}">${sup}</option>`;
    });
    supplierOptions += `<option value="__NEW__">+ Tambah Pemasok Baru...</option>`;

    const formHtml = `
        <form id="form-bulk-solar-supplier" autocomplete="off">
            <div style="background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 0.75rem 1rem; margin-bottom: 1.25rem; font-size: 0.85rem; color: #0369a1;">
                <div style="font-weight: 700; display: flex; align-items: center; gap: 0.4rem; margin-bottom: 0.25rem;">
                    <span class="material-symbols-outlined" style="font-size: 18px;">info</span>
                    Ubah Pemasok Rentang Tanggal
                </div>
                Pilih rentang tanggal dan nama pemasok. Semua transaksi solar (pembelian masuk & pemakaian) dalam rentang tanggal tersebut akan diperbarui ke pemasok yang dipilih dan disinkronkan ke database.
            </div>

            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem;">
                <div class="form-group">
                    <label>Tanggal Mulai <span style="color:var(--danger)">*</span></label>
                    <input type="date" id="bulk-start-date" class="form-control" value="${defaultStart}" required>
                </div>
                <div class="form-group">
                    <label>Tanggal Akhir <span style="color:var(--danger)">*</span></label>
                    <input type="date" id="bulk-end-date" class="form-control" value="${defaultEnd}" required>
                </div>
            </div>

            <div class="form-group">
                <label>Pilih Pemasok Baru <span style="color:var(--danger)">*</span></label>
                <select id="bulk-supplier-select" class="form-control" onchange="handleBulkSupplierDropdownChange(this)" required>
                    <option value="">-- Pilih Pemasok --</option>
                    ${supplierOptions}
                </select>
            </div>

            <div class="form-group" id="bulk-new-supplier-group" style="display: none;">
                <label>Nama Pemasok Baru <span style="color:var(--danger)">*</span></label>
                <input type="text" id="bulk-new-supplier-name" class="form-control" placeholder="Contoh: PT. PERTAMINA, MAS SEPTA, A" oninput="this.value = this.value.toUpperCase()">
            </div>

            <div class="form-actions" style="margin-top: 1.5rem;">
                <button type="button" class="btn" onclick="closeModal()">Batal</button>
                <button type="submit" class="btn btn-primary" style="background: #0284c7;">
                    <span class="material-symbols-outlined">sync</span> Terapkan Perubahan Pemasok
                </button>
            </div>
        </form>
    `;

    openModal('Ubah Pemasok Rentang Tanggal', formHtml);

    document.getElementById('form-bulk-solar-supplier').addEventListener('submit', async (e) => {
        e.preventDefault();
        const startDate = document.getElementById('bulk-start-date').value;
        const endDate = document.getElementById('bulk-end-date').value;
        const supplierSelect = document.getElementById('bulk-supplier-select').value;
        let chosenSupplier = supplierSelect;

        if (supplierSelect === '__NEW__') {
            const newNameInput = document.getElementById('bulk-new-supplier-name').value.trim().toUpperCase();
            if (!newNameInput) {
                alert('Silakan masukkan nama pemasok baru!');
                return;
            }
            chosenSupplier = newNameInput;
        }

        if (!startDate || !endDate) {
            alert('Tanggal mulai dan tanggal akhir wajib diisi!');
            return;
        }

        if (startDate > endDate) {
            alert('Tanggal mulai tidak boleh melebihi tanggal akhir!');
            return;
        }

        if (!chosenSupplier) {
            alert('Pemasok wajib dipilih!');
            return;
        }

        // Save new supplier to database if not existing
        await window.saveSolarSupplierToDatabase(chosenSupplier);

        const currentData = getData();

        // 1. Update all manual solar items in range & persist each to Turso
        if (currentData.solar) {
            for (let i = 0; i < currentData.solar.length; i++) {
                const s = currentData.solar[i];
                if (s.date >= startDate && s.date <= endDate) {
                    s.supplier = chosenSupplier;
                    const cleanItem = {
                        id: s.id,
                        date: s.date,
                        type: s.type,
                        amount: parseFloat(s.amount) || 0,
                        description: s.description || '',
                        supplier: chosenSupplier,
                        created_at: s.created_at || new Date().toISOString()
                    };
                    currentData.solar[i] = cleanItem;
                    await saveData(currentData, 'solar', cleanItem);
                }
            }
        }

        // 2. Clear individual row overrides in range from database & memory
        if (!currentData.solarDateOverrides) currentData.solarDateOverrides = {};
        if (currentData.solarRowOverrides) {
            const rowsToDelete = [];
            Object.keys(currentData.solarRowOverrides).forEach(rowId => {
                const parts = rowId.split('-');
                if (parts.length >= 4) {
                    const rowDate = `${parts[1]}-${parts[2]}-${parts[3]}`;
                    if (rowDate >= startDate && rowDate <= endDate) {
                        rowsToDelete.push(rowId);
                        delete currentData.solarRowOverrides[rowId];
                    }
                }
            });
            for (const rowId of rowsToDelete) {
                await deleteFromDatabase('solar_overrides', `row-${rowId}`);
            }
        }

        // 3. Apply date override for all days in range & persist to Turso solar_overrides
        let cur = new Date(startDate);
        const end = new Date(endDate);
        while (cur <= end) {
            const dateStr = cur.toISOString().split('T')[0];
            currentData.solarDateOverrides[dateStr] = chosenSupplier;
            const overrideItem = {
                id: `date-${dateStr}`,
                date: dateStr,
                supplier: chosenSupplier,
                created_at: new Date().toISOString()
            };
            await saveData(currentData, 'solar_overrides', overrideItem);
            cur.setDate(cur.getDate() + 1);
        }

        saveData(currentData);
        closeModal();
        render_solar();

        alert(`✅ Berhasil memperbarui pemasok menjadi "${chosenSupplier}" untuk periode ${formatDate(startDate)} s.d ${formatDate(endDate)}.`);
    });
};

window.handleBulkSupplierDropdownChange = (selectEl) => {
    const newGroup = document.getElementById('bulk-new-supplier-group');
    const newNameInput = document.getElementById('bulk-new-supplier-name');
    if (!newGroup) return;

    if (selectEl.value === '__NEW__') {
        newGroup.style.display = 'block';
        if (newNameInput) newNameInput.required = true;
    } else {
        newGroup.style.display = 'none';
        if (newNameInput) {
            newNameInput.required = false;
            newNameInput.value = '';
        }
    }
};

function getDefaultSolarSupplier(data) {
    const solarExps = (data.expenseTypes || []).filter(e => e.linkedSolarSupplier && e.linkedSolarSupplier.trim());
    if (solarExps.length > 0) {
        return solarExps[0].linkedSolarSupplier.trim().toUpperCase();
    }
    const allSuppliers = getAllSolarSuppliers(data);
    return allSuppliers.length > 0 ? allSuppliers[0] : '';
}

window.handleSolarSupplierChange = async (selectEl) => {
    if (selectEl.value === '__NEW__') {
        const newName = prompt('Masukkan Nama Pemasok Baru (Contoh: PT. PERTAMINA, MAS SEPTA, A):');
        if (newName && newName.trim()) {
            const upper = newName.trim().toUpperCase();
            await window.saveSolarSupplierToDatabase(upper);
            let found = false;
            for (let opt of selectEl.options) {
                if (opt.value === upper) {
                    opt.selected = true;
                    found = true;
                    break;
                }
            }
            if (!found) {
                const newOpt = document.createElement('option');
                newOpt.value = upper;
                newOpt.text = upper;
                newOpt.selected = true;
                selectEl.insertBefore(newOpt, selectEl.querySelector('option[value="__NEW__"]'));
            }
        } else {
            selectEl.value = selectEl.getAttribute('data-prev-val') || '';
        }
    }
    selectEl.setAttribute('data-prev-val', selectEl.value);
};

window.openAddSolarModal = () => {
    document.getElementById('solar-id-field')?.remove();
    const data = getData();
    const suppliers = getAllSolarSuppliers(data);
    const defaultSupplier = getDefaultSolarSupplier(data);

    let supplierOptions = '';
    if (!defaultSupplier && suppliers.length === 0) {
        supplierOptions = '<option value="">-- Belum ada pemasok --</option>';
    } else if (!defaultSupplier) {
        supplierOptions = '<option value="">-- Pilih Pemasok --</option>';
    }

    suppliers.forEach(s => {
        const isSelected = (s === defaultSupplier) ? 'selected' : '';
        supplierOptions += `<option value="${s}" ${isSelected}>${s}</option>`;
    });
    supplierOptions += `<option value="__NEW__">+ Tambah Pemasok Baru...</option>`;

    const formHtml = `
        <form id="form-solar" autocomplete="off">
            <input type="hidden" id="solar-id" value="">
            <div class="form-group">
                <label>Tanggal</label>
                <input type="date" id="solar-date" class="form-control" value="${new Date().toISOString().split('T')[0]}" required>
            </div>
            <div class="form-group">
                <label>Pemasok</label>
                <select id="solar-supplier" class="form-control" data-prev-val="${defaultSupplier}" onchange="handleSolarSupplierChange(this)" required>
                    ${supplierOptions}
                </select>
            </div>
            <div class="form-group">
                <label>Jenis</label>
                <select id="solar-type" class="form-control" required>
                    <option value="Masuk">Masuk (Beli Solar)</option>
                    <option value="Keluar">Keluar (Pemakaian Manual/Koreksi)</option>
                </select>
            </div>
            <div class="form-group">
                <label>Jumlah (Liter)</label>
                <input type="number" id="solar-amount" class="form-control" step="0.01" required>
            </div>
            <div class="form-group">
                <label>Keterangan</label>
                <input type="text" id="solar-description" class="form-control" oninput="this.value = this.value.toUpperCase()">
            </div>
            <div class="form-actions">
                <button type="button" class="btn" onclick="closeModal()">Batal</button>
                <button type="submit" class="btn btn-primary">Simpan</button>
            </div>
        </form>
    `;

    openModal('Tambah Data Solar', formHtml);
    document.getElementById('form-solar').addEventListener('submit', (e) => {
        e.preventDefault();
        saveSolar();
    });
};

window.editSolar = (id) => {
    const data = getData();
    const solar = data.solar.find(s => s.id === id);
    if (!solar) return;

    const suppliers = getAllSolarSuppliers(data);
    const activeSupplier = (solar.supplier || getDefaultSolarSupplier(data) || '').toUpperCase().trim();

    let supplierOptions = '';
    suppliers.forEach(s => {
        const isSelected = (s === activeSupplier) ? 'selected' : '';
        supplierOptions += `<option value="${s}" ${isSelected}>${s}</option>`;
    });
    if (activeSupplier && !suppliers.includes(activeSupplier)) {
        supplierOptions = `<option value="${activeSupplier}" selected>${activeSupplier}</option>` + supplierOptions;
    }
    supplierOptions += `<option value="__NEW__">+ Tambah Pemasok Baru...</option>`;

    const formHtml = `
        <form id="form-solar" autocomplete="off">
            <input type="hidden" id="solar-id" value="${solar.id}">
            <div class="form-group">
                <label>Tanggal</label>
                <input type="date" id="solar-date" class="form-control" value="${solar.date}" required>
            </div>
            <div class="form-group">
                <label>Pemasok</label>
                <select id="solar-supplier" class="form-control" data-prev-val="${activeSupplier}" onchange="handleSolarSupplierChange(this)" required>
                    ${supplierOptions}
                </select>
            </div>
            <div class="form-group">
                <label>Jenis</label>
                <select id="solar-type" class="form-control" required>
                    <option value="Masuk" ${solar.type === 'Masuk' ? 'selected' : ''}>Masuk (Beli Solar)</option>
                    <option value="Keluar" ${solar.type === 'Keluar' ? 'selected' : ''}>Keluar (Pemakaian Manual/Koreksi)</option>
                </select>
            </div>
            <div class="form-group">
                <label>Jumlah (Liter)</label>
                <input type="number" id="solar-amount" class="form-control" step="0.01" value="${solar.amount}" required>
            </div>
            <div class="form-group">
                <label>Keterangan</label>
                <input type="text" id="solar-description" class="form-control" value="${solar.description || ''}" oninput="this.value = this.value.toUpperCase()">
            </div>
            <div class="form-actions">
                <button type="button" class="btn" onclick="closeModal()">Batal</button>
                <button type="submit" class="btn btn-primary">Simpan</button>
            </div>
        </form>
    `;

    openModal('Edit Data Solar', formHtml);
    document.getElementById('form-solar').addEventListener('submit', (e) => {
        e.preventDefault();
        saveSolar();
    });
};

window.saveSolar = async () => {
    const id = document.getElementById('solar-id').value || generateId();
    const data = getData();
    
    if (!data.solar) data.solar = [];

    const solarItem = {
        id,
        date: document.getElementById('solar-date').value,
        supplier: document.getElementById('solar-supplier').value,
        type: document.getElementById('solar-type').value,
        amount: parseFloat(document.getElementById('solar-amount').value) || 0,
        description: document.getElementById('solar-description').value,
        created_at: new Date().toISOString()
    };

    const index = data.solar.findIndex(s => s.id === id);
    if (index >= 0) {
        data.solar[index] = solarItem;
    } else {
        data.solar.push(solarItem);
    }

    if (solarItem.supplier) {
        await window.saveSolarSupplierToDatabase(solarItem.supplier);
    }

    await saveData(data, 'solar', solarItem);
    
    closeModal();
    if (window.render_solar) window.render_solar();
};

window.deleteSolar = async (id) => {
    if (!confirm('Hapus data solar ini?')) return;
    
    const data = getData();
    data.solar = data.solar.filter(s => s.id !== id);
    saveData(data);
    await deleteFromDatabase('solar', id);
    
    if (window.render_solar) window.render_solar();
};

// Add these to window so they are accessible if needed
window.initBulkDeleteListeners = initBulkDeleteListeners;
window.updateBulkDeleteButton = updateBulkDeleteButton;


window.updatePengeluaranLinkedBuyer = (id, buyerId) => {
    const data = getData();
    const index = data.expenseTypes.findIndex(e => e.id === id);
    if (index > -1) {
        data.expenseTypes[index].linkedBuyerId = buyerId || null;
        
        const item = data.expenseTypes[index];
        const supabaseItem = {
            id: item.id,
            name: item.name,
            category: item.category,
            nature: item.nature,
            unit: item.unit,
            baseprice: item.basePrice,
            sort_order: item.order,
            linked_buyer_id: item.linkedBuyerId,
            linked_solar_supplier: item.linkedSolarSupplier
        };
        saveData(data, 'expense_types', supabaseItem);
    }
};

window.updatePengeluaranLinkedSupplier = async (id, supplierVal) => {
    let chosenSupplier = supplierVal;
    if (supplierVal === '__NEW__') {
        const input = prompt('Masukkan Nama Pemasok Solar (Contoh: A, B, PT. PERTAMINA):');
        if (!input || !input.trim()) {
            render_pengeluaran();
            return;
        }
        chosenSupplier = input.trim().toUpperCase();
    }

    const data = getData();
    const index = data.expenseTypes.findIndex(e => e.id === id);
    if (index > -1) {
        data.expenseTypes[index].linkedSolarSupplier = chosenSupplier ? chosenSupplier.toUpperCase() : null;
        
        const item = data.expenseTypes[index];
        const supabaseItem = {
            id: item.id,
            name: item.name,
            category: item.category,
            nature: item.nature,
            unit: item.unit,
            baseprice: item.basePrice,
            sort_order: item.order,
            linked_buyer_id: item.linkedBuyerId,
            linked_solar_supplier: item.linkedSolarSupplier
        };
        await saveData(data, 'expense_types', supabaseItem);
        render_pengeluaran();
        if (window.render_solar) window.render_solar();
    }
};

// Mobile Sidebar Toggle
document.addEventListener('DOMContentLoaded', () => {
    const btnToggle = document.getElementById('btn-toggle-sidebar');
    const sidebar = document.querySelector('.sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const navLinks = document.querySelectorAll('.nav-link');

    if (btnToggle && sidebar && overlay) {
        const toggleSidebar = () => {
            sidebar.classList.toggle('active');
            overlay.classList.toggle('active');
        };

        btnToggle.addEventListener('click', toggleSidebar);
        overlay.addEventListener('click', toggleSidebar);

        // Close sidebar when link is clicked on mobile
        navLinks.forEach(link => {
            link.addEventListener('click', () => {
                if (window.innerWidth <= 768) {
                    toggleSidebar();
                }
            });
        });
    }
});
