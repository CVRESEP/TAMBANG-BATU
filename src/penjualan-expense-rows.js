// ============================================================
// src/penjualan-expense-rows.js — Baris Operasional, Retribusi & Keyboard Nav
// ============================================================
import { getData, formatCurrency } from './core.js';

let opsExpenseRows = [];
let retExpenseRows = [];

export function getOpsExpenseRows() { return opsExpenseRows; }
export function setOpsExpenseRows(rows) { opsExpenseRows = rows; }
export function getRetExpenseRows() { return retExpenseRows; }
export function setRetExpenseRows(rows) { retExpenseRows = rows; }

export function calculateTotalRitase(penjualanRows) {
    let total = 0;
    const data = getData();
    (penjualanRows || []).forEach(row => {
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
window.calculateTotalRitase = calculateTotalRitase;

export function syncLinkedExpensesQty(penjualanRows) {
    let updated = false;
    const data = getData();
    
    if (opsExpenseRows) {
        opsExpenseRows.forEach(r => {
            const expData = data.expenseTypes.find(e => e.id === r.expenseId);
            if (expData && expData.linkedBuyerId) {
                const totalQty = (penjualanRows || [])
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

    if (retExpenseRows) {
        retExpenseRows.forEach(r => {
            const expData = data.expenseTypes.find(e => e.id === r.expenseId);
            if (expData && expData.linkedBuyerId) {
                const totalQty = (penjualanRows || [])
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
        renderOpsRows(data);
        renderRetRows(data);
        window.updateNetProfitSummary();
    }
}
window.syncLinkedExpensesQty = syncLinkedExpensesQty;

export function syncRetribusiQty(penjualanRows) {
    let totalRit = calculateTotalRitase(penjualanRows);
    let updated = false;
    retExpenseRows.forEach(r => {
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
        window.updateNetProfitSummary();
    }
}
window.syncRetribusiQty = syncRetribusiQty;

export function handleVerticalTab(e, colClass, nextColClass, prevColClass) {
    if (e.key === 'Tab') {
        const inputs = Array.from(document.querySelectorAll('.' + colClass)).filter(el => el.offsetParent !== null);
        const index = inputs.indexOf(e.target);
        
        if (e.shiftKey) {
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
}
window.handleVerticalTab = handleVerticalTab;

export function renderOpsRows(data) {
    const container = document.getElementById('ops-rows-container');
    if (!container) return;
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
                    <datalist id="ops-list-${row.id}">${options}</datalist>
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
    window.updateNetProfitSummary();
}
window.renderOpsRows = renderOpsRows;

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
            const exp = getData().expenseTypes.find(e => e.id === value);
            if (exp) { row.name = exp.name; row.basePrice = exp.basePrice || 0; }
        }
        if (field === 'customName') {
            if (!value.trim()) return;
            row.name = value.trim();
            let exp = getData().expenseTypes.find(e => e.name.toLowerCase() === row.name.toLowerCase() && e.category === 'Operasional');
            if (exp) { row.expenseId = exp.id; row.basePrice = exp.basePrice || 0; }
            else { row.expenseId = null; row.basePrice = 0; }
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
            window.updateNetProfitSummary();
        }
    }
};

window.removeOpsRow = (id) => {
    opsExpenseRows = opsExpenseRows.filter(r => r.id !== id);
    renderOpsRows(getData());
};

export function renderRetRows(data) {
    const container = document.getElementById('ret-rows-container');
    if (!container) return;
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
                    <datalist id="ret-list-${row.id}">${options}</datalist>
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
    window.updateNetProfitSummary();
}
window.renderRetRows = renderRetRows;

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
            const exp = getData().expenseTypes.find(e => e.id === value);
            if (exp) { row.name = exp.name; row.basePrice = exp.basePrice || 0; }
        }
        if (field === 'customName') {
            if (!value.trim()) return;
            row.name = value.trim();
            let exp = getData().expenseTypes.find(e => e.name.toLowerCase() === row.name.toLowerCase() && e.category === 'Retribusi');
            if (exp) { row.expenseId = exp.id; row.basePrice = exp.basePrice || 0; }
            else { row.expenseId = null; row.basePrice = 0; }
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
            window.updateNetProfitSummary();
        }
    }
};

window.removeRetRow = (id) => {
    retExpenseRows = retExpenseRows.filter(r => r.id !== id);
    renderRetRows(getData());
};

export { opsExpenseRows, retExpenseRows };
