// ============================================================
// src/laporan-pdf.js — PDF Exports (Laporan Mingguan, Solar, Tagihan)
// ============================================================
import { getData, formatDate, formatCurrency } from './core.js';
import { getCalculatedSolarRecords } from './solar-calc.js';
import { getTransactionPaymentInfo } from './penagihan.js';
import { printLaporanManual } from './laporan.js';

// ============================================================
// Direct PDF Export Function using html2canvas & jsPDF
// Ukuran Kertas: 210mm x 330mm (F4/Folio) - Tepat 2 Lembar
// Lembar 1: Laporan Mingguan Tambang Batu s/d NET PROFIT
// Lembar 2: Rincian Setoran & Potongan
// ============================================================
export async function exportLaporanPDF() {
    let page1El = document.getElementById('report-page-1');
    let page2El = document.getElementById('report-page-2');

    if (!page1El || !page2El) {
        const printable = document.getElementById('printable-report');
        if (!printable) {
            alert('Silakan tampilkan laporan terlebih dahulu.');
            return;
        }
        page2El = printable.querySelector('.potongan-page');
        page1El = printable;
    }

    const btn = document.getElementById('btn-export-laporan-pdf') || document.querySelector('.btn-export button');
    let originalBtnHtml = '';
    if (btn) {
        originalBtnHtml = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = `<span class="material-symbols-outlined" style="animation: spin 1s linear infinite; font-size:18px; vertical-align:middle;">sync</span> Menyiapkan PDF (2 Lembar)...`;
    }

    try {
        const startVal = document.getElementById('filter-start')?.value || '';
        const endVal = document.getElementById('filter-end')?.value || '';
        const filename = (startVal && endVal)
            ? `Laporan_Mingguan_${startVal}_sd_${endVal}.pdf`
            : `Laporan_Mingguan_${new Date().toISOString().slice(0, 10)}.pdf`;

        const jsPDFClass = (window.jspdf && window.jspdf.jsPDF) ? window.jspdf.jsPDF : window.jsPDF;
        if (!jsPDFClass || typeof html2canvas === 'undefined') {
            throw new Error('Pustaka PDF belum selesai dimuat. Harap muat ulang halaman.');
        }

        const prevPage2Border = page2El.style.borderTop;
        const prevPage2Margin = page2El.style.marginTop;
        const prevPage2Padding = page2El.style.paddingTop;

        page2El.style.borderTop = 'none';
        page2El.style.marginTop = '0';
        page2El.style.paddingTop = '10px';

        const canvas1 = await html2canvas(page1El, {
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff'
        });

        const canvas2 = await html2canvas(page2El, {
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff'
        });

        page2El.style.borderTop = prevPage2Border;
        page2El.style.marginTop = prevPage2Margin;
        page2El.style.paddingTop = prevPage2Padding;

        const pdf = new jsPDFClass({
            unit: 'mm',
            format: [210, 330],
            orientation: 'portrait'
        });

        const pageWidth = 210;
        const pageHeight = 330;
        const marginX = 10;
        const marginY = 10;
        const printableWidth = pageWidth - (marginX * 2);
        const maxPrintableHeight = pageHeight - (marginY * 2);

        // ---- LEMBAR 1 ----
        let renderWidth1 = printableWidth;
        let renderHeight1 = (canvas1.height * renderWidth1) / canvas1.width;
        if (renderHeight1 > maxPrintableHeight) {
            const ratio = maxPrintableHeight / renderHeight1;
            renderWidth1 = renderWidth1 * ratio;
            renderHeight1 = maxPrintableHeight;
        }
        const posX1 = marginX + (printableWidth - renderWidth1) / 2;
        pdf.addImage(canvas1.toDataURL('image/jpeg', 0.98), 'JPEG', posX1, marginY, renderWidth1, renderHeight1);

        // ---- LEMBAR 2 ----
        pdf.addPage([210, 330], 'portrait');
        let renderWidth2 = printableWidth;
        let renderHeight2 = (canvas2.height * renderWidth2) / canvas2.width;
        if (renderHeight2 > maxPrintableHeight) {
            const ratio = maxPrintableHeight / renderHeight2;
            renderWidth2 = renderWidth2 * ratio;
            renderHeight2 = maxPrintableHeight;
        }
        const posX2 = marginX + (printableWidth - renderWidth2) / 2;
        pdf.addImage(canvas2.toDataURL('image/jpeg', 0.98), 'JPEG', posX2, marginY, renderWidth2, renderHeight2);

        pdf.save(filename);
    } catch (err) {
        console.error('Gagal mengekspor PDF langsung:', err);
        alert('Gagal mengekspor PDF langsung: ' + (err.message || err) + '. Beralih ke cetak printer.');
        printLaporanManual();
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = originalBtnHtml;
        }
    }
}
window.exportLaporanPDF = exportLaporanPDF;
window.printLaporanPDF = exportLaporanPDF;

