// ============================================================
// src/penagihan-modal.js — Modal Pembayaran, Alokasi & Riwayat
// ============================================================
import { getData, saveData, generateId, formatCurrency, formatDate, showToast } from './core.js';
import { getTransactionPaymentInfo, buildTxPaymentUpdate } from './penagihan.js';

const readPayments = (tx) => {
    if (Array.isArray(tx.payments)) return [...tx.payments];
    if (typeof tx.payments === 'string' && tx.payments.trim()) {
        try { const p = JSON.parse(tx.payments); return Array.isArray(p) ? p : []; } catch (e) { return []; }
    }
    return [];
};

window.openPaymentModal = (txId, buyerId) => {
    const data = getData();
    const tx = data.transactions.find(t => t.id === txId);
    if (!tx) return;

    const buyer = data.buyers.find(b => b.id === buyerId) || { name: 'Pelanggan' };
    const payInfo = getTransactionPaymentInfo(tx, buyerId);

    const formHtml = `
        <form id="form-single-payment" autocomplete="off">
            <div style="background:#f8fafc; padding:1rem; border-radius:6px; border:1px solid #e2e8f0; margin-bottom:1rem; font-size:0.85rem;">
                <div><strong>${buyer.name}</strong> • Transaksi ${formatDate(tx.date)}</div>
                <div style="margin-top:0.25rem;">Total: ${formatCurrency(payInfo.total)} | Sudah Bayar: ${formatCurrency(payInfo.paid)}</div>
                <div style="font-weight:700; color:#dc2626; margin-top:0.25rem; font-size:0.95rem;">Sisa Tagihan: ${formatCurrency(payInfo.remaining)}</div>
            </div>
            <div class="form-group">
                <label>Tanggal Pembayaran</label>
                <input type="date" id="pay-date" class="form-control" value="${new Date().toISOString().split('T')[0]}" required>
            </div>
            <div class="form-group">
                <label>Jumlah Bayar (Rp)</label>
                <input type="number" id="pay-amount" class="form-control" value="${payInfo.remaining}" max="${payInfo.remaining}" min="1" required>
            </div>
            <div class="form-group">
                <label>Metode Pembayaran</label>
                <select id="pay-method" class="form-control">
                    <option value="Tunai / Cash">Tunai / Cash</option>
                    <option value="Transfer Bank">Transfer Bank</option>
                    <option value="Giro / Cek">Giro / Cek</option>
                </select>
            </div>
            <div class="form-group">
                <label>Catatan / Keterangan</label>
                <input type="text" id="pay-note" class="form-control" placeholder="Contoh: Titip di kantor, No. Rek BNI, dll">
            </div>
            <div class="form-actions" style="margin-top:1.5rem;">
                <button type="button" class="btn" onclick="closeModal()">Batal</button>
                <button type="submit" class="btn btn-primary">Simpan Pembayaran</button>
            </div>
        </form>
    `;

    window.openModal('Catat Pembayaran', formHtml);

    document.getElementById('form-single-payment').onsubmit = async (e) => {
        e.preventDefault();
        const date = document.getElementById('pay-date').value;
        const amount = parseFloat(document.getElementById('pay-amount').value) || 0;
        const method = document.getElementById('pay-method').value;
        const note = document.getElementById('pay-note').value;

        if (amount <= 0) return;
        if (amount > payInfo.remaining + 0.5) {
            showToast('Jumlah bayar melebihi sisa tagihan!', 'error');
            return;
        }

        const payments = readPayments(tx);
        payments.push({ id: generateId(), buyerId, date, amount, method, note, created_at: new Date().toISOString() });

        await saveData(data, 'transactions', buildTxPaymentUpdate(tx, payments));

        window.closeModal();
        window.render_penagihan();
        showToast('Pembayaran berhasil disimpan!');
    };
};

