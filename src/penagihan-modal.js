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

        const saves = [];
        inputs.forEach(inp => {
            const alloc = parseFloat(inp.value) || 0;
            if (alloc > 0) {
                const txId = inp.getAttribute('data-txid');
                const tx = data.transactions.find(t => t.id === txId);
                if (tx) {
                    const payments = readPayments(tx);
                    payments.push({ id: generateId(), buyerId, date: payDate, amount: alloc, method, note: 'Alokasi Bayar Sekaligus', created_at: new Date().toISOString() });
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
