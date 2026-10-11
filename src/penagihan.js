// ============================================================
// src/penagihan.js — Penagihan, Piutang & Rekap Tagihan Pembeli
// ============================================================
import { getData, formatCurrency, formatDate } from './core.js';

export function getTransactionPaymentInfo(tx, buyerId = null) {
    if (!tx) {
        return { total: 0, paid: 0, remaining: 0, status: 'Belum Lunas', payments: [], lastPayment: null };
    }

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

    let remaining = Math.max(0, Math.round((total - paid) * 100) / 100);
    if (remaining < 0.5) remaining = 0;

    let status = 'Belum Lunas';
    if (paid >= total - 0.5 && total > 0) {
        status = 'Lunas';
        remaining = 0;
    } else if (paid > 0) {
        status = 'Sebagian';
    } else {
        status = 'Belum Lunas';
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

window.getTransactionPaymentInfo = getTransactionPaymentInfo;

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

    const allBuyerSales = [];
    (data.transactions || []).forEach(t => {
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

        if (txSales.length > 0) {
            txSales.forEach(s => {
                if (filterBuyerId && s.buyerId !== filterBuyerId) return;
                const payInfo = getTransactionPaymentInfo(t, s.buyerId);
                allBuyerSales.push({
                    txId: t.id,
                    date: t.date,
                    buyerId: s.buyerId,
                    qty: s.qty || 0,
                    amount: s.total || 0,
                    paidAmount: payInfo.paid,
                    remainingAmount: payInfo.remaining,
                    status: payInfo.status
                });
            });
        } else if (t.buyerId) {
            if (filterBuyerId && t.buyerId !== filterBuyerId) return;
            const payInfo = getTransactionPaymentInfo(t, t.buyerId);
            allBuyerSales.push({
                txId: t.id,
                date: t.date,
                buyerId: t.buyerId,
                qty: 1,
                amount: t.totalAmount || 0,
                paidAmount: payInfo.paid,
                remainingAmount: payInfo.remaining,
                status: payInfo.status
            });
        }
    });

    if (selectBuyerEl && selectBuyerEl.options.length <= 1) {
        selectBuyerEl.innerHTML = '<option value="">Semua Pelanggan</option>';
        data.buyers.forEach(b => {
            selectBuyerEl.innerHTML += `<option value="${b.id}">${b.name}</option>`;
        });
    }

    const grouped = {};
    let grandTotalSales = 0;
    let grandTotalPaid = 0;
    let grandTotalUnpaid = 0;

    allBuyerSales.forEach(item => {
        if (!grouped[item.buyerId]) {
            grouped[item.buyerId] = [];
        }
        grouped[item.buyerId].push(item);
        grandTotalSales += item.amount;
        grandTotalPaid += item.paidAmount;
        grandTotalUnpaid += item.remainingAmount;
    });

    const buyerIdsToRender = filterBuyerId ? (grouped[filterBuyerId] ? [filterBuyerId] : []) : Object.keys(grouped);

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

        const rowsHtml = segments.map(s => {
            const isLunas = s.status === 'Lunas';
            const isPartial = s.status === 'Sebagian';
            const badgeClass = isLunas ? 'success' : isPartial ? 'warning' : 'danger';
            const badgeLabel = isLunas ? 'Lunas' : isPartial ? 'Sebagian' : 'Belum Lunas';

            return `
                <tr>
                    <td>${formatDate(s.date)}</td>
                    <td>${s.qty} Ritase</td>
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

        buyersCardsHtml += `
            <div class="card" style="margin-bottom:1.5rem; border:1px solid #cbd5e1;">
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
                <div class="card-body" style="padding:0">
                    <div class="table-responsive">
                        <table class="table" style="margin:0">
                            <thead>
                                <tr>
                                    <th>Tanggal</th>
                                    <th>Qty</th>
                                    <th>Total Tagihan</th>
                                    <th>Sudah Dibayar</th>
                                    <th>Sisa Piutang</th>
                                    <th>Status</th>
                                    <th>Aksi</th>
                                </tr>
                            </thead>
                            <tbody>${rowsHtml}</tbody>
                        </table>
                    </div>
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