export async function exportRekapSolarPDF() {
    const data = getData();
    const startEl = document.getElementById('filter-solar-start');
    const endEl = document.getElementById('filter-solar-end');
    const filterSelect = document.getElementById('filter-solar-supplier');

    const startDate = startEl ? startEl.value : '';
    const endDate = endEl ? endEl.value : '';
    const activeSupplierFilter = filterSelect ? filterSelect.value : '';

    const solarRecords = getCalculatedSolarRecords(data);
    let filteredRecords = solarRecords.filter(s => {
        if (startDate && s.date < startDate) return false;
        if (endDate && s.date > endDate) return false;
        if (activeSupplierFilter && (s.supplier || 'LAINNYA').toUpperCase().trim() !== activeSupplierFilter) return false;
        return true;
    });

    filteredRecords.sort((a, b) => new Date(a.date) - new Date(b.date));

    let totalMasuk = 0;
    let totalKeluar = 0;
    const supplierStats = {};

    filteredRecords.forEach(s => {
        const sup = (s.supplier || 'LAINNYA').toUpperCase().trim();
        if (!supplierStats[sup]) supplierStats[sup] = { masuk: 0, keluar: 0, sisa: 0 };
        if (s.type === 'Masuk') {
            totalMasuk += s.amount;
            supplierStats[sup].masuk += s.amount;
        } else if (s.type === 'Keluar') {
            totalKeluar += s.amount;
            supplierStats[sup].keluar += s.amount;
        }
    });

    Object.keys(supplierStats).forEach(sup => {
        supplierStats[sup].sisa = supplierStats[sup].masuk - supplierStats[sup].keluar;
    });
    const totalSaldo = totalMasuk - totalKeluar;

    const periodText = (startDate || endDate)
        ? `Periode: ${startDate ? formatDate(startDate) : '-'} s.d ${endDate ? formatDate(endDate) : '-'}`
        : 'Seluruh Periode';
    const supplierText = activeSupplierFilter ? `Pemasok: ${activeSupplierFilter}` : 'Semua Pemasok';
    const filename = `Rekap_Solar_${startDate || 'all'}_sd_${endDate || 'now'}.pdf`;

    let runningBalance = 0;
    let rowsHtml = '';
    if (filteredRecords.length === 0) {
        rowsHtml = `<tr><td colspan="6" style="text-align: center; padding: 20px; color:#64748b; border: 1px solid #cbd5e1;">Tidak ada transaksi data solar pada rentang filter ini.</td></tr>`;
    } else {
        filteredRecords.forEach((s, idx) => {
            const masuk = s.type === 'Masuk' ? s.amount : 0;
            const keluar = s.type === 'Keluar' ? s.amount : 0;
            runningBalance += (masuk - keluar);
            rowsHtml += `
                <tr>
                    <td style="border: 1px solid #cbd5e1; padding: 4.5px 8px; text-align: center; width: 35px;">${idx + 1}</td>
                    <td style="border: 1px solid #cbd5e1; padding: 4.5px 8px; white-space: nowrap; font-weight: 500;">${formatDate(s.date)}</td>
                    <td style="border: 1px solid #cbd5e1; padding: 4.5px 8px; font-weight: 600;">${(s.supplier || '-').toUpperCase()}</td>
                    <td style="border: 1px solid #cbd5e1; padding: 4.5px 8px; text-align: right; color: #166534; font-weight: ${masuk > 0 ? '600' : 'normal'}; white-space: nowrap;">${masuk > 0 ? masuk.toLocaleString('id-ID') : '-'}</td>
                    <td style="border: 1px solid #cbd5e1; padding: 4.5px 8px; text-align: right; color: #991b1b; font-weight: ${keluar > 0 ? '600' : 'normal'}; white-space: nowrap;">${keluar > 0 ? keluar.toLocaleString('id-ID') : '-'}</td>
                    <td style="border: 1px solid #cbd5e1; padding: 4.5px 8px; text-align: right; font-weight: bold; color: ${runningBalance >= 0 ? '#0f172a' : '#b91c1c'}; white-space: nowrap;">${runningBalance.toLocaleString('id-ID')}</td>
                </tr>
            `;
        });
    }

    const exportContainer = document.createElement('div');
    exportContainer.style.background = '#ffffff';
    exportContainer.style.color = '#1e293b';
    exportContainer.style.width = '780px';
    exportContainer.style.margin = '0 auto';
    exportContainer.style.padding = '15px 20px';
    exportContainer.style.boxSizing = 'border-box';
    exportContainer.style.fontFamily = "'Inter', Arial, sans-serif";
    exportContainer.style.fontSize = '12px';

    exportContainer.innerHTML = `
        <div style="text-align: center; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1.5px solid #cbd5e1;">
            <h1 style="margin: 0 0 4px 0; font-size: 18px; font-weight: 700; color: #0f172a;">REKAPITULASI PEMAKAIAN & STOK SOLAR</h1>
            <p style="margin:0; color:#64748b; font-size: 12px;">${periodText} | ${supplierText}</p>
        </div>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 12px; font-size: 11.5px;">
            <thead>
                <tr style="background: #f8fafc; font-weight: 700; color: #334155;">
                    <th style="border: 1px solid #cbd5e1; padding: 4.5px 8px; width: 35px; text-align: center;">No</th>
                    <th style="border: 1px solid #cbd5e1; padding: 4.5px 8px; width: 180px; text-align: left;">Tanggal</th>
                    <th style="border: 1px solid #cbd5e1; padding: 4.5px 8px; text-align: left;">Pemasok</th>
                    <th style="border: 1px solid #cbd5e1; padding: 4.5px 8px; width: 100px; text-align: right;">Masuk (L)</th>
                    <th style="border: 1px solid #cbd5e1; padding: 4.5px 8px; width: 100px; text-align: right;">Keluar (L)</th>
                    <th style="border: 1px solid #cbd5e1; padding: 4.5px 8px; width: 110px; text-align: right;">Saldo (L)</th>
                </tr>
            </thead>
            <tbody>${rowsHtml}</tbody>
            <tfoot>
                <tr style="background: #f1f5f9; font-size: 12px; color: #0f172a;">
                    <th colspan="3" style="border: 1px solid #cbd5e1; padding: 5px 8px; text-align: right;">TOTAL :</th>
                    <th style="border: 1px solid #cbd5e1; padding: 5px 8px; text-align: right; color: #166534;">+ ${totalMasuk.toLocaleString('id-ID')}</th>
                    <th style="border: 1px solid #cbd5e1; padding: 5px 8px; text-align: right; color: #991b1b;">- ${totalKeluar.toLocaleString('id-ID')}</th>
                    <th style="border: 1px solid #cbd5e1; padding: 5px 8px; text-align: right; color: ${totalSaldo >= 0 ? '#0f766e' : '#b91c1c'};">${totalSaldo.toLocaleString('id-ID')}</th>
                </tr>
            </tfoot>
        </table>
    `;

    try {
        if (typeof html2pdf === 'undefined') throw new Error('Modul html2pdf belum siap.');
        const opt = {
            margin: [8, 10, 8, 10],
            filename: filename,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff' },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };
        await html2pdf().set(opt).from(exportContainer).save();
    } catch (err) {
        alert('Gagal mengekspor PDF: ' + (err.message || err));
    }
}
window.exportRekapSolarPDF = exportRekapSolarPDF;

export function printRekapSolar() {
    window.exportRekapSolarPDF();
}
window.printRekapSolar = printRekapSolar;

export async function exportTagihanPDF(buyerId) {
    const data = getData();
    const buyer = (data.buyers || []).find(b => b.id === buyerId);
    if (!buyer) return;

    const startEl = document.getElementById('filter-penagihan-start');
    const endEl = document.getElementById('filter-penagihan-end');
    const startDate = startEl ? startEl.value : '';
    const endDate = endEl ? endEl.value : '';

    const segments = [];
    (data.transactions || []).forEach(t => {
        if (startDate && t.date < startDate) return;
        if (endDate && t.date > endDate) return;

        const info = getTransactionPaymentInfo(t, buyerId);
        let txSales = [];
        if (Array.isArray(t.sales)) txSales = t.sales;
        else if (typeof t.sales === 'string') {
            try { txSales = JSON.parse(t.sales); } catch (e) {}
        }

        if (txSales && txSales.length > 0) {
            txSales.forEach(s => {
                if (s.buyerId === buyerId) {
                    segments.push({
                        txId: t.id,
                        date: t.date,
                        amount: parseFloat(s.total) || 0,
                        qty: parseFloat(s.qty) || 0,
                        status: info.status,
                        paidAmount: info.paid,
                        remainingAmount: info.remaining
                    });
                }
            });
        }
    });

    segments.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const totalSales = segments.reduce((sum, s) => sum + s.amount, 0);
    const totalPaid = segments.reduce((sum, s) => sum + s.paidAmount, 0);
    const totalUnpaid = segments.reduce((sum, s) => sum + s.remainingAmount, 0);

    const filename = `Invoice_${(buyer.name || 'Pelanggan').replace(/[^a-zA-Z0-9_-]/g, '_')}.pdf`;

    const exportContainer = document.createElement('div');
    exportContainer.style.background = '#ffffff';
    exportContainer.style.color = '#1e293b';
    exportContainer.style.width = '780px';
    exportContainer.style.margin = '0 auto';
    exportContainer.style.padding = '15px 20px';
    exportContainer.style.boxSizing = 'border-box';
    exportContainer.style.fontFamily = "'Inter', Arial, sans-serif";
    exportContainer.style.fontSize = '11.5px';

    exportContainer.innerHTML = `
        <div style="text-align: center; margin-bottom: 12px; border-bottom: 2px solid #0f172a; padding-bottom: 8px;">
            <h1 style="margin: 0; font-size: 20px; font-weight: 800;">FAKTUR TAGIHAN PENJUALAN</h1>
            <p style="margin: 2px 0 0 0; color: #475569; font-size: 13px;">Pelanggan: <strong>${buyer.name}</strong></p>
        </div>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 15px; font-size: 11.5px;">
            <thead>
                <tr style="background: #f1f5f9;">
                    <th style="border: 1px solid #cbd5e1; padding: 6px; text-align: left;">Tanggal</th>
                    <th style="border: 1px solid #cbd5e1; padding: 6px; text-align: center;">Qty</th>
                    <th style="border: 1px solid #cbd5e1; padding: 6px; text-align: right;">Total Tagihan</th>
                    <th style="border: 1px solid #cbd5e1; padding: 6px; text-align: right;">Terbayar</th>
                    <th style="border: 1px solid #cbd5e1; padding: 6px; text-align: right;">Sisa Piutang</th>
                    <th style="border: 1px solid #cbd5e1; padding: 6px; text-align: center;">Status</th>
                </tr>
            </thead>
            <tbody>
                ${segments.map(s => `
                    <tr>
                        <td style="border: 1px solid #cbd5e1; padding: 5px;">${formatDate(s.date)}</td>
                        <td style="border: 1px solid #cbd5e1; padding: 5px; text-align: center;">${s.qty} Rit</td>
                        <td style="border: 1px solid #cbd5e1; padding: 5px; text-align: right;">${formatCurrency(s.amount)}</td>
                        <td style="border: 1px solid #cbd5e1; padding: 5px; text-align: right; color:#059669;">${formatCurrency(s.paidAmount)}</td>
                        <td style="border: 1px solid #cbd5e1; padding: 5px; text-align: right; color:#dc2626; font-weight: bold;">${formatCurrency(s.remainingAmount)}</td>
                        <td style="border: 1px solid #cbd5e1; padding: 5px; text-align: center;">${s.status}</td>
                    </tr>
                `).join('')}
            </tbody>
            <tfoot>
                <tr style="background: #f8fafc; font-weight: bold;">
                    <td colspan="2" style="border: 1px solid #cbd5e1; padding: 6px; text-align: right;">TOTAL:</td>
                    <td style="border: 1px solid #cbd5e1; padding: 6px; text-align: right;">${formatCurrency(totalSales)}</td>
                    <td style="border: 1px solid #cbd5e1; padding: 6px; text-align: right; color:#059669;">${formatCurrency(totalPaid)}</td>
                    <td style="border: 1px solid #cbd5e1; padding: 6px; text-align: right; color:#dc2626;">${formatCurrency(totalUnpaid)}</td>
                    <td style="border: 1px solid #cbd5e1; padding: 6px;"></td>
                </tr>
            </tfoot>
        </table>
    `;

    try {
        if (typeof html2pdf === 'undefined') throw new Error('Modul html2pdf belum siap.');
        const opt = {
            margin: [8, 10, 8, 10],
            filename: filename,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { scale: 2, useCORS: true, logging: false, backgroundColor: '#ffffff' },
            jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
        };
        await html2pdf().set(opt).from(exportContainer).save();
    } catch (err) {
        alert('Gagal mengekspor PDF: ' + (err.message || err));
    }
}
window.exportTagihanPDF = exportTagihanPDF;

export function printTagihan(buyerId) {
    window.exportTagihanPDF(buyerId);
}
window.printTagihan = printTagihan;
