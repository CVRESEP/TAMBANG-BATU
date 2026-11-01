// ============================================================
// src/laporan-pdf.js — PDF Exports (Laporan Mingguan, Solar, Tagihan)
// ============================================================
import { getData, formatDate, formatCurrency, getWeekRange } from './core.js';
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
        page1El = printable.querySelector('#report-page-1') || printable;
        page2El = printable.querySelector('#report-page-2') || printable.querySelector('.potongan-page');
    }

    const totalPages = 2;
    const btn = document.getElementById('btn-export-laporan-pdf') || document.querySelector('.btn-export button');
    let originalBtnHtml = '';
    if (btn) {
        originalBtnHtml = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = `<span class="material-symbols-outlined" style="animation: spin 1s linear infinite; font-size:18px; vertical-align:middle;">sync</span> Menyiapkan PDF (${totalPages} Lembar)...`;
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

        const prevPage2Border = page2El ? page2El.style.borderTop : '';
        const prevPage2Margin = page2El ? page2El.style.marginTop : '';
        const prevPage2Padding = page2El ? page2El.style.paddingTop : '';

        if (page2El) {
            page2El.style.borderTop = 'none';
            page2El.style.marginTop = '0';
            page2El.style.paddingTop = '10px';
        }

        const canvas1 = await html2canvas(page1El, {
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff'
        });

        let canvas2 = null;
        if (page2El) {
            canvas2 = await html2canvas(page2El, {
                scale: 2,
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff'
            });
            page2El.style.borderTop = prevPage2Border;
            page2El.style.marginTop = prevPage2Margin;
            page2El.style.paddingTop = prevPage2Padding;
        }

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
        if (canvas2) {
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
        }

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

// ---- Invoice / Tagihan ----
const fmtShortDate = (d) => {
    if (!d) return '-';
    const dt = new Date(d);
    return isNaN(dt) ? d : dt.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
};
const fmtRp = (n) => 'Rp ' + Math.round(parseFloat(n) || 0).toLocaleString('id-ID');
const escHtml = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function collectBuyerSegments(data, buyerId, { startDate, endDate, filterStatus }) {
    const buyer = (data.buyers || []).find(b => b.id === buyerId);
    const segments = [];
    (data.transactions || []).forEach(t => {
        if (startDate && t.date < startDate) return;
        if (endDate && t.date > endDate) return;

        let txSales = [];
        if (Array.isArray(t.sales)) txSales = t.sales;
        else if (typeof t.sales === 'string') { try { txSales = JSON.parse(t.sales) || []; } catch (e) {} }

        let qty = 0;
        let found = false;
        if (txSales.length > 0) {
            txSales.forEach(s => {
                if (s.buyerId === buyerId) { found = true; qty += parseFloat(s.qty) || 0; }
            });
        } else if ((t.buyerId || t.buyerid) === buyerId) {
            found = true; qty = 1;
        }
        if (!found) return;

        const info = getTransactionPaymentInfo(t, buyerId);
        if (filterStatus && info.status !== filterStatus) return;

        const fallbackPrice = parseFloat(buyer?.unitPrice ?? buyer?.unitprice) || 0;
        const unitPrice = qty > 0 ? (info.total / qty) : fallbackPrice;
        segments.push({
            date: t.date, qty, unitPrice,
            amount: info.total, paidAmount: info.paid, remainingAmount: info.remaining, status: info.status
        });
    });
    segments.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    return segments;
}

function buildRecapHtml(sections, periodText) {
    const td = 'border:1px solid #cbd5e1; padding:6px 8px; font-size:11px;';
    const gt = { total: 0, paid: 0, unpaid: 0, qty: 0 };
    const recapRows = sections.map((s, i) => {
        const r = {
            qty: s.segments.reduce((a, x) => a + x.qty, 0),
            total: s.segments.reduce((a, x) => a + x.amount, 0),
            paid: s.segments.reduce((a, x) => a + x.paidAmount, 0),
            unpaid: s.segments.reduce((a, x) => a + x.remainingAmount, 0)
        };
        gt.qty += r.qty;
        gt.total += r.total;
        gt.paid += r.paid;
        gt.unpaid += r.unpaid;
        return `<tr>
            <td style="${td} text-align:center;">${i + 1}</td>
            <td style="${td} font-weight:600;">${escHtml(s.buyer.name)}</td>
            <td style="${td} text-align:center;">${r.qty.toLocaleString('id-ID')} Rit</td>
            <td style="${td} text-align:right; font-weight:600;">${fmtRp(r.total)}</td>
            <td style="${td} text-align:right; color:#059669; font-weight:600;">${fmtRp(r.paid)}</td>
            <td style="${td} text-align:right; color:#dc2626; font-weight:700;">${fmtRp(r.unpaid)}</td>
        </tr>`;
    }).join('');

    return `
        <div style="text-align:center; margin-bottom:14px; border-bottom:2px solid #0f172a; padding-bottom:8px;">
            <h1 style="margin:0; font-size:20px; font-weight:800; color:#0f172a; letter-spacing:0.5px;">REKAP TAGIHAN PEMBELI</h1>
            <p style="margin:4px 0 0 0; color:#64748b; font-size:12px;">${periodText} • Total ${sections.length} Pelanggan</p>
        </div>
        <table style="width:100%; border-collapse:collapse; margin-bottom:14px;">
            <thead>
                <tr style="background:#f1f5f9; color:#334155; font-size:11.5px;">
                    <th style="${td} text-align:center; width:35px;">No</th>
                    <th style="${td} text-align:left;">Nama Pelanggan</th>
                    <th style="${td} text-align:center; width:65px;">Total Rit</th>
                    <th style="${td} text-align:right; width:135px;">Total Tagihan</th>
                    <th style="${td} text-align:right; width:135px;">Sudah Dibayar</th>
                    <th style="${td} text-align:right; width:135px;">Sisa Piutang</th>
                </tr>
            </thead>
            <tbody>${recapRows}</tbody>
            <tfoot>
                <tr style="background:#f8fafc; font-weight:700; font-size:11.5px;">
                    <td colspan="2" style="${td} text-align:right;">GRAND TOTAL</td>
                    <td style="${td} text-align:center;">${gt.qty.toLocaleString('id-ID')} Rit</td>
                    <td style="${td} text-align:right; font-weight:700;">${fmtRp(gt.total)}</td>
                    <td style="${td} text-align:right; color:#059669; font-weight:700;">${fmtRp(gt.paid)}</td>
                    <td style="${td} text-align:right; color:#dc2626; font-weight:800;">${fmtRp(gt.unpaid)}</td>
                </tr>
            </tfoot>
        </table>
        <div style="margin-top:20px; display:flex; justify-content:flex-end;">
            <div style="border:1.5px solid #fecaca; background:#fef2f2; border-radius:6px; padding:8px 16px; font-size:12px;">
                Total Sisa Piutang Keseluruhan: <strong style="color:#dc2626; font-size:14px; margin-left:4px;">${fmtRp(gt.unpaid)}</strong>
            </div>
        </div>
    `;
}

function buildWeekTableHtml(w, wNum, td, statusColor) {
    const wQty = w.items.reduce((a, x) => a + x.qty, 0);
    const wSales = w.items.reduce((a, x) => a + x.amount, 0);
    const wPaid = w.items.reduce((a, x) => a + x.paidAmount, 0);
    const wUnpaid = w.items.reduce((a, x) => a + x.remainingAmount, 0);

    const itemRows = w.items.map((s, itemIdx) => `
        <tr>
            <td style="${td} text-align:center; width:30px;">${itemIdx + 1}</td>
            <td style="${td} text-align:left; white-space:nowrap;">${fmtShortDate(s.date)}</td>
            <td style="${td} text-align:center; white-space:nowrap; width:55px;">${s.qty.toLocaleString('id-ID')} Rit</td>
            <td style="${td} text-align:right; white-space:nowrap; color:#475569;">${fmtRp(s.unitPrice)}</td>
            <td style="${td} text-align:right; white-space:nowrap; font-weight:600;">${fmtRp(s.amount)}</td>
            <td style="${td} text-align:right; white-space:nowrap; color:#059669; font-weight:600;">${fmtRp(s.paidAmount)}</td>
            <td style="${td} text-align:right; white-space:nowrap; color:#dc2626; font-weight:700;">${fmtRp(s.remainingAmount)}</td>
            <td style="${td} text-align:center; white-space:nowrap; color:${statusColor(s.status)}; font-weight:600; width:75px;">${s.status}</td>
        </tr>
    `).join('');

    return `
        <div class="invoice-week-block" style="margin-bottom:14px; page-break-inside:avoid; break-inside:avoid;">
            <div style="background:#e0f2fe; color:#0369a1; border:1px solid #7dd3fc; border-bottom:none; padding:5px 8px; font-weight:700; font-size:11.5px; border-radius:4px 4px 0 0; display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <span style="display:inline-block; background:#0284c7; color:white; padding:1px 7px; border-radius:3px; font-size:10px; font-weight:700; margin-right:6px;">MINGGU ${wNum}</span>
                    <span>Periode: <strong>${w.label}</strong></span>
                </div>
                <span style="font-size:10.5px; color:#0284c7; font-weight:600;">${w.items.length} Transaksi</span>
            </div>
            <table style="width:100%; border-collapse:collapse; border:1px solid #cbd5e1; border-top:none;">
                <thead>
                    <tr style="background:#f8fafc; color:#334155; font-size:11px;">
                        <th style="${td} text-align:center; width:30px;">No</th>
                        <th style="${td} text-align:left;">Tanggal</th>
                        <th style="${td} text-align:center; width:55px;">Qty</th>
                        <th style="${td} text-align:right;">Harga / Rit</th>
                        <th style="${td} text-align:right;">Total Tagihan</th>
                        <th style="${td} text-align:right;">Terbayar</th>
                        <th style="${td} text-align:right;">Sisa Piutang</th>
                        <th style="${td} text-align:center; width:75px;">Status</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemRows}
                </tbody>
                <tfoot>
                    <tr style="background:#f0f9ff; font-weight:700; font-size:11px; border-top:1.5px solid #cbd5e1;">
                        <td colspan="2" style="${td} text-align:right; color:#0369a1;">Subtotal Minggu ${wNum} :</td>
                        <td style="${td} text-align:center; font-weight:700;">${wQty.toLocaleString('id-ID')} Rit</td>
                        <td style="${td}"></td>
                        <td style="${td} text-align:right; font-weight:700;">${fmtRp(wSales)}</td>
                        <td style="${td} text-align:right; color:#059669; font-weight:700;">${fmtRp(wPaid)}</td>
                        <td style="${td} text-align:right; color:#dc2626; font-weight:800;">${fmtRp(wUnpaid)}</td>
                        <td style="${td}"></td>
                    </tr>
                </tfoot>
            </table>
        </div>
    `;
}

export function buildInvoicePages(buyer, segments, periodText) {
    const totQty = segments.reduce((s, x) => s + x.qty, 0);
    const totSales = segments.reduce((s, x) => s + x.amount, 0);
    const totPaid = segments.reduce((s, x) => s + x.paidAmount, 0);
    const totUnpaid = segments.reduce((s, x) => s + x.remainingAmount, 0);
    const td = 'border:1px solid #cbd5e1; padding:5px 6px; font-size:11px;';
    const statusColor = (st) => st === 'Lunas' ? '#059669' : st === 'Sebagian' ? '#d97706' : '#dc2626';

    const headerHtml = `
        <div style="text-align:center; margin-bottom:12px; border-bottom:2px solid #0f172a; padding-bottom:8px;">
            <h1 style="margin:0; font-size:20px; font-weight:800; color:#0f172a; letter-spacing:0.5px;">FAKTUR TAGIHAN PENJUALAN</h1>
            <p style="margin:4px 0 0 0; color:#334155; font-size:13px;">Pelanggan: <strong style="color:#0f172a;">${escHtml(buyer.name)}</strong>${buyer.address ? ` (${escHtml(buyer.address)})` : ''}</p>
            <p style="margin:3px 0 0 0; color:#64748b; font-size:11.5px;">${periodText}</p>
        </div>
    `;

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
    const isMultiWeek = weekGroups.length > 1;

    const summaryTableHtml = (isMultiWeek && segments.length > 0) ? `
        <div style="margin-bottom:14px; background:#f8fafc; border:1px solid #cbd5e1; border-radius:6px; padding:8px 12px; page-break-inside:avoid; break-inside:avoid;">
            <div style="font-weight:700; font-size:11.5px; color:#1e293b; margin-bottom:6px;">Ringkasan Tagihan Per Minggu:</div>
            <table style="width:100%; border-collapse:collapse; font-size:10.5px;">
                <thead>
                    <tr style="background:#f1f5f9; color:#334155;">
                        <th style="${td} text-align:left;">Minggu</th>
                        <th style="${td} text-align:center; width:65px;">Total Rit</th>
                        <th style="${td} text-align:right;">Total Tagihan</th>
                        <th style="${td} text-align:right;">Sudah Dibayar</th>
                        <th style="${td} text-align:right;">Sisa Piutang</th>
                    </tr>
                </thead>
                <tbody>
                    ${weekGroups.map((w, idx) => {
                        const q = w.items.reduce((a, x) => a + x.qty, 0);
                        const t = w.items.reduce((a, x) => a + x.amount, 0);
                        const p = w.items.reduce((a, x) => a + x.paidAmount, 0);
                        const u = w.items.reduce((a, x) => a + x.remainingAmount, 0);
                        return `<tr>
                            <td style="${td}"><strong>Minggu ${idx + 1}</strong> (${w.label})</td>
                            <td style="${td} text-align:center;">${q.toLocaleString('id-ID')} Rit</td>
                            <td style="${td} text-align:right; font-weight:600;">${fmtRp(t)}</td>
                            <td style="${td} text-align:right; color:#059669; font-weight:600;">${fmtRp(p)}</td>
                            <td style="${td} text-align:right; color:#dc2626; font-weight:700;">${fmtRp(u)}</td>
                        </tr>`;
                    }).join('')}
                </tbody>
            </table>
        </div>
    ` : '';

    const grandTotalHtml = `
        <div style="margin-top:14px; page-break-inside:avoid; break-inside:avoid;">
            <table style="width:100%; border-collapse:collapse; border:2px solid #0f172a; margin-bottom:12px;">
                <tr style="background:#e2e8f0; font-weight:800; font-size:11.5px;">
                    <td style="${td} text-align:right; letter-spacing:0.5px;">TOTAL KESELURUHAN</td>
                    <td style="${td} text-align:center; width:55px;">${totQty.toLocaleString('id-ID')} Rit</td>
                    <td style="${td}; width:90px;"></td>
                    <td style="${td} text-align:right; font-weight:800; width:110px;">${fmtRp(totSales)}</td>
                    <td style="${td} text-align:right; color:#059669; font-weight:800; width:110px;">${fmtRp(totPaid)}</td>
                    <td style="${td} text-align:right; color:#dc2626; font-weight:900; width:110px;">${fmtRp(totUnpaid)}</td>
                    <td style="${td}; width:75px;"></td>
                </tr>
            </table>
            <div style="display:flex; justify-content:flex-end;">
                <div style="border:1.5px solid #fecaca; background:#fef2f2; border-radius:6px; padding:6px 14px; font-size:12px;">
                    Sisa yang harus dibayar: <strong style="color:#dc2626; font-size:13.5px; margin-left:4px;">${fmtRp(totUnpaid)}</strong>
                </div>
            </div>
        </div>
    `;

    if (segments.length === 0) {
        return [`
            ${headerHtml}
            <div style="${td} text-align:center; color:#94a3b8; padding:20px; border-radius:6px;">Tidak ada tagihan pada periode ini.</div>
        `];
    }

    const weekBlocks = weekGroups.map((w, wIdx) => buildWeekTableHtml(w, wIdx + 1, td, statusColor));

    // Ukur elemen via container tersembunyi berukuran tepat 780px
    const measureBox = document.createElement('div');
    measureBox.style.cssText = `
        position: fixed;
        left: -9999px;
        top: 0;
        width: 780px;
        padding: 24px 28px;
        box-sizing: border-box;
        font-family: 'Inter', Arial, sans-serif;
        font-size: 11px;
        visibility: hidden;
    `;
    document.body.appendChild(measureBox);

    const measureHeight = (blocks) => {
        measureBox.innerHTML = blocks.join('');
        return measureBox.offsetHeight;
    };

    // A4 printable height ~1137px pada 780px lebar. Batas aman: 1040px agar tidak pernah terpotong.
    const MAX_PAGE_HEIGHT = 1040;

    const pages = [];
    let curPage = [headerHtml];
    if (summaryTableHtml) curPage.push(summaryTableHtml);

    const subHeaderForNextPage = (pageNum) => `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; border-bottom:1.5px solid #64748b; padding-bottom:6px;">
            <span style="font-weight:700; font-size:12.5px; color:#0f172a;">FAKTUR TAGIHAN: ${escHtml(buyer.name)} (Hal. ${pageNum})</span>
            <span style="font-size:11px; color:#64748b;">${periodText}</span>
        </div>
    `;

    for (let i = 0; i < weekBlocks.length; i++) {
        const wb = weekBlocks[i];
        const testBlocks = [...curPage, wb];
        const h = measureHeight(testBlocks);

        if (h <= MAX_PAGE_HEIGHT || curPage.length <= 1) {
            curPage.push(wb);
        } else {
            // Tabel minggu ini tidak muat: simpan halaman ini, pindahkan tabel minggu ini secara UTUH ke halaman selanjutnya
            pages.push(curPage.join(''));
            curPage = [subHeaderForNextPage(pages.length + 1), wb];
        }
    }

    // Cek apakah footer muat di halaman terakhir
    const testWithFooter = [...curPage, grandTotalHtml];
    if (measureHeight(testWithFooter) <= MAX_PAGE_HEIGHT) {
        curPage.push(grandTotalHtml);
        pages.push(curPage.join(''));
    } else {
        pages.push(curPage.join(''));
        curPage = [subHeaderForNextPage(pages.length + 1), grandTotalHtml];
        pages.push(curPage.join(''));
    }

    if (measureBox.parentNode) measureBox.parentNode.removeChild(measureBox);
    return pages;
}

export function buildInvoiceSection(buyer, segments, periodText) {
    const pages = buildInvoicePages(buyer, segments, periodText);
    return pages.join('<div style="page-break-before:always; break-before:page; margin-top:20px; border-top:1px dashed #cbd5e1; padding-top:20px;"></div>');
}

export async function exportTagihanPDF(buyerIds) {
    const data = getData();
    let ids = Array.isArray(buyerIds) ? buyerIds : (buyerIds ? [buyerIds] : []);
    ids = ids.filter(id => (data.buyers || []).some(b => b.id === id));
    if (ids.length === 0) { alert('Pilih minimal satu pembeli untuk dicetak.'); return; }

    const jsPDFClass = (window.jspdf && window.jspdf.jsPDF) ? window.jspdf.jsPDF : window.jsPDF;
    if (!jsPDFClass || typeof html2canvas === 'undefined') {
        alert('Pustaka PDF (jsPDF / html2canvas) belum siap.');
        return;
    }

    const startDate = document.getElementById('filter-penagihan-start')?.value || '';
    const endDate = document.getElementById('filter-penagihan-end')?.value || '';
    const filterStatus = document.getElementById('filter-penagihan-status')?.value || '';
    const periodText = (startDate || endDate)
        ? `Periode: ${startDate ? fmtShortDate(startDate) : '-'} s.d ${endDate ? fmtShortDate(endDate) : '-'}`
        : 'Seluruh Periode';

    const sections = ids.map(id => {
        const buyer = data.buyers.find(b => b.id === id);
        return { buyer, segments: collectBuyerSegments(data, id, { startDate, endDate, filterStatus }) };
    }).filter(x => ids.length === 1 || x.segments.length > 0);

    if (sections.length === 0) { alert('Tidak ada tagihan untuk pembeli terpilih pada filter ini.'); return; }

    // Mount container di fixed (0,0) agar koordinat screenshot 100% presisi dan tidak tergeser/terpotong
    const mount = document.createElement('div');
    mount.style.cssText = `
        position: fixed;
        left: 0;
        top: 0;
        width: 780px;
        background: #ffffff;
        color: #1e293b;
        padding: 24px 28px;
        box-sizing: border-box;
        font-family: 'Inter', Arial, sans-serif;
        font-size: 11px;
        z-index: 999999;
        pointer-events: none;
    `;
    document.body.appendChild(mount);

    const pdf = new jsPDFClass({
        unit: 'mm',
        format: 'a4',
        orientation: 'portrait'
    });

    const pageWidth = 210;
    const pageHeight = 297;
    const marginX = 10;
    const marginY = 10;
    const printableWidth = pageWidth - (marginX * 2); // 190mm
    const maxPrintableHeight = pageHeight - (marginY * 2); // 277mm

    const renderBlockToPdf = async (htmlContent, isFirstPage) => {
        mount.innerHTML = htmlContent;
        await new Promise(r => setTimeout(r, 80));

        const canvas = await html2canvas(mount, {
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff',
            scrollX: 0,
            scrollY: 0,
            x: 0,
            y: 0,
            width: 780
        });

        if (!isFirstPage) {
            pdf.addPage('a4', 'portrait');
        }

        const imgData = canvas.toDataURL('image/jpeg', 0.98);
        const canvasHeight = canvas.height;
        const canvasWidth = canvas.width;
        let renderWidth = printableWidth;
        let renderHeight = (canvasHeight * renderWidth) / canvasWidth;

        // Skala proporsional agar halaman selalu utuh dan muat di 1 lembar tanpa terpotong
        if (renderHeight > maxPrintableHeight) {
            const ratio = maxPrintableHeight / renderHeight;
            renderWidth = renderWidth * ratio;
            renderHeight = maxPrintableHeight;
        }
        const posX = marginX + (printableWidth - renderWidth) / 2;
        pdf.addImage(imgData, 'JPEG', posX, marginY, renderWidth, renderHeight);
    };

    try {
        let isFirst = true;
        // 1. Jika beberapa pembeli, buat halaman rekap rangkuman terlebih dahulu
        if (sections.length > 1) {
            const recapHtml = buildRecapHtml(sections, periodText);
            await renderBlockToPdf(recapHtml, isFirst);
            isFirst = false;
        }

        // 2. Buat halaman faktur detail untuk masing-masing pembeli (per lembar utuh, tiap tabel tidak terpotong)
        for (const s of sections) {
            const invoicePages = buildInvoicePages(s.buyer, s.segments, periodText);
            for (const pageHtml of invoicePages) {
                await renderBlockToPdf(pageHtml, isFirst);
                isFirst = false;
            }
        }

        const safe = (n) => (n || 'Pelanggan').replace(/[^a-zA-Z0-9_-]/g, '_');
        const filename = sections.length === 1
            ? `Invoice_${safe(sections[0].buyer.name)}.pdf`
            : `Invoice_${sections.length}_Pembeli_${new Date().toISOString().slice(0, 10)}.pdf`;

        pdf.save(filename);
    } catch (err) {
        console.error('Gagal cetak PDF:', err);
        alert('Gagal mengekspor PDF: ' + (err.message || err));
    } finally {
        if (mount.parentNode) mount.parentNode.removeChild(mount);
    }
}
window.exportTagihanPDF = exportTagihanPDF;

// Cetak semua pembeli yang dipilih di filter (atau semua yang tampil jika tidak ada pilihan)
window.exportTagihanTerpilihPDF = async () => {
    let ids = window.getSelectedPenagihanBuyers ? window.getSelectedPenagihanBuyers() : [];
    if (ids.length === 0) {
        ids = [...document.querySelectorAll('[data-penagihan-buyer]')].map(el => el.getAttribute('data-penagihan-buyer'));
    }
    const btn = document.getElementById('btn-cetak-tagihan-terpilih');
    const orig = btn ? btn.innerHTML : '';
    if (btn) { btn.disabled = true; btn.innerHTML = '<span class="material-symbols-outlined" style="font-size:16px; animation: spin 1s linear infinite;">sync</span> Menyiapkan...'; }
    try { await exportTagihanPDF(ids); }
    finally { if (btn) { btn.disabled = false; btn.innerHTML = orig; } }
};

export function printTagihan(buyerId) {
    window.exportTagihanPDF(buyerId);
}
window.printTagihan = printTagihan;
