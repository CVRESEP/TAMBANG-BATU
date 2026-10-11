// ============================================================
// src/penjualan-excel.js — Import & Export Excel Penjualan
// ============================================================
import { getData, saveData, generateId, showToast } from './core.js';

window.exportPenjualanExcel = () => {
    if (!window.XLSX) { alert('Pustaka Excel belum siap, coba lagi sebentar.'); return; }
    const data = getData();

    // Sheet 1: Penjualan
    const penjHeaders = ['Tanggal', 'Nama Pembeli', 'Jumlah Sopir', 'Qty', 'Harga Satuan', 'Total Penjualan'];
    const penjRows = [];
    data.transactions.forEach(tx => {
        (tx.sales || []).forEach(s => {
            const buyer = data.buyers.find(b => b.id === s.buyerId);
            const unitPrice = s.qty > 0 ? Math.round(s.total / s.qty) : 0;
            penjRows.push([
                tx.date,
                buyer ? buyer.name : '',
                s.driverCount || 1,
                s.qty,
                unitPrice,
                s.total
            ]);
        });
    });

    // Sheet 2: Pengeluaran
    const expHeaders = ['Tanggal', 'Jenis Pengeluaran', 'Kategori', 'Qty', 'Total'];
    const expRows = [];
    data.transactions.forEach(tx => {
        (tx.expenseDetails || []).forEach(d => {
            let category = d.category;
            let name = d.name;
            if (!category && d.expenseId) {
                const expType = data.expenseTypes.find(e => e.id === d.expenseId);
                if (expType) {
                    category = expType.category;
                    name = expType.name;
                }
            } else if (!category) {
                category = 'Operasional';
            }

            expRows.push([
                tx.date,
                name || 'Manual',
                category || 'Operasional',
                d.qty,
                d.amount
            ]);
        });
    });

    const wb = XLSX.utils.book_new();

    const ws1 = XLSX.utils.aoa_to_sheet([penjHeaders, ...penjRows]);
    ws1['!cols'] = [{ wch: 12 }, { wch: 22 }, { wch: 12 }, { wch: 8 }, { wch: 15 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'Penjualan');

    const ws2 = XLSX.utils.aoa_to_sheet([expHeaders, ...expRows]);
    ws2['!cols'] = [{ wch: 12 }, { wch: 25 }, { wch: 14 }, { wch: 8 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Pengeluaran');

    const today = new Date().toISOString().split('T')[0];
    XLSX.writeFile(wb, `penjualan_${today}.xlsx`);
    showToast('File Excel berhasil diunduh!');
};

window.downloadPenjualanTemplate = () => {
    if (!window.XLSX) { alert('Pustaka Excel belum siap, coba lagi sebentar.'); return; }

    const penjHeaders = ['Tanggal', 'Nama Pembeli', 'Jumlah Sopir', 'Qty', 'Harga Satuan', 'Total Penjualan'];
    const penjExample = [
        ['2026-04-15', 'Nama Pembeli Contoh', 1, 10.5, 50000, 525000],
        ['2026-04-15', 'Nama Pembeli Lain', 1, 5, 60000, 300000]
    ];

    const expHeaders = ['Tanggal', 'Jenis Pengeluaran', 'Kategori', 'Qty', 'Total'];
    const expExample = [
        ['2026-04-15', 'Solar Excavator', 'Operasional', 20, 150000],
        ['2026-04-15', 'Retribusi Desa', 'Retribusi', 1, 50000]
    ];

    const wb = XLSX.utils.book_new();

    const ws1 = XLSX.utils.aoa_to_sheet([penjHeaders, ...penjExample]);
    ws1['!cols'] = [{ wch: 12 }, { wch: 22 }, { wch: 12 }, { wch: 8 }, { wch: 15 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ws1, 'Penjualan');

    const ws2 = XLSX.utils.aoa_to_sheet([expHeaders, ...expExample]);
    ws2['!cols'] = [{ wch: 12 }, { wch: 25 }, { wch: 14 }, { wch: 8 }, { wch: 18 }];
    XLSX.utils.book_append_sheet(wb, ws2, 'Pengeluaran');

    XLSX.writeFile(wb, `template_import_penjualan.xlsx`);
    showToast('Template Import berhasil diunduh!');
};

window.importPenjualanExcel = (input) => {
    if (!window.XLSX) { alert('Pustaka Excel belum siap.'); return; }
    const file = input.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const wb = XLSX.read(e.target.result, { type: 'binary', cellDates: false });
            const data = getData();

            const ws1 = wb.Sheets['Penjualan'];
            if (!ws1) { alert('Sheet "Penjualan" tidak ditemukan di file Excel!'); return; }
            const penjRows = XLSX.utils.sheet_to_json(ws1, { header: 1, defval: '' });

            const ws2 = wb.Sheets['Pengeluaran'];
            const expRows = ws2 ? XLSX.utils.sheet_to_json(ws2, { header: 1, defval: '' }) : [];

            const txByDate = {};
            const penjData = penjRows.slice(1);
            penjData.forEach(row => {
                const [date, buyerName, driverCount, qty, unitPrice, total] = row;
                if (!date || !buyerName) return;

                let dateStr = typeof date === 'number'
                    ? XLSX.SSF.format('yyyy-mm-dd', date)
                    : String(date).trim();

                let buyer = data.buyers.find(b => b.name.toLowerCase() === String(buyerName).toLowerCase().trim());
                if (!buyer) {
                    buyer = { id: generateId(), name: String(buyerName).trim(), category: 'Umum', unit: 'Ritase', unitPrice: 0 };
                    data.buyers.push(buyer);
                }

                if (!txByDate[dateStr]) txByDate[dateStr] = { sales: [], expenseDetails: [] };
                txByDate[dateStr].sales.push({
                    buyerId: buyer.id,
                    qty: parseFloat(qty) || 0,
                    total: parseFloat(total) || 0,
                    driverCount: parseInt(driverCount) || 1
                });
            });

            const expData = expRows.slice(1);
            expData.forEach(row => {
                const [date, expName, category, qty, total] = row;
                if (!date || !expName) return;

                let dateStr = typeof date === 'number'
                    ? XLSX.SSF.format('yyyy-mm-dd', date)
                    : String(date).trim();

                let expType = data.expenseTypes.find(e => e.name.toLowerCase() === String(expName).toLowerCase().trim());
                if (!expType) {
                    const cat = String(category || 'Operasional').trim();
                    expType = { id: generateId(), name: String(expName).trim(), category: cat, unit: '', basePrice: 0 };
                    data.expenseTypes.push(expType);
                }

                if (!txByDate[dateStr]) txByDate[dateStr] = { sales: [], expenseDetails: [] };
                txByDate[dateStr].expenseDetails.push({
                    expenseId: expType.id,
                    qty: parseFloat(qty) || 0,
                    amount: parseFloat(total) || 0
                });
            });

            let added = 0, updated = 0;
            Object.entries(txByDate).forEach(([date, txData]) => {
                const totalAmount = txData.sales.reduce((s, r) => s + r.total, 0);
                const totalOps = txData.expenseDetails
                    .filter(d => {
                        const et = data.expenseTypes.find(e => e.id === d.expenseId);
                        return et && et.category === 'Operasional';
                    })
                    .reduce((s, d) => s + d.amount, 0);
                const totalRet = txData.expenseDetails
                    .filter(d => {
                        const et = data.expenseTypes.find(e => e.id === d.expenseId);
                        return et && et.category === 'Retribusi';
                    })
                    .reduce((s, d) => s + d.amount, 0);

                const existing = data.transactions.find(t => t.date === date);
                const tx = {
                    id: existing ? existing.id : generateId(),
                    date,
                    sales: txData.sales,
                    totalAmount,
                    operationalExpense: totalOps,
                    retributionExpense: totalRet,
                    expenseDetails: txData.expenseDetails,
                    status: existing ? existing.status : 'Belum Lunas',
                    createdAt: existing ? existing.createdAt : new Date().toISOString()
                };

                if (existing) {
                    const idx = data.transactions.findIndex(t => t.date === date);
                    data.transactions[idx] = tx;
                    updated++;
                } else {
                    data.transactions.push(tx);
                    added++;
                }
            });

            data.transactions.sort((a, b) => b.date.localeCompare(a.date));
            saveData(data);
            if (window.render_penjualan) window.render_penjualan();
            showToast(`Import selesai: ${added} baru, ${updated} diperbarui`);
        } catch (err) {
            alert('Gagal membaca file Excel: ' + err.message);
            console.error(err);
        } finally {
            input.value = '';
        }
    };
    reader.readAsBinaryString(file);
};
