// ============================================================
// src/penjualan-form.js — Form Transaksi Penjualan & Baris Sales
// ============================================================
import { getData, saveData, generateId, formatCurrency } from './core.js';
import {
    getOpsExpenseRows, setOpsExpenseRows,
    getRetExpenseRows, setRetExpenseRows,
    renderOpsRows, renderRetRows,
    calculateTotalRitase, syncLinkedExpensesQty, syncRetribusiQty
} from './penjualan-expense-rows.js';

let penjualanRows = [];

export function getPenjualanRows() { return penjualanRows; }
export function setPenjualanRows(rows) { penjualanRows = rows; }

export function initSalesForm(container, data, txToEdit = null) {
    if (!container) return;
    if (txToEdit) {
        const txSales = typeof txToEdit.sales === 'string' ? JSON.parse(txToEdit.sales) : (txToEdit.sales || []);
        
        penjualanRows = txSales.map(s => ({
            id: generateId(), buyerId: s.buyerId, qty: s.qty, unitPrice: (s.qty > 0 ? s.total / s.qty : 0), total: s.total, driverCount: s.driverCount || 1,
            hargaBatu: s.hargaBatu || 0, sewaBreaker: s.sewaBreaker || 0, sewaBucket: s.sewaBucket || 0, solarBreaker: s.solarBreaker || 0, solarBucket: s.solarBucket || 0
        }));

        const newOps = [];
        const txExpenses = typeof txToEdit.expenseDetails === 'string' ? JSON.parse(txToEdit.expenseDetails) : (txToEdit.expenseDetails || []);
        
        const masterOps = [...data.expenseTypes].sort((a, b) => (a.order || 0) - (b.order || 0)).filter(e => e.category === 'Operasional');
        masterOps.forEach(e => {
            const detail = txExpenses.find(d => d.expenseId === e.id);
            if (detail) {
                newOps.push({ id: generateId(), expenseId: e.id, name: e.name, nature: e.nature, basePrice: (detail.qty > 0 ? detail.amount / detail.qty : e.basePrice || 0), qty: detail.qty, total: detail.amount });
            } else {
                newOps.push({ id: generateId(), expenseId: e.id, name: e.name, nature: e.nature, basePrice: e.basePrice || 0, qty: 0, total: 0 });
            }
        });

        txExpenses.forEach(d => {
            const isManual = !d.expenseId || !masterOps.some(e => e.id === d.expenseId);
            const masterType = data.expenseTypes.find(e => e.id === d.expenseId);
            if (isManual && (!masterType || masterType.category === 'Operasional')) {
                if (!d.expenseId) {
                    newOps.push({ id: generateId(), expenseId: null, name: d.name || 'Manual', nature: 'Tidak Pasti', basePrice: (d.qty > 0 ? d.amount / d.qty : 0), qty: d.qty, total: d.amount });
                }
            }
        });
        setOpsExpenseRows(newOps);

        const newRet = [];
        [...data.expenseTypes].sort((a, b) => (a.order || 0) - (b.order || 0)).filter(e => e.category === 'Retribusi').forEach(e => {
            const detail = txExpenses.find(d => d.expenseId === e.id);
            if (detail) {
                newRet.push({ id: generateId(), expenseId: e.id, name: e.name, nature: e.nature, basePrice: (detail.qty > 0 ? detail.amount / detail.qty : e.basePrice || 0), qty: detail.qty, total: detail.amount });
            } else {
                newRet.push({ id: generateId(), expenseId: e.id, name: e.name, nature: e.nature, basePrice: e.basePrice || 0, qty: 0, total: 0 });
            }
        });
        setRetExpenseRows(newRet);
    } else {
        penjualanRows = [{ id: generateId(), buyerId: '', qty: 0, total: 0, driverCount: 1, hargaBatu: 0, sewaBreaker: 0, sewaBucket: 0, solarBreaker: 0, solarBucket: 0 }];

        setOpsExpenseRows([...data.expenseTypes]
            .sort((a, b) => (a.order || 0) - (b.order || 0))
            .filter(e => e.category === 'Operasional')
            .map(e => ({ id: generateId(), expenseId: e.id, name: e.name, nature: e.nature, basePrice: e.basePrice || 0, qty: 0, total: 0 })));

        setRetExpenseRows([...data.expenseTypes]
            .sort((a, b) => (a.order || 0) - (b.order || 0))
            .filter(e => e.category === 'Retribusi')
            .map(e => ({ id: generateId(), expenseId: e.id, name: e.name, nature: e.nature, basePrice: e.basePrice || 0, qty: 0, total: 0 })));
    }

    const txDate = txToEdit ? txToEdit.date : new Date().toISOString().split('T')[0];

    container.innerHTML = `
        <form id="new-penjualan-form" autocomplete="off">
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
            id: generateId(), buyerId: '', qty: 0, unitPrice: 0, total: 0, driverCount: 1,
            hargaBatu: 0, sewaBreaker: 0, sewaBucket: 0, solarBreaker: 0, solarBucket: 0
        });
        renderSalesRows(getData());
    };

    document.getElementById('btn-add-ops-row').onclick = () => {
        const ops = getOpsExpenseRows();
        ops.push({ id: generateId(), expenseId: null, name: '', basePrice: 0, qty: 1, total: 0 });
        renderOpsRows(data);
    };

    document.getElementById('btn-add-ret-row').onclick = () => {
        const totalRit = calculateTotalRitase(penjualanRows);
        const ret = getRetExpenseRows();
        ret.push({ id: generateId(), expenseId: '', name: '', basePrice: 0, qty: totalRit || 1, total: 0 });
        renderRetRows(data);
    };

    document.getElementById('new-penjualan-form').onsubmit = (e) => {
        e.preventDefault();
        window.saveComplexTransaction(data);
    };

    if (window.focusFirstInput) setTimeout(() => window.focusFirstInput(container), 100);
}
window.initSalesForm = initSalesForm;

function renderSalesRows(data) {
    const container = document.getElementById('penjualan-rows-container');
    if (!container) return;
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
                if (row.unitPrice === undefined) row.unitPrice = b.unitPrice;
                if ((b.category || '').toLowerCase() === 'proyek' && (b.unit || '').toLowerCase() === 'ton') isProyekTon = true;
            }
        });

        let driverCountHtml = isProyekTon
            ? `<input type="number" class="form-control" style="background:#f8fafc; border-color:#cbd5e1; text-align:center" step="1" min="1" value="${row.driverCount || 1}" oninput="updateSalesRow('${row.id}', 'driverCount', this.value)">`
            : `<input type="text" class="form-control" style="background:#e2e8f0; border-color:#cbd5e1; color:#94a3b8; text-align:center;" value="-" readonly title="Tidak diperlukan">`;

        html += `
            <div class="d-flex align-center" style="gap:1rem; margin-bottom:0.5rem;" data-id="${row.id}">
                <div style="flex:2">
                    <select class="form-control sales-buyer" style="background:#f8fafc; border-color:#cbd5e1;" onchange="updateSalesRow('${row.id}', 'buyerId', this.value)">
                        ${options}
                    </select>
                </div>
                <div style="flex:0.8">${driverCountHtml}</div>
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
    window.updateNetProfitSummary();
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

        if (field === 'buyerId') {
            renderSalesRows(getData());
        } else {
            const rowEl = document.querySelector(`#penjualan-rows-container [data-id="${id}"]`);
            if (rowEl) {
                const totalInput = rowEl.querySelectorAll('input[readonly]')[1];
                const unitInput = rowEl.querySelectorAll('input[readonly]')[0];
                if (unitInput) unitInput.value = formatCurrency(row.unitPrice);
                if (totalInput) totalInput.value = formatCurrency(row.total);
            }
            window.updateNetProfitSummary();
        }
    }
    syncRetribusiQty(penjualanRows);
    syncLinkedExpensesQty(penjualanRows);
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

    const originalUpdate = window.updateSalesRow;
    window.updateSalesRow = (rid, field, val) => {
        originalUpdate(rid, field, val);
        if (rid === id) {
            const el = document.getElementById('setoran-modal-total');
            if (el) el.textContent = formatCurrency(row.unitPrice);
        }
    };

    window.openModal('Rincian Setoran', contentHtml);

    const origClose = window.closeModal;
    window.closeModal = () => {
        window.updateSalesRow = originalUpdate;
        origClose();
    };
};

