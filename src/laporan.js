// ============================================================
// src/laporan.js — Laporan Mingguan Tambang Batu
// ============================================================
import { getData, saveData, generateId, formatCurrency, formatDate, showToast } from './core.js';

window.render_laporan = () => {
    const data = getData();
    const container = document.querySelector('#laporan .card-body');
    if (!container) return;

    const today = new Date();
    const dayOfWeek = today.getDay();
    const monday = new Date(today);
    monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    const lastWeek = monday;

    container.innerHTML = `
        <div class="d-flex" style="gap:1rem; margin-bottom:1.5rem; background:var(--bg-color); padding:1.25rem; border-radius:var(--radius-lg); flex-wrap:wrap">
            <div class="form-group" style="margin:0; flex:1; min-width:200px">
                <label style="margin-bottom:0.25rem;">Dari Tanggal</label>
                <input type="date" id="filter-start" class="form-control" value="${lastWeek.toISOString().split('T')[0]}">
            </div>
            <div class="form-group" style="margin:0; flex:1; min-width:200px">
                <label style="margin-bottom:0.25rem;">Sampai Tanggal</label>
                <input type="date" id="filter-end" class="form-control" value="${sunday.toISOString().split('T')[0]}">
            </div>
            <div class="d-flex align-center" style="margin-top:1.25rem; gap: 0.75rem;">
                <button class="btn btn-primary" id="btn-filter-laporan" style="padding:0.625rem 1.5rem">
                    <span class="material-symbols-outlined" style="font-size:18px; vertical-align:middle">bar_chart</span>
                    Tampilkan Laporan
                </button>
                <button class="btn" onclick="openQuickPotonganModal()" style="padding:0.625rem 1.5rem; background:#f43f5e; color:white; border:none; border-radius:var(--radius-md); display:flex; align-items:center; gap:0.4rem; cursor:pointer; font-weight:500;">
                    <span class="material-symbols-outlined" style="font-size:18px">content_cut</span>
                    Tambah Potongan
                </button>
            </div>
        </div>
        <div id="laporan-result"></div>
    `;

    const reportSetoranType = document.getElementById('report-setoran-type');
    if (reportSetoranType) {
        reportSetoranType.innerHTML = '<option value="">-- Pilih Jenis --</option>' +
            data.expenseTypes.map(e => `<option value="${e.id}">${e.name}</option>`).join('');
    }

    window.generateLaporan = () => {
        const start = document.getElementById('filter-start').value;
        const end = document.getElementById('filter-end').value;
        const res = document.getElementById('laporan-result');

        if (!start || !end || !res) return;

        const filtered = data.transactions.filter(t => t.date >= start && t.date <= end);

        // 1. Income Groups
        const incomeGroups = [];
        filtered.forEach(tx => {
            (tx.sales || []).forEach(s => {
                const price = s.qty > 0 ? s.total / s.qty : 0;
                let group = incomeGroups.find(g => g.buyerId === s.buyerId && Math.abs(g.price - price) < 1);
                if (!group) {
                    const b = data.buyers.find(x => x.id === s.buyerId);
                    group = { buyerId: s.buyerId, name: b ? b.name : 'Umum', price, qty: 0, total: 0 };
                    incomeGroups.push(group);
                }
                group.qty += s.qty;
                group.total += s.total;
            });
        });

        // 2. Ops Groups
        const opsGroups = [];
        filtered.forEach(tx => {
            (tx.expenseDetails || []).forEach(d => {
                let category = d.category;
                let name = d.name;
                if (!category && d.expenseId) {
                    const expType = data.expenseTypes.find(e => e.id === d.expenseId);
                    if (expType) { category = expType.category; name = expType.name; }
                } else if (!category) {
                    category = 'Operasional';
                }

                if (category !== 'Operasional') return;

                const price = d.qty > 0 ? d.amount / d.qty : 0;
                let group = opsGroups.find(g => g.name === name && Math.abs(g.price - price) < 1);
                if (!group) {
                    group = { name: name || 'Manual', price, qty: 0, total: 0 };
                    opsGroups.push(group);
                }
                group.qty += d.qty;
                group.total += d.amount;
            });
        });

        // 3. Retribusi Groups
        const retGroups = [];
        filtered.forEach(tx => {
            (tx.expenseDetails || []).forEach(d => {
                let category = d.category;
                let name = d.name;
                if (!category && d.expenseId) {
                    const expType = data.expenseTypes.find(e => e.id === d.expenseId);
                    if (expType) { category = expType.category; name = expType.name; }
                }

                if (category !== 'Retribusi') return;

                const price = d.qty > 0 ? d.amount / d.qty : 0;
                let group = retGroups.find(g => g.name === name && Math.abs(g.price - price) < 1);
                if (!group) {
                    group = { name: name || 'Manual', price, qty: 0, total: 0 };
                    retGroups.push(group);
                }
                group.qty += d.qty;
                group.total += d.amount;
            });
        });

        // 4. Potongan
        const filteredDeductions = (data.deductions || []).filter(p => {
            const pStart = p.dateStart || p.date;
            const pEnd = p.dateEnd || p.date;
            return pStart <= end && pEnd >= start;
        });

        const totalIncome = incomeGroups.reduce((sum, g) => sum + g.total, 0);

        // Setoran details
        const setoranAgg = { hargaBatu: 0, lainnya: [] };
        filtered.forEach(tx => {
            if (tx.sales) {
                tx.sales.forEach(s => setoranAgg.hargaBatu += (s.hargaBatu || (s.unitPrice * (s.qty || 0)) || 0));
            }
        });

        const registeredTypeIds = [...new Set((data.settlements || []).map(s => s.expenseTypeId))];
        registeredTypeIds.forEach(typeId => {
            const expType = data.expenseTypes.find(e => e.id === typeId);
            if (!expType) return;
            let total = 0;
            filtered.forEach(tx => {
                (tx.expenseDetails || []).forEach(d => {
                    if (d.expenseId === typeId) total += (d.amount || 0);
                });
            });
            setoranAgg.lainnya.push({ name: expType.name, total });
        });

        const totalOps = opsGroups.reduce((sum, g) => sum + g.total, 0);
        const totalRet = retGroups.reduce((sum, g) => sum + g.total, 0);
        const totalDeductions = filteredDeductions.reduce((sum, p) => sum + p.amount, 0);

        const netProfitValue = totalIncome - totalOps - totalRet;
        const totalSetoranA = netProfitValue + setoranAgg.lainnya.reduce((acc, l) => acc + l.total, 0);

        const dStart = new Date(start);
        const dEnd = new Date(end);
        const monthNames = ["JANUARI", "FEBRUARI", "MARET", "APRIL", "MEI", "JUNI", "JULI", "AGUSTUS", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DESEMBER"];
        const monthName = monthNames[dStart.getMonth()];

        res.innerHTML = `
            <style>
                .report-body { font-family: Arial, sans-serif; color: #000; padding: 20px; background: #fff; max-width: 850px; margin: 0 auto; line-height: 1.2; }
                .report-title { text-align: center; font-weight: bold; font-size: 18px; margin-bottom: 20px; text-transform: uppercase; }
                .period-table { width: 100%; border: 2px solid #000; border-collapse: collapse; margin-bottom: 20px; }
                .period-table td { border: 1px solid #000; padding: 5px 10px; font-weight: bold; text-align: center; }
                .bg-blue { background-color: #4472c4; color: #fff; }
                .data-table { width: 100%; border-collapse: collapse; margin-bottom: 10px; page-break-inside: avoid; break-inside: avoid; }
                .data-table th { border-top: 2px solid #000; border-bottom: 2px solid #000; padding: 5px 8px; text-align: left; font-size: 13px; font-weight: bold; }
                .data-table td { padding: 4px 8px; font-size: 13px; }
                .data-table tr { page-break-inside: avoid; break-inside: avoid; }
                .summary-row td { border-top: 2px solid #000; border-bottom: 2px solid #000; font-weight: bold; padding: 8px; }
                .net-profit-box { border: 2px solid #000; font-weight: bold; font-size: 15px; display: flex; justify-content: space-between; padding: 10px; margin-top: 5px; page-break-inside: avoid; break-inside: avoid; }
                .text-right { text-align: right !important; }
                .text-center { text-align: center !important; }
                .potongan-page { break-before: page; margin-top: 40px; border-top: 1px dashed #ccc; padding-top: 40px; }
                .btn-export { margin-bottom: 20px; }
                @media print {
                    .no-print { display: none !important; }
                    .report-body { padding: 0; width: 100%; max-width: none; border: none; }
                    .data-table, .data-table tr, .net-profit-box { page-break-inside: avoid; break-inside: avoid; }
                    .potongan-page { border-top: none; break-before: page; page-break-before: always; margin-top: 0; padding-top: 15px; }
                    @page { margin: 8mm 10mm; size: 210mm 330mm; }
                }
            </style>

            <div class="btn-export no-print" style="display: flex; gap: 0.75rem; align-items: center; flex-wrap: wrap;">
                <button id="btn-export-laporan-pdf" class="btn btn-primary" onclick="exportLaporanPDF()" style="background:#0ea5e9; display: flex; align-items: center; gap: 0.4rem;">
                    <span class="material-symbols-outlined">download</span> Ekspor ke PDF
                </button>
                <button class="btn btn-secondary" onclick="printLaporanManual()" style="background:#64748b; color: white; display: flex; align-items: center; gap: 0.4rem;">
                    <span class="material-symbols-outlined">print</span> Cetak (Print)
                </button>
            </div>

            <div class="report-body" id="printable-report">
                <!-- PAGE 1: MAIN REPORT (S/D NET PROFIT) -->
                <div id="report-page-1" class="report-page-block">
                    <div class="report-title">LAPORAN MINGGUAN TAMBANG BATU</div>
                    <table class="period-table">
                        <tr class="bg-blue"><td width="30%">BULAN</td><td width="70%">${monthName}</td></tr>
                        <tr><td>TANGGAL</td><td>${dStart.getDate()} &nbsp;&nbsp;&nbsp; - &nbsp;&nbsp;&nbsp; ${dEnd.getDate()}</td></tr>
                    </table>

                    <table class="data-table">
                        <thead><tr><th width="45%">PENDAPATAN</th><th width="10%" class="text-center">QTY</th><th width="20%" class="text-right">HARGA</th><th width="25%" class="text-right">TOTAL</th></tr></thead>
                        <tbody>
                            ${incomeGroups.length === 0 ? '<tr><td colspan="4" class="text-center">Tidak ada pendapatan</td></tr>' : ''}
                            ${incomeGroups.map(g => `
                            <tr>
                                <td>JUAL ${g.name.toUpperCase()}</td>
                                <td class="text-center">${g.qty > 0 ? (g.qty % 1 === 0 ? g.qty : g.qty.toFixed(2).replace('.', ',')) : ''}</td>
                                <td class="text-right">${g.price > 0 ? g.price.toLocaleString('id-ID') : ''}</td>
                                <td class="text-right">${g.total.toLocaleString('id-ID')}</td>
                            </tr>`).join('')}
                            <tr class="summary-row"><td colspan="3">TOTAL PENDAPATAN</td><td class="text-right">${totalIncome.toLocaleString('id-ID')}</td></tr>
                        </tbody>
                    </table>

                    <table class="data-table">
                        <thead><tr><th>PENGELUARAN OPERASIONAL</th><th class="text-center">QTY</th><th class="text-right">HARGA</th><th class="text-right">TOTAL</th></tr></thead>
                        <tbody>
                            ${opsGroups.length === 0 ? '<tr><td colspan="4" class="text-center">Tidak ada pengeluaran ops</td></tr>' : ''}
                            ${opsGroups.map(g => `
                            <tr>
                                <td>${g.name}</td>
                                <td class="text-center">${g.qty > 0 ? (g.qty % 1 === 0 ? g.qty : g.qty.toFixed(2).replace('.', ',')) : ''}</td>
                                <td class="text-right">${g.price > 0 ? g.price.toLocaleString('id-ID') : ''}</td>
                                <td class="text-right">${g.total.toLocaleString('id-ID')}</td>
                            </tr>`).join('')}
                            <tr class="summary-row"><td colspan="3">TOTAL PENGELUARAN OPR</td><td class="text-right">${totalOps.toLocaleString('id-ID')}</td></tr>
                        </tbody>

                        <thead><tr><th>PENGELUARAN RETRIBUSI</th><th class="text-center">QTY</th><th class="text-right">HARGA</th><th class="text-right">TOTAL</th></tr></thead>
                        <tbody>
                            ${retGroups.length === 0 ? '<tr><td colspan="4" class="text-center">Tidak ada pengeluaran retri</td></tr>' : ''}
                            ${retGroups.map(g => `
                            <tr>
                                <td>${g.name}</td>
                                <td class="text-center">${g.qty > 0 ? (g.qty % 1 === 0 ? g.qty : g.qty.toFixed(2).replace('.', ',')) : ''}</td>
                                <td class="text-right">${g.price > 0 ? g.price.toLocaleString('id-ID') : ''}</td>
                                <td class="text-right">${g.total.toLocaleString('id-ID')}</td>
                            </tr>`).join('')}
                            <tr class="summary-row"><td colspan="3">TOTAL PENGELUARAN RETRI</td><td class="text-right">${totalRet.toLocaleString('id-ID')}</td></tr>
                        </tbody>
                    </table>

                    <div class="net-profit-box">
                        <div style="width: 75%; text-align: center;">NET PROFIT</div>
                        <div style="width: 25%; text-align: right;">${netProfitValue.toLocaleString('id-ID')}</div>
                    </div>
                </div>

                <!-- PAGE 2: SETORAN & POTONGAN -->
                <div id="report-page-2" class="report-page-block potongan-page">
                    <div class="report-title">RINCIAN SETORAN & POTONGAN</div>
                    <table class="period-table">
                        <tr class="bg-blue"><td width="30%">PERIODE</td><td width="70%">${formatDate(start)} - ${formatDate(end)}</td></tr>
                    </table>

                    <table class="data-table" style="margin-top: 20px;">
                        <thead><tr><th colspan="2">RINCIAN SETORAN</th><th class="text-right">TOTAL</th></tr></thead>
                        <tbody>
                            <tr><td colspan="2">NET PROFIT</td><td class="text-right">${netProfitValue.toLocaleString('id-ID')}</td></tr>
                            ${setoranAgg.lainnya.map(l => `<tr><td colspan="2">${l.name.toUpperCase()}</td><td class="text-right">${l.total.toLocaleString('id-ID')}</td></tr>`).join('')}
                            <tr class="summary-row"><td colspan="2">TOTAL SETORAN (A)</td><td class="text-right">${totalSetoranA.toLocaleString('id-ID')}</td></tr>
                        </tbody>
                    </table>
                    
                    <table class="data-table" style="margin-top: 20px;">
                        <thead><tr><th width="25%">TANGGAL</th><th width="55%">KETERANGAN POTONGAN</th><th width="20%" class="text-right">JUMLAH</th></tr></thead>
                        <tbody>
                            ${filteredDeductions.length === 0 ? '<tr><td colspan="3" class="text-center">Tidak ada potongan</td></tr>' :
                            filteredDeductions.map(p => {
                                const buyer = data.buyers.find(b => b.id === p.buyerId);
                                const buyerInfo = buyer ? ` (${buyer.name})` : '';
                                return `<tr><td>${p.dateStart && p.dateEnd ? `${formatDate(p.dateStart)} - ${formatDate(p.dateEnd)}` : formatDate(p.date)}</td><td>${p.jenis || 'Lainnya'}${buyerInfo} - ${p.description}</td><td class="text-right">${p.amount.toLocaleString('id-ID')}</td></tr>`;
                            }).join('')}
                            <tr class="summary-row"><td colspan="2" class="text-right">TOTAL POTONGAN (B)</td><td class="text-right">${totalDeductions.toLocaleString('id-ID')}</td></tr>
                        </tbody>
                    </table>
                    
                    <div class="net-profit-box" style="margin-top: 30px; background: #f8fafc; border: 2px solid #000;">
                        <div style="width: 75%; text-align: center;">SISA PENDAPATAN AKHIR (NET PROFIT + A - B)</div>
                        <div style="width: 25%; text-align: right; color: #166534;">${(totalSetoranA - totalDeductions).toLocaleString('id-ID')}</div>
                    </div>
                </div>
            </div>
        `;
    };

    document.getElementById('btn-filter-laporan').addEventListener('click', window.generateLaporan);
};

window.addQuickSetoran = () => {
    const expenseTypeId = document.getElementById('report-setoran-type')?.value;
    if (!expenseTypeId) return;
    const data = getData();
    if (!data.settlements) data.settlements = [];
    if (data.settlements.some(s => s.expenseTypeId === expenseTypeId)) {
        showToast('Jenis setoran ini sudah terdaftar');
        return;
    }
    data.settlements.push({ id: generateId(), expenseTypeId });
    saveData(data);
    showToast('Jenis setoran berhasil didaftarkan');
    if (window.generateLaporan) window.generateLaporan();
};

export function printLaporanManual() {
    const printable = document.getElementById('printable-report');
    if (!printable) { alert('Silakan tampilkan laporan terlebih dahulu.'); return; }
    const styleEl = document.querySelector('#laporan-result style');
    const reportStyles = styleEl ? styleEl.outerHTML : '';
    const printContent = `
        <!DOCTYPE html>
        <html lang="id">
        <head>
            <meta charset="UTF-8">
            <title>Laporan Mingguan</title>
            ${reportStyles}
            <style>
                * { box-sizing: border-box; }
                body { margin: 0; padding: 0; font-family: Arial, sans-serif; background: #fff; }
                .no-print, .btn-export { display: none !important; }
                .potongan-page { break-before: page; page-break-before: always; border-top: none !important; margin-top: 0 !important; padding-top: 15px; }
                @page { margin: 8mm 10mm; size: 210mm 330mm portrait; }
            </style>
        </head>
        <body>${printable.innerHTML}</body>
        </html>
    `;
    const win = window.open('', '_blank', 'width=900,height=1200');
    if (win) {
        win.document.write(printContent);
        win.document.close();
        win.onload = () => { win.focus(); win.print(); };
    }
}
window.printLaporanManual = printLaporanManual;
