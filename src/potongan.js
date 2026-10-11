// ============================================================
// src/potongan.js — Setoran & Potongan
// ============================================================
import { getData, saveData, deleteFromDatabase, generateId, formatCurrency, formatDate } from './core.js';

let currentEditId = null;

// ---- SETORAN & POTONGAN ----
window.render_potongan = () => {
    const data = getData();
    const start = document.getElementById('filter-potongan-start')?.value;
    const end = document.getElementById('filter-potongan-end')?.value;
    const typeId = document.getElementById('filter-setoran-type')?.value;

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

    renderSetoranSummary(data, start, end);
    renderSetoranTable(data, start, end, typeId);
    renderPotonganTable(data, start, end);
};

function renderSetoranSummary(data, start, end) {
    const container = document.getElementById('setoran-summary-content');
    if (!container) return;
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

    let html = `<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:1rem;">
        <div style="background:white;padding:1rem;border-radius:0.5rem;border:1px solid #e2e8f0;border-left:4px solid #10b981;">
            <div style="font-size:0.75rem;font-weight:600;color:#64748b;margin-bottom:0.25rem;">TOTAL HARGA BATU</div>
            <div style="font-size:1.125rem;font-weight:700;color:#1e293b;">${formatCurrency(totalHargaBatu)}</div>
        </div>`;
    Object.keys(setoranLainnya).forEach(name => {
        html += `<div style="background:white;padding:1rem;border-radius:0.5rem;border:1px solid #e2e8f0;border-left:4px solid var(--secondary-color);">
            <div style="font-size:0.75rem;font-weight:600;color:#64748b;margin-bottom:0.25rem;">TOTAL ${name.toUpperCase()}</div>
            <div style="font-size:1.125rem;font-weight:700;color:#1e293b;">${formatCurrency(setoranLainnya[name])}</div>
        </div>`;
    });
    const totalSetoran = totalHargaBatu + Object.values(setoranLainnya).reduce((a, b) => a + b, 0);
    html += `<div style="background:var(--secondary-color);padding:1rem;border-radius:0.5rem;color:white;">
        <div style="font-size:0.75rem;font-weight:600;opacity:0.9;margin-bottom:0.25rem;">TOTAL KESELURUHAN</div>
        <div style="font-size:1.125rem;font-weight:700;">${formatCurrency(totalSetoran)}</div>
    </div></div>`;
    container.innerHTML = html;
}

function renderSetoranTable(data, start, end, typeId = '') {
    const tbody = document.getElementById('tbody-setoran');
    if (!tbody) return;
    let filtered = (data.settlements || []);
    if (typeId) filtered = filtered.filter(s => s.expenseTypeId === typeId);
    const seen = new Set();
    const uniqueTypes = [];
    filtered.forEach(s => { if (!seen.has(s.expenseTypeId)) { uniqueTypes.push(s); seen.add(s.expenseTypeId); } });
    tbody.innerHTML = uniqueTypes.length === 0 ? '<tr><td colspan="3" class="text-center">Belum ada jenis setoran terdaftar</td></tr>' :
        uniqueTypes.map(s => {
            const expType = data.expenseTypes.find(e => e.id === s.expenseTypeId);
            return `<tr>
                <td><input type="checkbox" class="check-setoran" data-id="${s.id}"></td>
                <td><span class="badge" style="background:#f0f9ff;color:#0369a1;border:1px solid #bae6fd">${expType ? expType.name : 'Umum'}</span></td>
                <td><button class="btn-icon text-danger" onclick="deleteSetoran('${s.id}')"><span class="material-symbols-outlined">delete</span></button></td>
            </tr>`;
        }).join('');
}

function renderPotonganTable(data, start, end) {
    const tbody = document.getElementById('tbody-potongan');
    if (!tbody) return;
    let filtered = (data.deductions || []);
    if (start && end) {
        filtered = filtered.filter(p => { const pStart = p.dateStart || p.date; const pEnd = p.dateEnd || p.date; return pStart <= end && pEnd >= start; });
    }
    filtered.sort((a, b) => new Date(b.dateStart || b.date) - new Date(a.dateStart || a.date));
    tbody.innerHTML = filtered.length === 0 ? '<tr><td colspan="6" class="text-center">Tidak ada data potongan</td></tr>' :
        filtered.map(p => {
            const buyer = data.buyers.find(b => b.id === p.buyerId);
            const dateStr = p.dateStart && p.dateEnd ? `${formatDate(p.dateStart)} - ${formatDate(p.dateEnd)}` : formatDate(p.date);
            return `<tr>
                <td><input type="checkbox" class="check-potongan" data-id="${p.id}"></td>
                <td>${dateStr}</td>
                <td>${p.description || '-'}</td>
                <td>${buyer ? buyer.name : '-'}</td>
                <td style="font-weight:600;color:var(--danger);">${formatCurrency(p.amount)}</td>
                <td>
                    <div class="d-flex" style="gap:0.5rem">
                        <button class="btn-icon" style="color:var(--primary-color)" onclick="editPotongan('${p.id}')"><span class="material-symbols-outlined">edit</span></button>
                        <button class="btn-icon" style="color:var(--danger)" onclick="deletePotongan('${p.id}')"><span class="material-symbols-outlined">delete</span></button>
                    </div>
                </td>
            </tr>`;
        }).join('');
}

document.getElementById('btn-add-setoran')?.addEventListener('click', () => {
    currentEditId = null;
    const data = getData();
    const sortedTypes = [...data.expenseTypes].sort((a, b) => (a.order || 0) - (b.order || 0));
    const optTypes = sortedTypes.map(e => `<option value="${e.id}">${e.name} (${e.category})</option>`).join('');
    const formHtml = `
        <form id="form-setoran" autocomplete="off">
            <div class="form-group"><label>Jenis Pengeluaran (Terkait)</label><select id="setoran-exp-type" class="form-control" required>${optTypes}</select></div>
            <div class="form-actions"><button type="button" class="btn" onclick="closeModal()">Batal</button><button type="submit" class="btn btn-primary">Simpan</button></div>
        </form>`;
    window.openModal('Tambah Jenis Setoran', formHtml);
    document.getElementById('form-setoran').addEventListener('submit', (e) => { e.preventDefault(); saveSetoran(); });
});

export function saveSetoran() {
    const expenseTypeId = document.getElementById('setoran-exp-type').value;
    const data = getData();
    if (!data.settlements) data.settlements = [];
    const item = { id: generateId(), expenseTypeId, amount: 0, date: new Date().toISOString().split('T')[0] };
    data.settlements.push(item);
    saveData(data, 'settlements', { id: item.id, expensetypeid: item.expenseTypeId, amount: item.amount, date: item.date });
    window.closeModal();
    window.render_potongan();
}
window.saveSetoran = saveSetoran;

window.deleteSetoran = (id) => {
    if (confirm('Hapus jenis setoran ini?')) {
        const data = getData();
        const itemToDelete = (data.settlements || []).find(s => s.id === id);
        if (itemToDelete) {
            const expId = itemToDelete.expenseTypeId;
            data.settlements = data.settlements.filter(s => s.expenseTypeId !== expId);
            saveData(data);
            deleteFromDatabase('settlements', id);
            window.render_potongan();
        }
    }
};

window.deletePotongan = (id) => {
    if (confirm('Apakah Anda yakin ingin menghapus data potongan ini?')) {
        const data = getData();
        data.deductions = (data.deductions || []).filter(p => p.id !== id);
        saveData(data);
        deleteFromDatabase('deductions', id);
        window.render_potongan();
    }
};

export { currentEditId };
