// ============================================================
// src/bulk-delete.js — Bulk delete actions
// ============================================================
import { getData, saveData, deleteFromDatabase } from './core.js';

export function initBulkDeleteListeners() {
    const bulkConfigs = [
        { type: 'penjualan', cacheKey: 'transactions', supabaseTable: 'transactions', renderFn: 'render_penjualan' },
        { type: 'pembeli', cacheKey: 'buyers', supabaseTable: 'buyers', renderFn: 'render_pembeli' },
        { type: 'sopir', cacheKey: 'drivers', supabaseTable: 'drivers', renderFn: 'render_sopir' },
        { type: 'pengeluaran', cacheKey: 'expenseTypes', supabaseTable: 'expense_types', renderFn: 'render_pengeluaran' },
        { type: 'setoran', cacheKey: 'settlements', supabaseTable: 'settlements', renderFn: 'render_potongan' },
        { type: 'potongan', cacheKey: 'deductions', supabaseTable: 'deductions', renderFn: 'render_potongan' }
    ];

    bulkConfigs.forEach(config => {
        const checkAll = document.getElementById(`check-all-${config.type}`);
        const btnBulk = document.getElementById(`btn-bulk-delete-${config.type}`);

        if (checkAll) {
            checkAll.addEventListener('change', (e) => {
                document.querySelectorAll(`.check-${config.type}`).forEach(cb => cb.checked = e.target.checked);
                updateBulkDeleteButton(config.type);
            });
        }
        if (btnBulk) {
            btnBulk.addEventListener('click', () => {
                const selectedIds = Array.from(document.querySelectorAll(`.check-${config.type}:checked`)).map(cb => cb.dataset.id);
                if (selectedIds.length === 0) return;
                if (confirm(`Apakah Anda yakin ingin menghapus ${selectedIds.length} data terpilih?`)) {
                    executeBulkDelete(config, selectedIds);
                }
            });
        }
    });

    document.addEventListener('change', (e) => {
        const classes = ['check-penjualan','check-pembeli','check-sopir','check-pengeluaran','check-setoran','check-potongan'];
        const matched = classes.find(c => e.target.classList.contains(c));
        if (matched) updateBulkDeleteButton(matched.replace('check-', ''));
    });
}

export function updateBulkDeleteButton(type) {
    const btn = document.getElementById(`btn-bulk-delete-${type}`);
    const checkAll = document.getElementById(`check-all-${type}`);
    if (!btn) return;
    const checkedCount = document.querySelectorAll(`.check-${type}:checked`).length;
    const totalCount = document.querySelectorAll(`.check-${type}`).length;
    btn.style.display = checkedCount > 0 ? 'flex' : 'none';
    if (checkedCount > 0) btn.style.alignItems = 'center';
    if (checkAll) {
        checkAll.checked = checkedCount > 0 && checkedCount === totalCount;
        checkAll.indeterminate = checkedCount > 0 && checkedCount < totalCount;
    }
}

async function executeBulkDelete(config, ids) {
    const data = getData();
    data[config.cacheKey] = data[config.cacheKey].filter(item => !ids.includes(item.id));
    saveData(data);
    try {
        for (const id of ids) await deleteFromDatabase(config.supabaseTable, id);
    } catch (e) {
        alert('Beberapa data mungkin gagal dihapus dari cloud, silakan refresh.');
    }
    const checkAll = document.getElementById(`check-all-${config.type}`);
    if (checkAll) checkAll.checked = false;
    if (window[config.renderFn]) window[config.renderFn]();
    updateBulkDeleteButton(config.type);
}
