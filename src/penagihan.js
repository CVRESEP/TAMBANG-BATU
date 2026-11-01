// ============================================================
// src/penagihan.js — Penagihan, Piutang & Rekap Tagihan Pembeli
// ============================================================
import { getData, formatCurrency, formatDate, getWeekRange } from './core.js';

const parseArr = (v) => {
    if (Array.isArray(v)) return v;
    if (typeof v === 'string' && v.trim()) {
        try { const p = JSON.parse(v); return Array.isArray(p) ? p : []; } catch (e) { return []; }
    }
    return [];
};
const round2 = (n) => Math.round((parseFloat(n) || 0) * 100) / 100;

export function getTransactionPaymentInfo(tx, buyerId = null) {
    if (!tx) {
        return { total: 0, paid: 0, remaining: 0, status: 'Belum Lunas', payments: [], lastPayment: null };
    }

    const txSales = parseArr(tx.sales);
    let txTotal = parseFloat(tx.totalAmount ?? tx.totalamount) || 0;
    if (txTotal === 0 && txSales.length > 0) {
        txTotal = txSales.reduce((sum, s) => sum + (parseFloat(s.total) || 0), 0);
    }
    const txBuyerId = tx.buyerId || tx.buyerid || null;
    const distinctBuyers = new Set(txSales.map(s => s.buyerId).filter(Boolean));
    const isMultiBuyer = distinctBuyers.size > 1;

    // Total tagihan
    let total = txTotal;
    if (buyerId) {
        if (txSales.length > 0) {
            const buyerSales = txSales.filter(s => s.buyerId === buyerId);
            total = buyerSales.reduce((sum, s) => sum + (parseFloat(s.total) || 0), 0);
        } else {
            total = txBuyerId === buyerId ? txTotal : 0;
        }
    }

    // Pembayaran
    const allPayments = parseArr(tx.payments);
    let payments = allPayments;
    let paid = 0;

    if (allPayments.length > 0) {
        if (buyerId && isMultiBuyer) {
            // Pembayaran bertanda buyerId milik pembeli ini
            payments = allPayments.filter(p => p.buyerId === buyerId);
            paid = payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
            // Pembayaran lama tanpa buyerId dibagi proporsional
            const legacy = allPayments.filter(p => !p.buyerId);
            if (legacy.length > 0 && txTotal > 0) {
                const legacySum = legacy.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
                paid += legacySum * (total / txTotal);
                payments = [...payments, ...legacy];
            }
        } else {
            paid = allPayments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0);
        }
    } else {
        const legacyPaid = parseFloat(tx.paidAmount ?? tx.paid_amount) || 0;
        if (legacyPaid > 0) {
            paid = (buyerId && isMultiBuyer && txTotal > 0) ? legacyPaid * (total / txTotal) : legacyPaid;
        } else if (tx.status === 'Lunas') {
            paid = total;
        }
    }

    total = round2(total);
    paid = round2(paid);

    let remaining = Math.max(0, round2(total - paid));
    if (remaining < 0.5) remaining = 0;

    let status = 'Belum Lunas';
    if (total > 0 && paid >= total - 0.5) {
        status = 'Lunas';
        remaining = 0;
    } else if (paid > 0) {
        status = 'Sebagian';
    }

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

    return { total, paid, remaining, status, payments, lastPayment };
}

// Simpan pembayaran ke transaksi + hitung ulang status keseluruhan transaksi
export function buildTxPaymentUpdate(tx, payments) {
    const totalPaid = round2(payments.reduce((sum, p) => sum + (parseFloat(p.amount) || 0), 0));
    tx.payments = payments;
    tx.paidAmount = totalPaid;
    tx.paid_amount = totalPaid;
    const last = payments[payments.length - 1];
    tx.paidAt = last ? last.date : null;
    tx.paymentMethod = last ? last.method : null;
    tx.status = 'Belum Lunas';
    tx.status = getTransactionPaymentInfo(tx).status;
    return {
        id: tx.id,
        payments: JSON.stringify(payments),
        paid_amount: totalPaid,
        paid_at: tx.paidAt,
        payment_method: tx.paymentMethod,
        status: tx.status
    };
}
window.getTransactionPaymentInfo = getTransactionPaymentInfo;

