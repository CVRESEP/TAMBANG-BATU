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
// State Management — Supabase Integration
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

// Fetch all data from Supabase
async function fetchAllDataFromSupabase() {
    if (!window.supabaseClient) return;
    
    console.log("📥 Mengambil data dari Supabase...");
    try {
        const [
            { data: buyers },
            { data: drivers },
            { data: expenseTypes },
            { data: settlements },
            { data: deductions },
            { data: transactions }
        ] = await Promise.all([
            supabaseClient.from('buyers').select('*'),
            supabaseClient.from('drivers').select('*'),
            supabaseClient.from('expense_types').select('*'),
            supabaseClient.from('settlements').select('*'),
            supabaseClient.from('deductions').select('*'),
            supabaseClient.from('transactions').select('*')
        ]);

        _cache = {
            buyers: buyers || [],
            drivers: drivers || [],
            expenseTypes: expenseTypes || [],
            settlements: settlements || [],
            deductions: deductions || [],
            transactions: transactions || []
        };
        
        console.log("✅ Data berhasil dimuat dari Supabase.");
    } catch (error) {
        console.error("❌ Gagal memuat data dari Supabase:", error);
    }
}

async function saveData(data, table = null, item = null) {
    _cache = data;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));

    if (window.supabaseClient && table && item) {
        try {
            const { error } = await supabaseClient.from(table).upsert(item);
            if (error) throw error;
            console.log(`✅ Berhasil simpan ke Supabase (${table})`);
        } catch (e) {
            console.error(`❌ Gagal simpan ke Supabase (${table}):`, e);
        }
    }
}

async function deleteFromSupabase(table, id) {
    if (window.supabaseClient) {
        try {
            const { error } = await supabaseClient.from(table).delete().eq('id', id);
            if (error) throw error;
            console.log(`✅ Berhasil hapus dari Supabase (${table})`);
        } catch (e) {
            console.error(`❌ Gagal hapus dari Supabase (${table}):`, e);
        }
    }
}

function updateData(key, newArray) {
    const data = getData();
    data[key] = newArray;
    saveData(data);
}

// App boot — called once on page load
async function bootApp() {
    console.log("🛠️ [DEBUG] bootApp dipanggil (Mode Supabase)!");
    
    const overlay = document.getElementById('loading-overlay');
    try {
        // Coba load dari Supabase
        await fetchAllDataFromSupabase();
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

// _initApp: called by bootApp() AFTER Supabase data is loaded
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
            pageTitle.textContent = targetLink.textContent.trim();
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

    window.openModal = function (title, contentHtml) {
        document.getElementById('modal-title').textContent = title;
        const body = document.getElementById('modal-body-content');
        body.innerHTML = contentHtml;
        modalOverlay.classList.add('active');
        formModal.classList.add('active');
        setTimeout(() => focusFirstInput(body), 50);
    };

    window.closeModal = function () {
        modalOverlay.classList.remove('active');
        formModal.classList.remove('active');
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
        const today = new Date().toISOString().split('T')[0];
        const firstDay = new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0];
        pStart.value = firstDay;
        pEnd.value = today;
        pStart.addEventListener('change', () => render_potongan_page());
        pEnd.addEventListener('change', () => render_potongan_page());
    }

    const sType = document.getElementById('filter-setoran-type');
    if (sType) {
        sType.addEventListener('change', () => render_potongan_page());
    }
}