window.removeSalesRow = (id) => {
    penjualanRows = penjualanRows.filter(r => r.id !== id);
    renderSalesRows(getData());
    syncRetribusiQty(penjualanRows);
    syncLinkedExpensesQty(penjualanRows);
};

export function saveComplexTransaction(data) {
    const date = document.getElementById('form-tx-date').value;
    const validSales = penjualanRows.filter(r => r.buyerId && r.qty > 0);
    if (validSales.length === 0) {
        alert('Minimal isi satu baris penjualan yang valid.');
        return;
    }

    let totalOps = 0;
    const opsExpenseRows = getOpsExpenseRows();
    const opsDetails = opsExpenseRows.filter(r => r.qty > 0 && (r.expenseId || r.name)).map(r => {
        totalOps += r.total;
        return { expenseId: r.expenseId, name: r.name, qty: r.qty, amount: r.total, category: 'Operasional' };
    });

    let totalRet = 0;
    const retExpenseRows = getRetExpenseRows();
    const retDetails = retExpenseRows.filter(r => r.qty > 0 && (r.expenseId || r.name)).map(r => {
        totalRet += r.total;
        return { expenseId: r.expenseId, name: r.name, qty: r.qty, amount: r.total, category: 'Retribusi' };
    });

    const totalAmount = validSales.reduce((acc, row) => acc + row.total, 0);
    const currentTxId = window.getCurrentEditTxId ? window.getCurrentEditTxId() : null;

    const transaction = {
        id: currentTxId || generateId(),
        date,
        buyerId: validSales[0]?.buyerId || null,
        driverId: null,
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
        status: 'Belum Lunas',
        created_at: new Date().toISOString()
    };

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

    if (currentTxId) {
        const idx = data.transactions.findIndex(t => t.id === currentTxId);
        if (idx > -1) {
            const old = data.transactions[idx];
            transaction.created_at = old.created_at;
            // Pertahankan data pembayaran yang sudah ada
            transaction.payments = old.payments || [];
            transaction.paidAmount = old.paidAmount || 0;
            transaction.paid_amount = old.paidAmount || 0;
            transaction.paidAt = old.paidAt || null;
            transaction.paymentMethod = old.paymentMethod || null;
            transaction.paymentNote = old.paymentNote || null;
            // Hitung ulang status berdasarkan total baru
            const info = window.getTransactionPaymentInfo ? window.getTransactionPaymentInfo(transaction) : null;
            transaction.status = info ? info.status : old.status;
            supabaseItem.status = transaction.status;
            data.transactions[idx] = transaction;
        }
        if (window.setCurrentEditTxId) window.setCurrentEditTxId(null);
        alert('Data Penjualan berhasil diperbarui!');
    } else {
        data.transactions.push(transaction);
        alert('Penjualan ritase/harian berhasil disimpan!');
    }

    saveData(data, 'transactions', supabaseItem);
    window.render_penjualan();
}
window.saveComplexTransaction = saveComplexTransaction;

export { penjualanRows };