// ---- Multi-select filter pembeli ----
const selectedPenagihanBuyers = new Set();
const escHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function updatePenagihanBuyerLabel() {
    const label = document.getElementById('filter-penagihan-buyer-label');
    if (!label) return;
    const n = selectedPenagihanBuyers.size;
    if (n === 0) { label.textContent = 'Semua Pembeli'; return; }
    if (n === 1) {
        const id = [...selectedPenagihanBuyers][0];
        const b = (getData().buyers || []).find(x => x.id === id);
        label.textContent = b ? b.name : '1 pembeli';
        return;
    }
    label.textContent = `${n} pembeli dipilih`;
}

function renderPenagihanBuyerOptions() {
    const box = document.getElementById('filter-penagihan-buyer-options');
    if (!box) return;
    const buyers = [...(getData().buyers || [])].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    // Buang pilihan yang pembelinya sudah tidak ada
    [...selectedPenagihanBuyers].forEach(id => { if (!buyers.some(b => b.id === id)) selectedPenagihanBuyers.delete(id); });
    box.innerHTML = buyers.length ? buyers.map(b => `
        <label class="ms-option" data-name="${escHtml((b.name || '').toLowerCase())}" style="display:flex; align-items:center; gap:0.5rem; padding:0.35rem 0.4rem; border-radius:6px; cursor:pointer; font-size:0.85rem; color:#1e293b;" onmouseover="this.style.background='#f1f5f9'" onmouseout="this.style.background=''">
            <input type="checkbox" value="${escHtml(b.id)}" ${selectedPenagihanBuyers.has(b.id) ? 'checked' : ''} onchange="togglePenagihanBuyer(this.value, this.checked)">
            <span>${escHtml(b.name)}</span>
        </label>`).join('') : '<div style="padding:0.5rem; font-size:0.8rem; color:#94a3b8;">Belum ada data pembeli</div>';
    const search = document.getElementById('filter-penagihan-buyer-search');
    if (search && search.value) window.filterPenagihanBuyerOptions(search.value);
    updatePenagihanBuyerLabel();
}

window.togglePenagihanBuyerDropdown = (e) => {
    if (e) e.stopPropagation();
    const panel = document.getElementById('filter-penagihan-buyer-panel');
    if (!panel) return;
    const open = panel.style.display === 'none';
    if (open) renderPenagihanBuyerOptions();
    panel.style.display = open ? 'block' : 'none';
    if (open) document.getElementById('filter-penagihan-buyer-search')?.focus();
};

window.togglePenagihanBuyer = (id, checked) => {
    if (checked) selectedPenagihanBuyers.add(id); else selectedPenagihanBuyers.delete(id);
    updatePenagihanBuyerLabel();
    window.render_penagihan();
};

window.setAllPenagihanBuyers = (selectAll) => {
    selectedPenagihanBuyers.clear();
    if (selectAll) {
        document.querySelectorAll('#filter-penagihan-buyer-options .ms-option').forEach(el => {
            if (el.style.display !== 'none') selectedPenagihanBuyers.add(el.querySelector('input').value);
        });
    }
    renderPenagihanBuyerOptions();
    window.render_penagihan();
};

window.filterPenagihanBuyerOptions = (q) => {
    const term = (q || '').toLowerCase().trim();
    document.querySelectorAll('#filter-penagihan-buyer-options .ms-option').forEach(el => {
        el.style.display = !term || el.dataset.name.includes(term) ? 'flex' : 'none';
    });
};