// Boot the app when the DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootApp);
} else {
    bootApp();
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
        tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">Belum ada data jenis pengeluaran</td></tr>';
        return;
    }

    data.expenseTypes.forEach(exp => {
        const tr = document.createElement('tr');
        const natureColor = exp.nature === 'Pasti' ? 'var(--success)' : 'var(--danger)';
        const natureBg = exp.nature === 'Pasti' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)';

        tr.innerHTML = `
            <td><strong>${exp.name}</strong></td>
            <td><span style="display:inline-block; padding:0.25rem 0.5rem; border-radius:1rem; font-size:0.75rem; background:${exp.category === 'Operasional' ? 'rgba(79, 70, 229, 0.1)' : 'rgba(245, 158, 11, 0.1)'}; color:${exp.category === 'Operasional' ? 'var(--primary-color)' : 'var(--warning)'}">${exp.category}</span></td>
            <td><span style="display:inline-block; padding:0.25rem 0.5rem; border-radius:1rem; font-size:0.75rem; background:${natureBg}; color:${natureColor}; font-weight:600">${exp.nature || 'Tidak Pasti'}</span></td>
            <td>${exp.unit || '-'}</td>
            <td>${formatCurrency(exp.basePrice || 0)}</td>
            <td>
                <div class="d-flex" style="gap: 0.5rem">
                    <button class="btn-icon" style="color: var(--primary-color)" onclick="editPengeluaran('${exp.id}')"><span class="material-symbols-outlined">edit</span></button>
                    <button class="btn-icon" style="color: var(--danger)" onclick="deletePengeluaran('${exp.id}')"><span class="material-symbols-outlined">delete</span></button>
                </div>
            </td>
        `;
        tbody.appendChild(tr);
    });
};

