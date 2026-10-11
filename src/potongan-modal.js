// ============================================================
// src/potongan-modal.js — Modal Potongan (Bulk, Quick, Add & Edit)
// ============================================================
import { getData, saveData, generateId, formatCurrency, formatDate, showToast } from './core.js';

let bulkPotRows = [];
let currentEditId = null;

export function openBulkPotonganModal(start, end) {
    const data = getData();
    const salesSummary = {};
    (data.transactions || [])
        .filter(t => t.date >= start && t.date <= end)
        .forEach(t => {
            if (t.sales && Array.isArray(t.sales)) {
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

    window.openModal('Tambah Potongan', formHtml);
}
window.openBulkPotonganModal = openBulkPotonganModal;

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

window.saveBulkPotongan = async () => {
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

    saveData(data);

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
        }
    } catch (e) {
        console.error('Gagal sinkron potongan:', e);
    }

    window.closeModal();
    window.render_potongan();
    showToast(`Berhasil menyimpan ${added} data potongan.`);
};

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
    window.openModal('Tambah Potongan Penjualan', formHtml);
    document.getElementById('form-potongan').addEventListener('submit', (e) => {
        e.preventDefault();
        window.savePotongan();
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
    window.openModal('Edit Potongan', formHtml);
    document.getElementById('form-potongan').addEventListener('submit', (e) => {
        e.preventDefault();
        window.savePotongan();
    });
};

window.savePotongan = () => {
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
    window.closeModal();
    window.render_potongan();
};

window.openQuickPotonganModal = () => {
    const startEl = document.getElementById('filter-start');
    const endEl = document.getElementById('filter-end');

    let start, end;
    if (startEl && startEl.value && endEl && endEl.value) {
        start = startEl.value;
        end = endEl.value;
    } else {
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

    const origClose = window.closeModal;
    window.closeModal = () => {
        origClose();
        window.closeModal = origClose;
        if (window.generateLaporan) window.generateLaporan();
    };
};