document.addEventListener('click', (e) => {
    const wrap = document.getElementById('filter-penagihan-buyer');
    const panel = document.getElementById('filter-penagihan-buyer-panel');
    if (wrap && panel && !wrap.contains(e.target)) panel.style.display = 'none';
});

window.getSelectedPenagihanBuyers = () => [...selectedPenagihanBuyers];

window.render_penagihan = () => {
    const data = getData();
    const container = document.getElementById('penagihan-content') || document.querySelector('#penagihan .card-body');
    if (!container) return;

    const selectBuyerEl = document.getElementById('filter-penagihan-buyer');
    const startEl = document.getElementById('filter-penagihan-start');
    const endEl = document.getElementById('filter-penagihan-end');
    const statusEl = document.getElementById('filter-penagihan-status');

    const filterSet = selectedPenagihanBuyers;
    const matchBuyer = (id) => filterSet.size === 0 || filterSet.has(id);
    const startDate = startEl ? startEl.value : '';
    const endDate = endEl ? endEl.value : '';
    const filterStatus = statusEl ? statusEl.value : '';

    const allBuyerSales = [];
    (data.transactions || []).forEach(t => {
        if (startDate && t.date < startDate) return;
        if (endDate && t.date > endDate) return;

        const txSales = parseArr(t.sales);

        if (txSales.length > 0) {
            // Gabungkan baris pembeli yang sama dalam satu transaksi
            const perBuyer = {};
            txSales.forEach(s => {
                if (!s.buyerId) return;
                if (!matchBuyer(s.buyerId)) return;
                perBuyer[s.buyerId] = (perBuyer[s.buyerId] || 0) + (parseFloat(s.qty) || 0);
            });
            Object.entries(perBuyer).forEach(([bId, qty]) => {
                const payInfo = getTransactionPaymentInfo(t, bId);
                allBuyerSales.push({
                    txId: t.id, date: t.date, buyerId: bId, qty,
                    amount: payInfo.total,
                    paidAmount: payInfo.paid,
                    remainingAmount: payInfo.remaining,
                    status: payInfo.status
                });
            });
        } else if (t.buyerId) {
            if (!matchBuyer(t.buyerId)) return;
            const payInfo = getTransactionPaymentInfo(t, t.buyerId);
            allBuyerSales.push({
                txId: t.id, date: t.date, buyerId: t.buyerId, qty: 1,
                amount: payInfo.total,
                paidAmount: payInfo.paid,
                remainingAmount: payInfo.remaining,
                status: payInfo.status
            });
        }
    });
    allBuyerSales.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    if (selectBuyerEl) updatePenagihanBuyerLabel();

    const grouped = {};
    let grandTotalSales = 0;
    let grandTotalPaid = 0;
    let grandTotalUnpaid = 0;

    allBuyerSales.forEach(item => {
        if (filterStatus && item.status !== filterStatus) return;
        if (!grouped[item.buyerId]) {
            grouped[item.buyerId] = [];
        }
        grouped[item.buyerId].push(item);
        grandTotalSales += item.amount;
        grandTotalPaid += item.paidAmount;
        grandTotalUnpaid += item.remainingAmount;
    });

    const buyerIdsToRender = Object.keys(grouped).sort((a, b) => {
        const na = (data.buyers.find(x => x.id === a) || {}).name || a;
        const nb = (data.buyers.find(x => x.id === b) || {}).name || b;
        return na.localeCompare(nb);
    });

    let buyersCardsHtml = '';
    buyerIdsToRender.forEach(buyerId => {
        const buyer = data.buyers.find(b => b.id === buyerId) || { name: `Pembeli (${buyerId})` };
        let segments = grouped[buyerId] || [];

        if (filterStatus) {
            segments = segments.filter(s => s.status === filterStatus);
        }

        if (segments.length === 0) return;

        const bTotal = segments.reduce((sum, s) => sum + s.amount, 0);
        const bPaid = segments.reduce((sum, s) => sum + s.paidAmount, 0);
        const bUnpaid = segments.reduce((sum, s) => sum + s.remainingAmount, 0);

        // Kelompokkan transaksi per minggu (Senin - Minggu)
        const weekGroupsMap = {};
        segments.forEach(s => {
            const w = getWeekRange(s.date);
            if (!weekGroupsMap[w.key]) {
                weekGroupsMap[w.key] = {
                    startDate: w.startDate,
                    endDate: w.endDate,
                    label: w.label,
                    items: []
                };
            }
            weekGroupsMap[w.key].items.push(s);
        });

        const weekGroups = Object.values(weekGroupsMap).sort((a, b) => a.startDate.localeCompare(b.startDate));

        const weekTablesHtml = weekGroups.map((w, wIdx) => {
            const wNum = wIdx + 1;
            const wQty = w.items.reduce((sum, s) => sum + (parseFloat(s.qty) || 0), 0);
            const wSales = w.items.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0);
            const wPaid = w.items.reduce((sum, s) => sum + (parseFloat(s.paidAmount) || 0), 0);
            const wUnpaid = w.items.reduce((sum, s) => sum + (parseFloat(s.remainingAmount) || 0), 0);

            const itemRows = w.items.map(s => {
                const isLunas = s.status === 'Lunas';
                const isPartial = s.status === 'Sebagian';
                const badgeClass = isLunas ? 'success' : isPartial ? 'warning' : 'danger';
                const badgeLabel = isLunas ? 'Lunas' : isPartial ? 'Sebagian' : 'Belum Lunas';
                const unitPrice = s.qty > 0 ? (s.amount / s.qty) : 0;

                return `
                    <tr>
                        <td>${formatDate(s.date)}</td>
                        <td>${s.qty} Rit</td>
                        <td style="color:#475569;">${formatCurrency(unitPrice)}</td>
                        <td style="font-weight:600">${formatCurrency(s.amount)}</td>
                        <td style="color:#059669; font-weight:600">${formatCurrency(s.paidAmount)}</td>
                        <td style="color:#dc2626; font-weight:700">${formatCurrency(s.remainingAmount)}</td>
                        <td><span class="badge ${badgeClass}">${badgeLabel}</span></td>
                        <td>
                            <div class="d-flex" style="gap:0.3rem">
                                ${!isLunas ? `<button class="btn btn-sm btn-primary" onclick="openPaymentModal('${s.txId}', '${buyerId}')">Bayar</button>` : ''}
                                ${s.paidAmount > 0 ? `<button class="btn btn-sm" style="background:#e0f2fe; color:#0284c7;" onclick="openPaymentHistoryModal('${s.txId}', '${buyerId}')">Riwayat</button>` : ''}
                            </div>
                        </td>
                    </tr>
                `;
            }).join('');

            return `
                <div style="margin-bottom:1rem; border:1px solid #cbd5e1; border-radius:6px; overflow:hidden;">
                    <div style="background:#e0f2fe; color:#0369a1; padding:0.45rem 0.75rem; font-size:0.82rem; font-weight:700; display:flex; justify-content:space-between; align-items:center;">
                        <div>
                            <span class="badge" style="background:#0284c7; color:white; font-size:0.75rem; margin-right:0.5rem; font-weight:700;">Minggu ${wNum}</span>
                            <span>Periode: <strong>${w.label}</strong></span>
                        </div>
                        <span style="font-weight:600; font-size:0.8rem; color:#0369a1;">${w.items.length} Transaksi</span>
                    </div>
                    <div class="table-responsive">
                        <table class="table" style="margin:0">
                            <thead>
                                <tr>
                                    <th>Tanggal</th>
                                    <th>Qty</th>
                                    <th>Harga / Rit</th>
                                    <th>Total Tagihan</th>
                                    <th>Sudah Dibayar</th>
                                    <th>Sisa Piutang</th>
                                    <th>Status</th>
                                    <th>Aksi</th>
                                </tr>
                            </thead>
                            <tbody>${itemRows}</tbody>
                            <tfoot>
                                <tr style="background:#f0f9ff; font-weight:700; font-size:0.82rem;">
                                    <td style="text-align:right; color:#0369a1;">Subtotal Minggu ${wNum}:</td>
                                    <td style="font-weight:700;">${wQty} Rit</td>
                                    <td></td>
                                    <td style="font-weight:700;">${formatCurrency(wSales)}</td>
                                    <td style="color:#059669; font-weight:700;">${formatCurrency(wPaid)}</td>
                                    <td style="color:#dc2626; font-weight:800;">${formatCurrency(wUnpaid)}</td>
                                    <td colspan="2"></td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>
                </div>
            `;
        }).join('');

        buyersCardsHtml += `
            <div class="card" data-penagihan-buyer="${buyerId}" style="margin-bottom:1.5rem; border:1px solid #cbd5e1;">
                <div class="card-header" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.5rem; background:#f8fafc;">
                    <div>
                        <h3 style="font-size:1.1rem; color:#1e293b; margin:0;">${buyer.name}</h3>
                        <span style="font-size:0.8rem; color:#64748b;">Tagihan: ${formatCurrency(bTotal)} | Terbayar: ${formatCurrency(bPaid)} | Sisa: <strong style="color:#dc2626">${formatCurrency(bUnpaid)}</strong></span>
                    </div>
                    <div class="d-flex" style="gap:0.5rem">
                        ${bUnpaid > 0 ? `<button class="btn btn-sm btn-primary" onclick="openBulkPaymentAllocationModal('${buyerId}')"><span class="material-symbols-outlined" style="font-size:16px;">price_check</span> Bayar Sekaligus</button>` : ''}
                        <button class="btn btn-sm" style="background:#0ea5e9; color:white;" onclick="exportTagihanPDF('${buyerId}')"><span class="material-symbols-outlined" style="font-size:16px;">download</span> Invoice PDF</button>
                    </div>
                </div>
                <div class="card-body" style="padding:1rem">
                    ${weekTablesHtml}
                </div>
            </div>
        `;
    });

    container.innerHTML = `
        <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(220px, 1fr)); gap:1rem; margin-bottom:1.5rem;">
            <div style="background:white; padding:1.2rem; border-radius:8px; border:1px solid #e2e8f0; border-left:4px solid #3b82f6;">
                <div style="font-size:0.75rem; color:#64748b; font-weight:600; text-transform:uppercase;">Total Tagihan</div>
                <div style="font-size:1.3rem; font-weight:700; color:#1e293b; margin-top:0.25rem;">${formatCurrency(grandTotalSales)}</div>
            </div>
            <div style="background:white; padding:1.2rem; border-radius:8px; border:1px solid #e2e8f0; border-left:4px solid #10b981;">
                <div style="font-size:0.75rem; color:#64748b; font-weight:600; text-transform:uppercase;">Sudah Terbayar</div>
                <div style="font-size:1.3rem; font-weight:700; color:#059669; margin-top:0.25rem;">${formatCurrency(grandTotalPaid)}</div>
            </div>
            <div style="background:white; padding:1.2rem; border-radius:8px; border:1px solid #e2e8f0; border-left:4px solid #ef4444;">
                <div style="font-size:0.75rem; color:#64748b; font-weight:600; text-transform:uppercase;">Total Sisa Piutang</div>
                <div style="font-size:1.3rem; font-weight:700; color:#dc2626; margin-top:0.25rem;">${formatCurrency(grandTotalUnpaid)}</div>
            </div>
        </div>
        ${buyersCardsHtml || '<div class="text-center text-muted" style="padding:3rem;">Tidak ada transaksi penagihan pada rentang filter ini.</div>'}
    `;
};
