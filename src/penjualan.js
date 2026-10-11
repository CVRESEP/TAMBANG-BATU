// ============================================================
// src/penjualan.js — Transaksi Penjualan, Daftar Mingguan & Ringkasan
// ============================================================
import { getData, saveData, deleteFromDatabase, formatCurrency, formatDate } from './core.js';
import { initSalesForm, getPenjualanRows } from './penjualan-form.js';
import { getOpsExpenseRows, getRetExpenseRows } from './penjualan-expense-rows.js';

let currentEditTxId = null;

window.getCurrentEditTxId = () => currentEditTxId;
window.setCurrentEditTxId = (id) => { currentEditTxId = id; };

export function getWeekLabel(dateString) {
    const parts = dateString.split('-');
    const date = new Date(parts[0], parts[1] - 1, parts[2]);
    const day = date.getDay();
    const diff = date.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(date.setDate(diff));
    const sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
    
    const fmt = (d) => {
        const dd = String(d.getDate()).padStart(2, '0');
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const yy = d.getFullYear();
        return `${dd}/${mm}/${yy}`;
    };
    
    return `${fmt(monday)} - ${fmt(sunday)}`;
}

window.getWeekLabel = getWeekLabel;

window.shiftWeek = (direction) => {
    const select = document.getElementById('penjualan-week-filter');
    if (!select || select.options.length === 0) return;
    
    let currentIndex = select.selectedIndex;
    let newIndex = currentIndex;
    
    if (direction === -1) {
        if (currentIndex === 0) newIndex = 1;
        else newIndex = currentIndex + 1;
    } else if (direction === 1) {
        if (currentIndex === 0) return;
        newIndex = currentIndex - 1;
        if (newIndex === 0) newIndex = 1;
    }
    
    if (newIndex >= 1 && newIndex < select.options.length) {
        select.selectedIndex = newIndex;
        window.render_penjualan();
    }
};

window.render_penjualan = () => {
    const data = getData();

    let modified = false;
    const sortedTypes = [...data.expenseTypes].sort((a, b) => (a.order || 0) - (b.order || 0));
    sortedTypes.forEach(e => {
        if (e.basePrice === undefined) {
            e.basePrice = 0;
            modified = true;
        }
    });
    if (modified) saveData(data);

    const listView = document.getElementById('penjualan-list-view');
    const formView = document.getElementById('penjualan-form-view');
    const tbodyList = document.getElementById('tbody-penjualan-list');
    const formContainer = document.getElementById('penjualan-form-container');
    if (!listView || !tbodyList) return;

    const weekSelect = document.getElementById('penjualan-week-filter');
    const allTransactions = [...data.transactions].sort((a, b) => new Date(b.date) - new Date(a.date));
    
    if (weekSelect && weekSelect.options.length === 0) {
        const weeks = new Set();
        allTransactions.forEach(tx => {
            if (tx.date) weeks.add(getWeekLabel(tx.date));
        });
        
        const weeksArray = Array.from(weeks);
        const todayStr = new Date().toISOString().split('T')[0];
        const currentWeekLabel = getWeekLabel(todayStr);
        if (!weeksArray.includes(currentWeekLabel)) {
            weeksArray.unshift(currentWeekLabel);
        }
        
        weekSelect.innerHTML = '<option value="all">Semua Tanggal</option>';
        weeksArray.forEach(w => {
            weekSelect.innerHTML += `<option value="${w}">${w}</option>`;
        });
        
        weekSelect.value = currentWeekLabel;
    }

    const selectedWeek = weekSelect ? weekSelect.value : 'all';
    let filteredTransactions = allTransactions;
    if (selectedWeek !== 'all') {
        filteredTransactions = allTransactions.filter(tx => tx.date && getWeekLabel(tx.date) === selectedWeek);
    }

    const btnPrev = document.getElementById('btn-prev-week');
    const btnNext = document.getElementById('btn-next-week');
    if (weekSelect && btnPrev && btnNext) {
        const idx = weekSelect.selectedIndex;
        btnNext.disabled = (idx <= 1);
        btnPrev.disabled = (idx >= weekSelect.options.length - 1);
        btnNext.style.opacity = btnNext.disabled ? '0.5' : '1';
        btnPrev.style.opacity = btnPrev.disabled ? '0.5' : '1';
    }

    listView.style.display = 'block';
    if (formView) formView.style.display = 'none';

    tbodyList.innerHTML = '';
    if (filteredTransactions.length === 0) {
        tbodyList.innerHTML = '<tr><td colspan="8" class="text-center text-muted">Belum ada transaksi di minggu ini</td></tr>';
    } else {
        filteredTransactions.forEach(tx => {
            let rincianInfo = '';
            if (tx.sales) {
                rincianInfo = tx.sales.length + ' Baris Barang';
            } else {
                rincianInfo = data.buyers.find(b => b.id === tx.buyerId)?.name || '-';
            }

            const netProfit = tx.totalAmount - (tx.operationalExpense || 0) - (tx.retributionExpense || 0);
            const tr = document.createElement('tr');
            const firstBuyerId = (tx.sales && tx.sales.length > 0) ? tx.sales[0].buyerId : null;

            tr.innerHTML = `
                <td><input type="checkbox" class="check-penjualan" data-id="${tx.id}"></td>
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

    const btnAdd = document.getElementById('btn-show-add-penjualan');
    if (btnAdd) {
        btnAdd.onclick = () => {
            currentEditTxId = null;
            listView.style.display = 'none';
            if (formView) formView.style.display = 'block';
            const h2 = document.querySelector('#penjualan-form-view h2');
            if (h2) h2.textContent = 'Tambah Data Penjualan';
            initSalesForm(formContainer, data);
        };
    }

    const btnBack = document.getElementById('btn-back-penjualan');
    if (btnBack) {
        btnBack.onclick = () => {
            listView.style.display = 'block';
            if (formView) formView.style.display = 'none';
            currentEditTxId = null;
        };
    }
};

window.editTransaksi = (id) => {
    const data = getData();
    const tx = data.transactions.find(t => t.id === id);
    if (!tx) return;

    currentEditTxId = id;
    const listView = document.getElementById('penjualan-list-view');
    const formView = document.getElementById('penjualan-form-view');
    const formContainer = document.getElementById('penjualan-form-container');

    if (listView) listView.style.display = 'none';
    if (formView) formView.style.display = 'block';

    const h2 = document.querySelector('#penjualan-form-view h2');
    if (h2) h2.textContent = 'Edit Data Penjualan';

    initSalesForm(formContainer, data, tx);
};

window.deleteTransaksi = (id) => {
    if (confirm('Hapus keseluruhan rekapan transaksi penjualan ini?')) {
        const data = getData();
        data.transactions = data.transactions.filter(t => t.id !== id);
        saveData(data);
        deleteFromDatabase('transactions', id);
        window.render_penjualan();
    }
};

window.updateNetProfitSummary = () => {
    const pRows = getPenjualanRows() || [];
    const oRows = getOpsExpenseRows() || [];
    const rRows = getRetExpenseRows() || [];
    const totalOmzet = pRows.reduce((acc, row) => acc + (row.total || 0), 0);
    const totalOps = oRows.reduce((acc, row) => acc + (row.total || 0), 0);
    const totalRet = rRows.reduce((acc, row) => acc + (row.total || 0), 0);
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

export { currentEditTxId };