window.render_potongan = () => {
    const data = getData();
    const start = document.getElementById('filter-potongan-start').value;
    const end = document.getElementById('filter-potongan-end').value;
    const typeId = document.getElementById('filter-setoran-type')?.value;

    // Populate Type Filter if empty
    const sType = document.getElementById('filter-setoran-type');
    if (sType && sType.options.length <= 1) {
        data.expenseTypes.forEach(e => {
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

    saveData(data, 'buyers', item);
    closeModal();
    render_pembeli();
}

window.deletePembeli = (id) => {
    if (confirm('Apakah Anda yakin ingin menghapus data pembeli ini?')) {
        const data = getData();
        data.buyers = data.buyers.filter(b => b.id !== id);
        saveData(data);
        deleteFromSupabase('buyers', id);
        render_pembeli();
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
                <label>No. Kendaraan</label>
                <input type="text" id="sopir-vehicle" class="form-control" required>
            </div>
            <div class="form-group">
                <label>No. HP</label>
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
                <label>No. Kendaraan</label>
                <input type="text" id="sopir-vehicle" class="form-control" value="${driver.vehicleNumber}" required>
            </div>
            <div class="form-group">
                <label>No. HP</label>
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

    saveData(data, 'drivers', item);
    closeModal();
    render_sopir();
}

window.deleteSopir = (id) => {
    if (confirm('Apakah Anda yakin ingin menghapus data sopir ini?')) {
        const data = getData();
        data.drivers = data.drivers.filter(d => d.id !== id);
        saveData(data);
        deleteFromSupabase('drivers', id);
        render_sopir();
    }
};

// --- Pengeluaran ---
document.getElementById('btn-add-pengeluaran').addEventListener('click', () => {
    currentEditId = null;
    const formHtml = `
        <form id="form-pengeluaran" autocomplete="off">
            <div class="form-group">
                <label>Nama Pengeluaran</label>
                <input type="text" id="pengeluaran-name" class="form-control" required>
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
                <input type="text" id="pengeluaran-unit" class="form-control" required>
            </div>
            <div class="form-group">
                <label>Harga Satuan / Patokan Harga (Rp)</label>
                <input type="number" id="pengeluaran-price" class="form-control" required value="0">
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
                <input type="text" id="pengeluaran-name" class="form-control" value="${exp.name}" required>
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
                <input type="text" id="pengeluaran-unit" class="form-control" value="${exp.unit || ''}" required>
            </div>
            <div class="form-group">
                <label>Harga Satuan / Patokan Harga (Rp)</label>
                <input type="number" id="pengeluaran-price" class="form-control" value="${exp.basePrice || 0}" required>
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
    const name = document.getElementById('pengeluaran-name').value;
    const category = document.getElementById('pengeluaran-category').value;
    const nature = document.getElementById('pengeluaran-nature').value;
    const unit = document.getElementById('pengeluaran-unit').value;
    const basePrice = parseFloat(document.getElementById('pengeluaran-price').value) || 0;

    const data = getData();
    let item;

    if (currentEditId) {
        const index = data.expenseTypes.findIndex(e => e.id === currentEditId);
        if (index > -1) {
            data.expenseTypes[index] = { ...data.expenseTypes[index], name, category, nature, unit, basePrice };
            item = data.expenseTypes[index];
        }
    } else {
        item = { id: generateId(), name, category, nature, unit, basePrice };
        data.expenseTypes.push(item);
    }

    saveData(data, 'expense_types', item);
    closeModal();
    render_pengeluaran();
}

window.deletePengeluaran = (id) => {
    if (confirm('Apakah Anda yakin ingin menghapus jenis pengeluaran ini?')) {
        const data = getData();
        data.expenseTypes = data.expenseTypes.filter(e => e.id !== id);
        saveData(data);
        deleteFromSupabase('expense_types', id);
        render_pengeluaran();
    }
};

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
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem; margin-bottom: 1.5rem; background:#f8fafc; padding:1rem; border-radius:0.5rem; border:1px solid #e2e8f0;">
                <div class="form-group" style="margin:0">
                    <label style="font-size:0.75rem; font-weight:600">Dari Tanggal</label>
                    <input type="date" id="bulk-date-start" class="form-control" value="${start}" onchange="refreshBulkModal()">
                </div>
                <div class="form-group" style="margin:0">
                    <label style="font-size:0.75rem; font-weight:600">Sampai Tanggal</label>
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

function saveBulkPotongan() {
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
                dateStart: start,
                dateEnd: end,
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

    // Individual sync to Supabase for added rows
    if (window.supabaseClient) {
        const rowsToSync = data.deductions.slice(-added);
        rowsToSync.forEach(row => {
            supabaseClient.from('deductions').upsert(row).then(({error}) => {
                if (error) console.error("Gagal sync bulk potongan:", error);
            });
        });
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

    saveData(data, 'deductions', item);
    closeModal();
    render_potongan();
}

window.deletePotongan = (id) => {
    if (confirm('Apakah Anda yakin ingin menghapus data potongan ini?')) {
        const data = getData();
        data.deductions = data.deductions.filter(p => p.id !== id);
        saveData(data);
        deleteFromSupabase('deductions', id);
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
    const categories = data.expenseTypes.map(e => `<option value="${e.id}" ${item && item.expenseTypeId === e.id ? 'selected' : ''}>${e.name}</option>`).join('');

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

    saveData(data, 'settlements', item);
    closeModal();
    render_potongan();
};

window.deleteSetoran = (id) => {
    if (confirm('Hapus data setoran ini?')) {
        const data = getData();
        data.settlements = data.settlements.filter(s => s.id !== id);
        saveData(data);
        deleteFromSupabase('settlements', id);
        render_potongan();
    }
};

// --- Penjualan ---

// Global for sales form rows
let currentEditTxId = null;
let penjualanRows = [];
let opsExpenseRows = [];
let retExpenseRows = [];

window.render_penjualan = () => {
    const data = getData();

    // Ensure base pricing for expenses
    let modified = false;
    data.expenseTypes.forEach(e => {
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

    // Switch to List View
    listView.style.display = 'block';
    formView.style.display = 'none';

    // Render List
    tbodyList.innerHTML = '';
    if (data.transactions.length === 0) {
        tbodyList.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Belum ada transaksi</td></tr>';
    } else {
        data.transactions.forEach(tx => {
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
        deleteFromSupabase('transactions', id);
        render_penjualan();
    }
};

function initSalesForm(container, data, txToEdit = null) {
    if (txToEdit) {
        // Load existing
        penjualanRows = txToEdit.sales.map(s => ({
            id: generateId(), buyerId: s.buyerId, qty: s.qty, unitPrice: (s.qty > 0 ? s.total / s.qty : 0), total: s.total, driverCount: s.driverCount || 1
        }));

        opsExpenseRows = [];
        data.expenseTypes.filter(e => e.category === 'Operasional').forEach(e => {
            const detail = txToEdit.expenseDetails.find(d => d.expenseId === e.id);
            if (detail) {
                opsExpenseRows.push({ id: generateId(), expenseId: e.id, name: e.name, nature: e.nature, basePrice: (detail.qty > 0 ? detail.amount / detail.qty : e.basePrice || 0), qty: detail.qty, total: detail.amount });
            } else {
                opsExpenseRows.push({ id: generateId(), expenseId: e.id, name: e.name, nature: e.nature, basePrice: e.basePrice || 0, qty: 0, total: 0 });
            }
        });

        retExpenseRows = [];
        data.expenseTypes.filter(e => e.category === 'Retribusi').forEach(e => {
            const detail = txToEdit.expenseDetails.find(d => d.expenseId === e.id);
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
        opsExpenseRows = data.expenseTypes
            .filter(e => e.category === 'Operasional')
            .map(e => ({ id: generateId(), expenseId: e.id, name: e.name, nature: e.nature, basePrice: e.basePrice || 0, qty: 0, total: 0 }));

        retExpenseRows = data.expenseTypes
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
        opsExpenseRows.push({ id: generateId(), expenseId: '', name: '', basePrice: 0, qty: 0, total: 0 });
        renderOpsRows(data);
    };

    document.getElementById('btn-add-ret-row').onclick = () => {
        const totalRit = typeof calculateTotalRitase === 'function' ? calculateTotalRitase() : 0;
        retExpenseRows.push({ id: generateId(), expenseId: '', name: '', basePrice: 0, qty: totalRit, total: 0 });
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
            data.expenseTypes.filter(e => e.category === 'Operasional').forEach(e => {
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
                const newExp = { id: generateId(), name: row.name, category: 'Operasional', unit: '', basePrice: 0 };
                data.expenseTypes.push(newExp);
                saveData(data);
                row.expenseId = newExp.id;
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
            data.expenseTypes.filter(e => e.category === 'Retribusi').forEach(e => {
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
                const newExp = { id: generateId(), name: row.name, category: 'Retribusi', unit: '', basePrice: 0 };
                data.expenseTypes.push(newExp);
                saveData(data);
                row.expenseId = newExp.id;
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
    const opsDetails = opsExpenseRows.filter(r => r.qty > 0 && r.expenseId).map(r => {
        totalOps += r.total;
        return { expenseId: r.expenseId, qty: r.qty, amount: r.total };
    });

    let totalRet = 0;
    const retDetails = retExpenseRows.filter(r => r.qty > 0 && r.expenseId).map(r => {
        totalRet += r.total;
        return { expenseId: r.expenseId, qty: r.qty, amount: r.total };
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
        expenses: [...opsDetails, ...retDetails],
        status: 'Belum Lunas', // By default
        created_at: new Date().toISOString()
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

    saveData(data, 'transactions', transaction);
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

// --- Penagihan ---
window.render_penagihan = () => {
    const data = getData();
    const container = document.querySelector('#penagihan .card-body');

    // Unpaid "Sale Segments"
    const buyerSales = [];
    data.transactions.filter(t => t.status !== 'Lunas').forEach(t => {
        if (t.sales) {
            t.sales.forEach(s => {
                buyerSales.push({ txId: t.id, date: t.date, buyerId: s.buyerId, amount: s.total, qty: s.qty });
            });
        } else if (t.buyerId) { // Fallback for old simple transactions
            buyerSales.push({ txId: t.id, date: t.date, buyerId: t.buyerId, amount: t.totalAmount, qty: t.qty || 0 });
        }
    });

    if (buyerSales.length === 0) {
        container.innerHTML = '<p class="text-center text-muted" style="padding:2rem;">Tidak ada tagihan yang belum lunas (Piutang bersih).</p>';
        return;
    }

    const grouped = {};
    buyerSales.forEach(s => {
        if (!grouped[s.buyerId]) grouped[s.buyerId] = [];
        grouped[s.buyerId].push(s);
    });

    let html = '';

    for (const buyerId in grouped) {
        const buyer = data.buyers.find(b => b.id === buyerId);
        const bName = buyer ? buyer.name : 'Unknown';
        const segments = grouped[buyerId];
        const totalSales = segments.reduce((sum, s) => sum + s.amount, 0);

        // Find all deductions linked to this specific buyer
        const buyerDeductions = (data.deductions || []).filter(p => p.buyerId === buyerId);
        const totalBuyerDeductions = buyerDeductions.reduce((sum, p) => sum + p.amount, 0);
        const totalFinalTagihan = totalSales - totalBuyerDeductions;

        html += `
            <div style="border:1px solid var(--border-color); border-radius:var(--radius-lg); margin-bottom:1.5rem; overflow:hidden;">
                <div style="background:#f8fafc; padding:1rem 1.5rem; border-bottom:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center;">
                    <h3 style="margin:0; font-size:1.1rem; color:var(--primary-color)">${bName}</h3>
                    <div style="text-align:right">
                        <div style="font-size:0.75rem; color:#64748b; margin-bottom:2px">Total Piutang Bersih:</div>
                        <div style="font-weight:700; color:var(--danger); font-size:1.1rem">${formatCurrency(totalFinalTagihan)}</div>
                    </div>
                </div>
                <div class="table-responsive">
                    <table class="table" style="margin:0">
                        <thead>
                            <tr>
                                <th>Tanggal</th>
                                <th>Keterangan</th>
                                <th class="text-right">Jumlah</th>
                                <th>Aksi</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${segments.map(s => `
                                <tr>
                                    <td>${formatDate(s.date)}</td>
                                    <td>Jual Barang (${s.qty || 0} unit)</td>
                                    <td class="text-right">${formatCurrency(s.amount)}</td>
                                    <td>
                                        <button class="btn btn-sm" style="background:var(--success); color:white; padding:0.2rem 0.6rem; font-size:0.7rem;" onclick="markAsLunas('${s.txId}')">Tandai Lunas</button>
                                    </td>
                                </tr>
                            `).join('')}
                            ${buyerDeductions.map(p => `
                                <tr style="background:#fef2f2">
                                    <td>${formatDate(p.dateStart || p.date)}</td>
                                    <td style="color:var(--danger)">POTONGAN: ${p.description}</td>
                                    <td class="text-right" style="color:var(--danger)">- ${formatCurrency(p.amount)}</td>
                                    <td></td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        `;
    }
    container.innerHTML = html;
};

window.markAsLunas = (txId) => {
    if (confirm('Apakah Anda yakin transaksi ini sudah dilunasi?')) {
        const data = getData();
        const tx = data.transactions.find(t => t.id === txId);
        if (tx) {
            tx.status = 'Lunas';
            tx.paidAt = new Date().toISOString();
            saveData(data, 'transactions', tx);
            render_penagihan();
        }
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
            const expType = data.expenseTypes.find(e => e.id === d.expenseId);
            expRows.push([
                tx.date,
                expType ? expType.name : '',
                expType ? (expType.category || '') : '',
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

        // 2. Ops Expenses - look up name and category from expenseTypes
        const opsGroups = [];
        filtered.forEach(tx => {
            (tx.expenseDetails || []).forEach(d => {
                const expType = data.expenseTypes.find(e => e.id === d.expenseId);
                if (!expType || expType.category !== 'Operasional') return;
                const price = d.qty > 0 ? d.amount / d.qty : 0;
                let group = opsGroups.find(g => g.name === expType.name && Math.abs(g.price - price) < 1);
                if (!group) {
                    group = { name: expType.name, price: price, qty: 0, total: 0 };
                    opsGroups.push(group);
                }
                group.qty += d.qty;
                group.total += d.amount;
            });
        });

        // 3. Retri Expenses - look up name and category from expenseTypes
        const retGroups = [];
        filtered.forEach(tx => {
            (tx.expenseDetails || []).forEach(d => {
                const expType = data.expenseTypes.find(e => e.id === d.expenseId);
                if (!expType || expType.category !== 'Retribusi') return;
                const price = d.qty > 0 ? d.amount / d.qty : 0;
                let group = retGroups.find(g => g.name === expType.name && Math.abs(g.price - price) < 1);
                if (!group) {
                    group = { name: expType.name, price: price, qty: 0, total: 0 };
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