window.openBulkPaymentAllocationModal = (buyerId) => {
    const data = getData();
    const buyer = data.buyers.find(b => b.id === buyerId);
    if (!buyer) return;

    const unpaidTxs = [];
    (data.transactions || []).forEach(t => {
        const payInfo = getTransactionPaymentInfo(t, buyerId);
        if (payInfo.remaining > 0) {
            unpaidTxs.push({ tx: t, remaining: payInfo.remaining, total: payInfo.total, paid: payInfo.paid });
        }
    });

    unpaidTxs.sort((a, b) => (a.tx.date || '').localeCompare(b.tx.date || ''));
    const totalRemainingBuyer = unpaidTxs.reduce((sum, x) => sum + x.remaining, 0);

    const formHtml = `
        <form id="form-bulk-payment" autocomplete="off">
            <div style="background:#f8fafc; padding:1rem; border-radius:6px; border:1px solid #e2e8f0; margin-bottom:1rem; font-size:0.85rem;">
                <div style="font-weight:700; color:#1e293b;">Pelanggan: ${buyer.name}</div>
                <div>Ada <strong>${unpaidTxs.length} transaksi</strong> belum lunas.</div>
                <div style="font-weight:700; color:#dc2626; margin-top:0.25rem;">Total Piutang: ${formatCurrency(totalRemainingBuyer)}</div>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:0.75rem;">
                <div class="form-group">
                    <label>Tanggal Pembayaran</label>
                    <input type="date" id="bulk-pay-date" class="form-control" value="${new Date().toISOString().split('T')[0]}" required>
                </div>
                <div class="form-group">
                    <label>Metode</label>
                    <select id="bulk-pay-method" class="form-control">
                        <option value="Transfer Bank">Transfer Bank</option>
                        <option value="Tunai / Cash">Tunai / Cash</option>
                        <option value="Giro / Cek">Giro / Cek</option>
                    </select>
                </div>
            </div>
            <div class="form-group">
                <label>Jumlah Uang Masuk (Rp)</label>
                <div style="display:flex; gap:0.5rem;">
                    <input type="number" id="bulk-pay-amount" class="form-control" value="${totalRemainingBuyer}" min="1" required oninput="recalculateBulkAllocations()">
                    <button type="button" class="btn" style="background:#e2e8f0; font-size:0.8rem;" onclick="setBulkPayAll(${totalRemainingBuyer})">Lunas Semua</button>
                </div>
            </div>
            <div style="margin-top:1rem; max-height:220px; overflow-y:auto; border:1px solid #e2e8f0; border-radius:6px;">
                <table class="table" style="font-size:0.8rem; margin:0;">
                    <thead style="background:#f1f5f9;">
                        <tr>
                            <th>Tanggal</th>
                            <th>Sisa</th>
                            <th>Alokasi Bayar</th>
                        </tr>
                    </thead>
                    <tbody id="bulk-alloc-tbody">
                        ${unpaidTxs.map((x) => `
                            <tr>
                                <td>${formatDate(x.tx.date)}</td>
                                <td>${formatCurrency(x.remaining)}</td>
                                <td><input type="number" class="form-control form-control-sm bulk-alloc-input" data-txid="${x.tx.id}" data-max="${x.remaining}" value="${x.remaining}" max="${x.remaining}" min="0"></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            <div class="form-actions" style="margin-top:1.5rem;">
                <button type="button" class="btn" onclick="closeModal()">Batal</button>
                <button type="submit" class="btn btn-primary">Terapkan Pembayaran</button>
            </div>
        </form>
    `;

    window.openModal(`Bayar Sekaligus: ${buyer.name}`, formHtml);

    window.setBulkPayAll = (tot) => {
        const input = document.getElementById('bulk-pay-amount');
        if (input) { input.value = tot; window.recalculateBulkAllocations(); }
    };

    window.recalculateBulkAllocations = () => {
        let budget = parseFloat(document.getElementById('bulk-pay-amount')?.value) || 0;
        const inputs = document.querySelectorAll('.bulk-alloc-input');
        inputs.forEach(inp => {
            const max = parseFloat(inp.getAttribute('data-max')) || 0;
            const take = Math.min(budget, max);
            inp.value = take;
            budget -= take;
        });
    };

    document.getElementById('form-bulk-payment').onsubmit = async (e) => {
        e.preventDefault();
        const payDate = document.getElementById('bulk-pay-date').value;
        const method = document.getElementById('bulk-pay-method').value;
        const inputs = document.querySelectorAll('.bulk-alloc-input');

        const batchId = generateId();
        const saves = [];
        inputs.forEach(inp => {
            const alloc = parseFloat(inp.value) || 0;
            if (alloc > 0) {
                const txId = inp.getAttribute('data-txid');
                const tx = data.transactions.find(t => t.id === txId);
                if (tx) {
                    const payments = readPayments(tx);
                    payments.push({ id: generateId(), batchId, buyerId, date: payDate, amount: alloc, method, note: 'Alokasi Bayar Sekaligus', created_at: new Date().toISOString() });
                    saves.push(saveData(data, 'transactions', buildTxPaymentUpdate(tx, payments)));
                }
            }
        });
        await Promise.all(saves);

        window.closeModal();
        window.render_penagihan();
        showToast('Pembayaran sekaligus berhasil diterapkan!');
    };
};

window.openPaymentHistoryModal = (txId, buyerId) => {
    const data = getData();
    const tx = data.transactions.find(t => t.id === txId);
    if (!tx) return;

    const payments = getTransactionPaymentInfo(tx, buyerId).payments;

    const contentHtml = `
        <div style="padding:0.5rem;">
            <div style="margin-bottom:1rem; font-size:0.85rem; color:#64748b;">Transaksi Tanggal: ${formatDate(tx.date)}</div>
            <div class="table-responsive">
                <table class="table" style="font-size:0.85rem;">
                    <thead><tr><th>Tanggal</th><th>Metode</th><th>Catatan</th><th>Jumlah</th><th>Aksi</th></tr></thead>
                    <tbody>
                        ${payments.map(p => `
                            <tr>
                                <td>${formatDate(p.date)}</td>
                                <td>${p.method || '-'}</td>
                                <td>${p.note || '-'}</td>
                                <td style="font-weight:600; color:#059669">${formatCurrency(p.amount)}</td>
                                <td><button class="btn-icon text-danger" onclick="deletePaymentEntry('${txId}', '${p.id}', '${buyerId}')"><span class="material-symbols-outlined">delete</span></button></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            <div class="form-actions" style="margin-top:1.5rem;">
                <button type="button" class="btn" onclick="closeModal()">Tutup</button>
            </div>
        </div>
    `;

    window.openModal('Riwayat Pembayaran', contentHtml);
};

window.deletePaymentEntry = async (txId, paymentId, buyerId) => {
    if (!confirm('Hapus entri pembayaran ini?')) return;
    const data = getData();
    const tx = data.transactions.find(t => t.id === txId);
    if (!tx) return;

    let payments = readPayments(tx).filter(p => p.id !== paymentId);
    await saveData(data, 'transactions', buildTxPaymentUpdate(tx, payments));
    window.closeModal();
    window.render_penagihan();
    showToast('Entri pembayaran berhasil dihapus.');
};

window.cancelPayment = async (txId) => {
    if (!confirm('Batalkan seluruh pembayaran transaksi ini?')) return;
    const data = getData();
    const tx = data.transactions.find(t => t.id === txId);
    if (!tx) return;

    tx.status = 'Belum Lunas';
    await saveData(data, 'transactions', buildTxPaymentUpdate(tx, []));
    window.render_penagihan();
    showToast('Pembayaran dibatalkan.');
};

// ============================================================
// Pembayaran Masuk — daftar seluruh uang masuk + cetak
// ============================================================
const escHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// Filter milik modal Pembayaran Masuk (awalnya meniru filter halaman Penagihan)
const incomingFilter = { start: '', end: '', buyers: new Set() };

function syncIncomingFilterFromPage() {
    incomingFilter.start = document.getElementById('filter-penagihan-start')?.value || '';
    incomingFilter.end = document.getElementById('filter-penagihan-end')?.value || '';
    incomingFilter.buyers = new Set(window.getSelectedPenagihanBuyers ? window.getSelectedPenagihanBuyers() : []);
}

function collectIncomingPayments() {
    const data = getData();
    const buyers = data.buyers || [];
    const buyerName = (id) => (buyers.find(b => b.id === id) || {}).name || '';
    const startDate = incomingFilter.start;
    const endDate = incomingFilter.end;
    const selected = [...incomingFilter.buyers];
    const matchBuyer = (ids) => selected.length === 0 || ids.some(id => selected.includes(id));

    // Pembayaran sekaligus (satu uang masuk dialokasikan ke banyak transaksi) digabung jadi satu baris global
    const BULK_NOTE = 'Alokasi Bayar Sekaligus';
    const groups = new Map();
    let seq = 0;

    (data.transactions || []).forEach(tx => {
        const sales = readSales(tx);
        const txBuyerIds = [...new Set(sales.map(s => s.buyerId).filter(Boolean))];
        if (tx.buyerId && !txBuyerIds.includes(tx.buyerId)) txBuyerIds.push(tx.buyerId);

        let pays = readPayments(tx);
        if (pays.length === 0) {
            const legacyPaid = parseFloat(tx.paidAmount ?? tx.paid_amount) || 0;
            if (legacyPaid > 0) {
                pays = [{ date: tx.paidAt || tx.paid_at || tx.date, amount: legacyPaid, method: tx.paymentMethod || tx.payment_method || 'Tunai / Cash', note: tx.paymentNote || tx.payment_note || '' }];
            }
        }

        pays.forEach(p => {
            const amount = parseFloat(p.amount) || 0;
            if (amount <= 0) return;
            if (startDate && (p.date || '') < startDate) return;
            if (endDate && (p.date || '') > endDate) return;
            const pBuyerIds = p.buyerId ? [p.buyerId] : txBuyerIds;
            if (!matchBuyer(pBuyerIds)) return;
            const names = pBuyerIds.map(buyerName).filter(Boolean);

            const isBulk = !!p.batchId || p.note === BULK_NOTE;
            const key = p.batchId ? `batch:${p.batchId}`
                : isBulk ? `bulk:${p.buyerId || ''}|${p.date}|${p.method}`
                : `single:${seq++}`;

            let g = groups.get(key);
            if (!g) {
                g = {
                    date: p.date || '',
                    txDates: [],
                    buyer: names.length ? names.join(', ') : '-',
                    method: p.method || '-',
                    note: p.note || '',
                    isBulk,
                    amount: 0
                };
                groups.set(key, g);
            }
            g.amount += amount;
            g.txDates.push(tx.date);
        });
    });

    const rows = [...groups.values()].map(g => {
        const dates = g.txDates.filter(Boolean).sort();
        let txLabel = '-';
        if (g.isBulk && g.txDates.length > 1) {
            txLabel = `${g.txDates.length} transaksi (${formatDate(dates[0])} s.d ${formatDate(dates[dates.length - 1])})`;
        } else if (dates.length) {
            txLabel = formatDate(dates[0]);
        }
        return { date: g.date, txLabel, buyer: g.buyer, method: g.method, note: g.isBulk ? 'Bayar sekaligus' : g.note, amount: g.amount };
    });

    rows.sort((a, b) => (b.date || '').localeCompare(a.date || ''));

    const periodText = (startDate || endDate)
        ? `Periode: ${startDate ? formatDate(startDate) : '-'} s.d ${endDate ? formatDate(endDate) : '-'}`
        : 'Seluruh Periode';
    const buyerText = selected.length === 0 ? 'Semua Pembeli' : selected.map(buyerName).filter(Boolean).join(', ');
    return { rows, periodText, buyerText, total: rows.reduce((s, r) => s + r.amount, 0) };
}

function readSales(tx) {
    if (Array.isArray(tx.sales)) return tx.sales;
    if (typeof tx.sales === 'string' && tx.sales.trim()) {
        try { const p = JSON.parse(tx.sales); return Array.isArray(p) ? p : []; } catch (e) { return []; }
    }
    return [];
}

function buildIncomingTable(rows, total, forPrint = false, opts = {}) {
    const startIndex = opts.startIndex || 0;
    const showTotal = opts.showTotal !== false;
    const th = forPrint ? 'border:1px solid #94a3b8; background:#e2e8f0; padding:6px 8px; text-align:left;' : '';
    const td = forPrint ? 'border:1px solid #cbd5e1; padding:5px 8px;' : '';
    const body = rows.length ? rows.map((r, i) => `
        <tr>
            <td style="${td}">${startIndex + i + 1}</td>
            <td style="${td}">${formatDate(r.date)}</td>
            <td style="${td}">${escHtml(r.buyer)}</td>
            <td style="${td}">${escHtml(r.txLabel)}</td>
            <td style="${td}">${escHtml(r.method)}</td>
            <td style="${td}">${escHtml(r.note) || '-'}</td>
            <td style="${td} font-weight:600; color:#059669; text-align:right; white-space:nowrap;">${formatCurrency(r.amount)}</td>
        </tr>`).join('')
        : `<tr><td colspan="7" style="text-align:center; padding:1.5rem; color:#94a3b8;">Belum ada pembayaran masuk pada filter ini.</td></tr>`;
    return `
        <table class="table" style="font-size:0.82rem; width:100%; border-collapse:collapse;">
            <thead><tr>
                <th style="${th}">No</th><th style="${th}">Tgl Bayar</th><th style="${th}">Pembeli</th>
                <th style="${th}">Tgl Transaksi</th><th style="${th}">Metode</th><th style="${th}">Catatan</th>
                <th style="${th} text-align:right;">Jumlah</th>
            </tr></thead>
            <tbody>${body}</tbody>
            ${showTotal ? `<tfoot><tr style="font-weight:700;">
                <td colspan="6" style="${td} text-align:right;">Total Pembayaran Masuk</td>
                <td style="${td} text-align:right; color:#059669; white-space:nowrap;">${formatCurrency(total)}</td>
            </tr></tfoot>` : ''}
        </table>`;
}

function renderIncomingResults() {
    const box = document.getElementById('incoming-results');
    if (!box) return;
    const { rows, periodText, buyerText, total } = collectIncomingPayments();
    box.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:0.75rem; background:#f0fdf4; border:1px solid #bbf7d0; border-radius:8px; padding:0.85rem 1rem; margin-bottom:1rem;">
            <div style="font-size:0.8rem; color:#475569;">
                <div>${escHtml(periodText)}</div>
                <div>Pembeli: <strong>${escHtml(buyerText)}</strong></div>
                <div>${rows.length} pembayaran</div>
            </div>
            <div style="text-align:right;">
                <div style="font-size:0.72rem; color:#64748b; font-weight:600; text-transform:uppercase;">Total Masuk</div>
                <div style="font-size:1.3rem; font-weight:700; color:#059669;">${formatCurrency(total)}</div>
            </div>
        </div>
        <div class="table-responsive" style="max-height:45vh; overflow:auto;">${buildIncomingTable(rows, total)}</div>`;
    const btn = document.getElementById('btn-cetak-pembayaran-masuk');
    if (btn) btn.disabled = rows.length === 0;

    // Label tombol pembeli
    const label = document.getElementById('incoming-buyer-label');
    if (label) {
        const n = incomingFilter.buyers.size;
        const b = (getData().buyers || []).find(x => x.id === [...incomingFilter.buyers][0]);
        label.textContent = n === 0 ? 'Semua Pembeli' : n === 1 ? (b ? b.name : '1 pembeli') : `${n} pembeli dipilih`;
    }
}

window.setIncomingDate = (which, value) => {
    incomingFilter[which] = value || '';
    renderIncomingResults();
};

window.resetIncomingDates = () => {
    incomingFilter.start = '';
    incomingFilter.end = '';
    const s = document.getElementById('incoming-start');
    const e = document.getElementById('incoming-end');
    if (s) s.value = '';
    if (e) e.value = '';
    renderIncomingResults();
};

window.toggleIncomingBuyerPanel = () => {
    const p = document.getElementById('incoming-buyer-panel');
    if (p) p.style.display = p.style.display === 'none' ? 'block' : 'none';
};

window.toggleIncomingBuyer = (id, checked) => {
    if (checked) incomingFilter.buyers.add(id); else incomingFilter.buyers.delete(id);
    renderIncomingResults();
};

window.clearIncomingBuyers = () => {
    incomingFilter.buyers.clear();
    document.querySelectorAll('#incoming-buyer-options input').forEach(i => { i.checked = false; });
    renderIncomingResults();
};

window.filterIncomingBuyerOptions = (q) => {
    const term = (q || '').toLowerCase().trim();
    document.querySelectorAll('#incoming-buyer-options label').forEach(el => {
        el.style.display = !term || el.dataset.name.includes(term) ? 'flex' : 'none';
    });
};

window.openIncomingPaymentsModal = () => {
    syncIncomingFilterFromPage();
    const buyers = [...(getData().buyers || [])].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    const buyerOptions = buyers.length ? buyers.map(b => `
        <label data-name="${escHtml((b.name || '').toLowerCase())}" style="display:flex; align-items:center; gap:0.5rem; padding:0.3rem 0.4rem; border-radius:6px; cursor:pointer; font-size:0.85rem; color:#1e293b;">
            <input type="checkbox" value="${escHtml(b.id)}" ${incomingFilter.buyers.has(b.id) ? 'checked' : ''} onchange="toggleIncomingBuyer(this.value, this.checked)">
            <span>${escHtml(b.name)}</span>
        </label>`).join('') : '<div style="padding:0.5rem; font-size:0.8rem; color:#94a3b8;">Belum ada data pembeli</div>';

    const html = `
        <div style="padding:0.25rem;">
            <div style="display:flex; align-items:center; flex-wrap:wrap; gap:0.75rem; margin-bottom:0.75rem;">
                <div style="display:flex; align-items:center; gap:0.4rem;">
                    <span class="material-symbols-outlined" style="font-size:18px; color:#64748b;">calendar_month</span>
                    <input type="date" id="incoming-start" class="form-control" value="${incomingFilter.start}" style="padding:0.35rem 0.5rem; width:auto; font-size:0.85rem;" onchange="setIncomingDate('start', this.value)">
                    <span style="color:#64748b; font-weight:bold;">-</span>
                    <input type="date" id="incoming-end" class="form-control" value="${incomingFilter.end}" style="padding:0.35rem 0.5rem; width:auto; font-size:0.85rem;" onchange="setIncomingDate('end', this.value)">
                    <button type="button" class="btn btn-sm" style="padding:0.3rem 0.5rem; font-size:0.75rem; background:#e2e8f0; color:#475569;" onclick="resetIncomingDates()">Semua</button>
                </div>
                <div style="display:flex; align-items:center; gap:0.4rem;">
                    <span class="material-symbols-outlined" style="font-size:18px; color:#64748b;">person_search</span>
                    <button type="button" class="form-control" style="padding:0.35rem 0.65rem; min-width:200px; font-size:0.85rem; text-align:left; display:flex; justify-content:space-between; align-items:center; gap:0.5rem; cursor:pointer; background:white;" onclick="toggleIncomingBuyerPanel()">
                        <span id="incoming-buyer-label">Semua Pembeli</span>
                        <span class="material-symbols-outlined" style="font-size:18px; color:#64748b;">expand_more</span>
                    </button>
                </div>
            </div>
            <div id="incoming-buyer-panel" style="display:none; border:1px solid #cbd5e1; border-radius:8px; padding:0.5rem; margin-bottom:0.75rem; background:white; max-width:360px;">
                <input type="text" class="form-control" placeholder="Cari pembeli..." style="padding:0.35rem 0.6rem; font-size:0.8rem; margin-bottom:0.4rem;" oninput="filterIncomingBuyerOptions(this.value)">
                <button type="button" class="btn btn-sm" style="font-size:0.75rem; background:#f1f5f9; color:#475569; margin-bottom:0.4rem;" onclick="clearIncomingBuyers()">Reset (Semua Pembeli)</button>
                <div id="incoming-buyer-options" style="max-height:180px; overflow-y:auto;">${buyerOptions}</div>
            </div>
            <div id="incoming-results"></div>
            <div class="form-actions" style="margin-top:1.25rem;">
                <button type="button" class="btn" onclick="closeModal()">Tutup</button>
                <button type="button" id="btn-export-pdf-pembayaran-masuk" class="btn" style="background:#ef4444; color:white;" onclick="exportIncomingPaymentsPDF()">
                    <span class="material-symbols-outlined" style="font-size:16px; vertical-align:middle;">picture_as_pdf</span> Export PDF
                </button>
                <button type="button" id="btn-cetak-pembayaran-masuk" class="btn btn-primary" onclick="printIncomingPayments(true)">
                    <span class="material-symbols-outlined" style="font-size:16px; vertical-align:middle;">print</span> Cetak
                </button>
            </div>
        </div>`;
    window.openModal('Pembayaran Masuk', html, '960px');
    renderIncomingResults();
};

// useModalFilter=true: pakai filter di modal; selain itu pakai filter halaman Penagihan
window.printIncomingPayments = (useModalFilter = false) => {
    if (useModalFilter !== true) syncIncomingFilterFromPage();
    const { rows, periodText, buyerText, total } = collectIncomingPayments();
    if (rows.length === 0) { showToast('Tidak ada pembayaran untuk dicetak.', 'error'); return; }

    const doc = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Pembayaran Masuk</title>
        <style>
            @page { size: A4 landscape; margin: 12mm; }
            body { font-family: Arial, sans-serif; font-size: 12px; color: #1e293b; margin: 0; }
            h1 { font-size: 18px; margin: 0 0 4px; }
            .meta { color: #475569; margin-bottom: 12px; line-height: 1.5; }
            table { width: 100%; border-collapse: collapse; }
            tr { page-break-inside: avoid; }
            thead { display: table-header-group; }
        </style></head><body>
        <h1>Laporan Pembayaran Masuk</h1>
        <div class="meta">${escHtml(periodText)}<br>Pembeli: ${escHtml(buyerText)}<br>Dicetak: ${formatDate(new Date().toISOString().slice(0, 10))}</div>
        ${buildIncomingTable(rows, total, true)}
        </body></html>`;

    const frame = document.createElement('iframe');
    frame.style.cssText = 'position:fixed; right:0; bottom:0; width:0; height:0; border:0;';
    document.body.appendChild(frame);
    frame.contentDocument.open();
    frame.contentDocument.write(doc);
    frame.contentDocument.close();
    setTimeout(() => {
        frame.contentWindow.focus();
        frame.contentWindow.print();
        setTimeout(() => frame.remove(), 1500);
    }, 250);
};

// Export PDF (memakai filter yang sedang aktif di modal)
window.exportIncomingPaymentsPDF = async () => {
    const { rows, periodText, buyerText, total } = collectIncomingPayments();
    if (rows.length === 0) { showToast('Tidak ada pembayaran untuk diexport.', 'error'); return; }

    const jsPDFClass = (window.jspdf && window.jspdf.jsPDF) ? window.jspdf.jsPDF : window.jsPDF;
    if (!jsPDFClass || typeof html2canvas === 'undefined') {
        showToast('Pustaka PDF (jsPDF / html2canvas) belum siap.', 'error');
        return;
    }

    const btn = document.getElementById('btn-export-pdf-pembayaran-masuk');
    const origBtn = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px; vertical-align:middle; animation: spin 1s linear infinite;">sync</span> Menyiapkan...'; }

    const mount = document.createElement('div');
    mount.style.cssText = `position:fixed; left:0; top:0; width:1100px; background:#fff; color:#1e293b; padding:24px 28px; box-sizing:border-box; font-family:'Inter', Arial, sans-serif; font-size:12px; z-index:999999; pointer-events:none;`;
    document.body.appendChild(mount);

    const pdf = new jsPDFClass({ unit: 'mm', format: 'a4', orientation: 'landscape' });
    const marginX = 10, marginY = 10;
    const printableWidth = 297 - marginX * 2;
    const maxPrintableHeight = 210 - marginY * 2;

    const ROWS_PER_PAGE = 16;
    const chunks = [];
    for (let i = 0; i < rows.length; i += ROWS_PER_PAGE) chunks.push(rows.slice(i, i + ROWS_PER_PAGE));
    const printedAt = formatDate(new Date().toISOString().slice(0, 10));

    try {
        for (let c = 0; c < chunks.length; c++) {
            const isLast = c === chunks.length - 1;
            mount.innerHTML = `
                <div style="margin-bottom:12px;">
                    <div style="font-size:20px; font-weight:700;">Laporan Pembayaran Masuk</div>
                    <div style="color:#475569; line-height:1.6; margin-top:4px;">${escHtml(periodText)}<br>Pembeli: ${escHtml(buyerText)}<br>Dicetak: ${printedAt} &nbsp;|&nbsp; Halaman ${c + 1} / ${chunks.length}</div>
                </div>
                ${buildIncomingTable(chunks[c], total, true, { startIndex: c * ROWS_PER_PAGE, showTotal: isLast })}`;
            await new Promise(r => setTimeout(r, 80));

            const canvas = await html2canvas(mount, { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff', scrollX: 0, scrollY: 0, x: 0, y: 0, width: 1100 });

            if (c > 0) pdf.addPage('a4', 'landscape');
            let w = printableWidth;
            let h = (canvas.height * w) / canvas.width;
            if (h > maxPrintableHeight) {
                const ratio = maxPrintableHeight / h;
                w *= ratio;
                h = maxPrintableHeight;
            }
            pdf.addImage(canvas.toDataURL('image/jpeg', 0.98), 'JPEG', marginX + (printableWidth - w) / 2, marginY, w, h);
        }
        pdf.save(`Pembayaran_Masuk_${new Date().toISOString().slice(0, 10)}.pdf`);
        showToast('PDF berhasil dibuat.');
    } catch (err) {
        console.error('Gagal export PDF:', err);
        showToast('Gagal export PDF: ' + (err.message || err), 'error');
    } finally {
        if (mount.parentNode) mount.parentNode.removeChild(mount);
        if (btn) { btn.disabled = false; btn.innerHTML = origBtn; }
    }
};
