// ============================================================
// src/core.js — State, DB, Auth, Utilities
// ============================================================

// ---- DATA STATE ----
const defaultData = {
    buyers: [], drivers: [], expenseTypes: [], settlements: [],
    deductions: [], transactions: [], profiles: [], solar: [],
    solarSuppliers: [], solarDateOverrides: {}, solarRowOverrides: {}
};

let _cache = null;
export function getData() {
    if (!_cache) _cache = JSON.parse(JSON.stringify(defaultData));
    return _cache;
}

let _isFetchingTurso = false;
let _appInitialized = false;

export async function fetchAllDataFromTurso() {
    if (_isFetchingTurso) return;
    _isFetchingTurso = true;
    try {
        const response = await fetch('/api/sync');
        if (!response.ok) throw new Error('Network response was not ok');
        const data = await response.json();

        const solarDateOverrides = {};
        const solarRowOverrides = {};
        (data.solarOverrides || []).forEach(o => {
            let supVal = o.supplier;
            if (typeof supVal === 'string' && supVal.startsWith('{') && supVal.includes('"split"')) {
                try { supVal = JSON.parse(supVal); } catch (e) {}
            }
            if (o.id && o.id.startsWith('row-')) {
                solarRowOverrides[o.id.replace('row-', '')] = supVal;
            } else if (o.date) {
                solarDateOverrides[o.date] = supVal;
            }
        });

        let cleanSolar = (data.solar || []).filter(s => {
            if (s.description && (
                s.description.startsWith('PEMAKAIAN HARIAN (BAGIAN')
            )) {
                deleteFromDatabase('solar', s.id);
                return false;
            }
            return true;
        });

        _cache = {
            buyers: (data.buyers || []).map(b => ({ ...b, unitPrice: b.unitprice })),
            drivers: (data.drivers || []).map(d => ({ ...d, vehicleNumber: d.vehiclenumber })),
            expenseTypes: (data.expenseTypes || []).map(e => ({ ...e, basePrice: e.baseprice, order: e.sort_order, linkedBuyerId: e.linked_buyer_id, linkedSolarSupplier: e.linked_solar_supplier || e.linkedSolarSupplier || '' })),
            settlements: (data.settlements || []).map(s => ({ ...s, expenseTypeId: s.expensetypeid })),
            deductions: (data.deductions || []).map(d => ({ ...d, buyerId: d.buyerid, dateStart: d.datestart, dateEnd: d.dateend })),
            transactions: (data.transactions || []).map(t => ({
                ...t,
                buyerId: t.buyerid, driverId: t.driverid,
                totalAmount: t.totalamount, operationalExpense: t.operationalexpense,
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
            solar: cleanSolar,
            solarSuppliers: data.solarSuppliers || [],
            solarDateOverrides, solarRowOverrides
        };

        if (_cache.profiles.length === 0) {
            _cache.profiles.push({ id: 'admin-default', fullName: 'Administrator', email: 'ADMIN', role: 'Admin', created_at: new Date().toISOString() });
        }

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
    } catch (e) {
        console.error("❌ Gagal mengambil data dari Turso:", e);
    } finally {
        _isFetchingTurso = false;
    }
}

export async function saveData(data, table = null, item = null) {
    _cache = data;
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
        } catch (e) {
            console.error(`❌ Gagal simpan ke Turso (${table}):`, e);
            alert(`Gagal menyimpan ke database cloud: ${e.message}.`);
        }
    }
}

export async function deleteFromDatabase(table, id) {
    try {
        const response = await fetch(`/api/sync?table=${table}&id=${id}`, { method: 'DELETE' });
        if (!response.ok) throw new Error('Network error');
    } catch (e) {
        console.error(`❌ Gagal hapus dari Turso (${table}):`, e);
    }
}

export function updateData(key, newArray) {
    const data = getData();
    data[key] = newArray;
    saveData(data);
}

// ---- UTILITIES ----
export const generateId = () => Date.now().toString(36) + Math.random().toString(36).substr(2);

export const formatCurrency = (value) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(value);

export const formatDate = (dateString = new Date()) => {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    return new Date(dateString).toLocaleDateString('id-ID', options);
};

export function showToast(message, type = 'success') {
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

export function getAllSolarSuppliers(data) {
    const supSet = new Set();
    (data.solarSuppliers || []).forEach(s => {
        const name = typeof s === 'string' ? s : s.name;
        if (name && name.trim()) supSet.add(name.trim().toUpperCase());
    });
    (data.solar || []).forEach(s => {
        if (s.supplier && s.supplier.trim()) supSet.add(s.supplier.trim().toUpperCase());
    });
    (data.expenseTypes || []).forEach(e => {
        if (e.linkedSolarSupplier && e.linkedSolarSupplier.trim()) supSet.add(e.linkedSolarSupplier.trim().toUpperCase());
    });
    if (data.solarRowOverrides) {
        Object.values(data.solarRowOverrides).forEach(sup => {
            if (typeof sup === 'string' && sup.trim()) supSet.add(sup.trim().toUpperCase());
            else if (sup && typeof sup === 'object') {
                if (sup.sup1) supSet.add(sup.sup1.trim().toUpperCase());
                if (sup.sup2) supSet.add(sup.sup2.trim().toUpperCase());
            }
        });
    }
    if (data.solarDateOverrides) {
        Object.values(data.solarDateOverrides).forEach(sup => {
            if (typeof sup === 'string' && sup.trim()) supSet.add(sup.trim().toUpperCase());
            else if (sup && typeof sup === 'object') {
                if (sup.sup1) supSet.add(sup.sup1.trim().toUpperCase());
                if (sup.sup2) supSet.add(sup.sup2.trim().toUpperCase());
            }
        });
    }
    return Array.from(supSet).sort();
}

// ---- AUTH ----
export let currentUser = null;

export async function initAuth() {
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
                errorEl.textContent = "Terjadi kesalahan koneksi.";
                btn.disabled = false;
                btn.innerHTML = '<span>Sign In</span> <span class="material-symbols-outlined">login</span>';
            }
        });
    }

    const session = localStorage.getItem('session');
    if (session) {
        handleUserSignIn(JSON.parse(session));
    } else {
        const overlay = document.getElementById('loading-overlay');
        if (overlay) overlay.style.display = 'none';
    }
}

export async function handleUserSignIn(user) {
    localStorage.setItem('session', JSON.stringify(user));
    currentUser = user;
    const userNameEl = document.getElementById('header-user-name');
    if (userNameEl) userNameEl.textContent = `${user.profile?.full_name || user.username} (${user.profile?.role || 'User'})`;
    const navUsers = document.getElementById('nav-users');
    if (navUsers) navUsers.style.display = user.profile?.role === 'Admin' ? 'flex' : 'none';
    document.getElementById('login-page').style.display = 'none';
    document.getElementById('main-app').style.display = 'flex';
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.style.display = 'none';
    bootApp();
}

export function handleUserSignOut() {
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

export async function bootApp() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.style.display = 'flex';
    try {
        await fetchAllDataFromTurso();
        if (!_appInitialized) {
            const { _initApp } = await import('./app.js');
            _initApp();
            _appInitialized = true;
        } else {
            const activePage = document.querySelector('.page.active');
            if (activePage && window[`render_${activePage.id}`]) {
                window[`render_${activePage.id}`]();
            }
        }
    } catch (err) {
        console.error('Error fetching data:', err);
        showToast('Gagal memuat data dari database!', 'danger');
    } finally {
        if (overlay) overlay.style.display = 'none';
    }
}

// Expose to window for inline HTML handlers
window.showToast = showToast;
window.logout = async () => {
    if (confirm('Yakin ingin keluar?')) handleUserSignOut();
};
