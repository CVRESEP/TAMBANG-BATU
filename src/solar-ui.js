// ============================================================
// src/solar-ui.js — Manajemen UI, Transaksi & Pemasok Solar
// ============================================================
import { getData, saveData, deleteFromDatabase, generateId, formatDate, showToast } from './core.js';
import { getAllSolarSuppliers, getDefaultSolarSupplier, getCalculatedSolarRecords } from './solar-calc.js';

export async function saveSolarSupplierToDatabase(name) {
    if (!name || !name.trim() || name === '__NEW__' || name === '-') return;
    const cleanName = name.trim().toUpperCase();
    const data = getData();
    if (!data.solarSuppliers) data.solarSuppliers = [];

    let existing = data.solarSuppliers.find(s => (typeof s === 'string' ? s : s.name).toUpperCase() === cleanName);
    let item;
    if (existing) {
        item = typeof existing === 'string' ? { id: generateId(), name: cleanName, created_at: new Date().toISOString() } : existing;
    } else {
        item = { id: generateId(), name: cleanName, created_at: new Date().toISOString() };
        data.solarSuppliers.push(item);
    }

    try {
        await saveData(data, 'solar_suppliers', { id: item.id, name: item.name, created_at: item.created_at || new Date().toISOString() });
    } catch (err) {
        console.error("Gagal menyimpan supplier ke database:", err);
    }
    return item;
}

window.saveSolarSupplierToDatabase = saveSolarSupplierToDatabase;

window.render_solar = () => {
    const data = getData();
    const tbody = document.getElementById('tbody-solar');
    if (!tbody) return;

    const startEl = document.getElementById('filter-solar-start');
    const endEl = document.getElementById('filter-solar-end');
    const startDate = startEl ? startEl.value : '';
    const endDate = endEl ? endEl.value : '';

    const solarRecords = getCalculatedSolarRecords(data);

    const allSuppliers = new Set();
    solarRecords.forEach(s => {
        const sup = (s.supplier || 'LAINNYA').toUpperCase().trim();
        allSuppliers.add(sup);
    });
    (data.solarSuppliers || []).forEach(s => {
        const name = typeof s === 'string' ? s : s.name;
        if (name && name.trim()) allSuppliers.add(name.trim().toUpperCase());
    });
    (data.expenseTypes || []).forEach(e => {
        if (e.linkedSolarSupplier && e.linkedSolarSupplier.trim()) {
            allSuppliers.add(e.linkedSolarSupplier.trim().toUpperCase());
        }
    });
    if (data.solarDateOverrides) {
        Object.values(data.solarDateOverrides).forEach(sup => {
            if (typeof sup === 'string' && sup.trim()) allSuppliers.add(sup.trim().toUpperCase());
        });
    }

    const filterSelect = document.getElementById('filter-solar-supplier');
    if (filterSelect) {
        const currentFilter = filterSelect.value;
        let optHtml = '<option value="">Semua Pemasok</option>';
        Array.from(allSuppliers).sort().forEach(sup => {
            optHtml += `<option value="${sup}" ${sup === currentFilter ? 'selected' : ''}>${sup}</option>`;
        });
        filterSelect.innerHTML = optHtml;
    }

    const activeSupplierFilter = filterSelect ? filterSelect.value : '';

    let filteredRecords = solarRecords.filter(s => {
        if (startDate && s.date < startDate) return false;
        if (endDate && s.date > endDate) return false;
        if (activeSupplierFilter && (s.supplier || 'LAINNYA').toUpperCase().trim() !== activeSupplierFilter) return false;
        return true;
    });

    const supplierStats = {};
    let totalMasukGlobal = 0;
    let totalKeluarGlobal = 0;

    filteredRecords.forEach(s => {
        const sup = (s.supplier || 'LAINNYA').toUpperCase().trim();
        if (!supplierStats[sup]) supplierStats[sup] = { masuk: 0, keluar: 0, sisa: 0 };
        if (s.type === 'Masuk') {
            supplierStats[sup].masuk += s.amount;
            totalMasukGlobal += s.amount;
        } else if (s.type === 'Keluar') {
            supplierStats[sup].keluar += s.amount;
            totalKeluarGlobal += s.amount;
        }
    });

    Object.keys(supplierStats).forEach(sup => {
        supplierStats[sup].sisa = supplierStats[sup].masuk - supplierStats[sup].keluar;
    });
    const saldoGlobal = totalMasukGlobal - totalKeluarGlobal;

    filteredRecords.sort((a, b) => new Date(b.date) - new Date(a.date));

    if (filteredRecords.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted" style="padding:2rem;">Belum ada data solar pada rentang tanggal/filter yang dipilih</td></tr>';
    } else {
        const masterSuppliers = getAllSolarSuppliers(data);
        let html = '';
        filteredRecords.forEach(s => {
            const supName = (s.supplier || '-').toUpperCase();
            const rowSuppliers = [...masterSuppliers];
            if (supName && supName !== '-' && !rowSuppliers.includes(supName)) {
                rowSuppliers.push(supName);
            }
            let rowSupplierOptions = '';
            rowSuppliers.forEach(sup => {
                const isSelected = (sup === supName) ? 'selected' : '';
                rowSupplierOptions += `<option value="${sup}" ${isSelected}>${sup}</option>`;
            });
            rowSupplierOptions += `<option value="__SPLIT__">✂️ Bagi Jadi 2 Pemasok...</option>`;
            rowSupplierOptions += `<option value="__NEW__">+ Tambah Pemasok Baru...</option>`;

            html += `
                <tr style="${s.isAuto ? 'background: #f8fafc;' : ''}">
                    <td>${formatDate(s.date)}</td>
                    <td>
                        <select class="form-control select-table-supplier" 
                                style="padding: 0.25rem 0.5rem; font-size: 0.85rem; font-weight: 600; width: 100%; min-width: 135px; border-radius: 6px; cursor: pointer; color: #1e293b; background: white; border: 1px solid #cbd5e1;" 
                                data-prev-val="${supName}" 
                                onchange="handleTableSolarSupplierChange(this, '${s.id}', ${s.isAuto ? 'true' : 'false'}, '${s.date}')">
                            ${rowSupplierOptions}
                        </select>
                    </td>
                    <td>
                        <span class="badge" style="background: ${s.type === 'Masuk' ? '#dcfce7' : '#fee2e2'}; color: ${s.type === 'Masuk' ? '#166534' : '#991b1b'};">
                            ${s.type} ${s.isAuto ? '(Otomatis)' : ''}
                        </span>
                    </td>
                    <td style="font-weight: bold; color: ${s.type === 'Masuk' ? '#166534' : '#991b1b'};">
                        ${s.type === 'Masuk' ? '+' : '-'} ${s.amount.toLocaleString('id-ID')} Liter
                    </td>
                    <td style="font-size: 0.85rem; color: #64748b;">${s.description || '-'}</td>
                    <td style="text-align: center;">
                        ${s.isAuto ? '<span style="color:#94a3b8; font-size:0.75rem;">(Otomatis)</span>' : `
                        <div class="d-flex justify-center" style="gap:0.25rem;">
                            <button class="btn-icon" style="color:var(--primary-color)" onclick="editSolar('${s.id}')"><span class="material-symbols-outlined" style="font-size:18px">edit</span></button>
                            <button class="btn-icon" style="color:var(--danger)" onclick="deleteSolar('${s.id}')"><span class="material-symbols-outlined" style="font-size:18px">delete</span></button>
                        </div>
                        `}
                    </td>
                </tr>
            `;
        });
        tbody.innerHTML = html;
    }

    let summaryDiv = document.getElementById('solar-summary-cards');
    if (!summaryDiv) {
        summaryDiv = document.createElement('div');
        summaryDiv.id = 'solar-summary-cards';
        summaryDiv.style.display = 'flex';
        summaryDiv.style.gap = '1rem';
        summaryDiv.style.marginBottom = '1.5rem';
        summaryDiv.style.flexWrap = 'wrap';
        const cardBody = document.querySelector('#solar .card-body');
        if (cardBody) cardBody.insertBefore(summaryDiv, cardBody.firstChild);
    }

    let summaryHtml = `
        <div style="flex: 1; min-width: 180px; background: white; padding: 1rem 1.25rem; border-radius: var(--radius-lg); border: 1px solid var(--border-color); border-left: 4px solid var(--primary-color); box-shadow: var(--shadow-sm);">
            <div style="font-size: 0.75rem; font-weight: 600; color: #64748b; text-transform: uppercase; margin-bottom: 0.25rem;">Total Solar Masuk</div>
            <div style="font-size: 1.25rem; font-weight: 700; color: #1e293b;">${totalMasukGlobal.toLocaleString('id-ID')} Liter</div>
        </div>
        <div style="flex: 1; min-width: 180px; background: white; padding: 1rem 1.25rem; border-radius: var(--radius-lg); border: 1px solid var(--border-color); border-left: 4px solid var(--danger); box-shadow: var(--shadow-sm);">
            <div style="font-size: 0.75rem; font-weight: 600; color: #64748b; text-transform: uppercase; margin-bottom: 0.25rem;">Total Pemakaian</div>
            <div style="font-size: 1.25rem; font-weight: 700; color: var(--danger);">- ${totalKeluarGlobal.toLocaleString('id-ID')} Liter</div>
        </div>
        <div style="flex: 1; min-width: 180px; background: white; padding: 1rem 1.25rem; border-radius: var(--radius-lg); border: 1px solid var(--border-color); border-left: 4px solid ${saldoGlobal >= 0 ? '#10b981' : '#ef4444'}; box-shadow: var(--shadow-sm);">
            <div style="font-size: 0.75rem; font-weight: 600; color: #64748b; text-transform: uppercase; margin-bottom: 0.25rem;">Total Sisa Saldo</div>
            <div style="font-size: 1.25rem; font-weight: 700; color: ${saldoGlobal >= 0 ? '#10b981' : '#ef4444'};">${saldoGlobal.toLocaleString('id-ID')} Liter</div>
        </div>
    `;

    Object.keys(supplierStats).sort().forEach(sup => {
        const st = supplierStats[sup];
        summaryHtml += `
        <div style="flex: 1; min-width: 180px; background: linear-gradient(135deg, #1e1b4b 0%, #312e81 100%); padding: 1rem 1.25rem; border-radius: var(--radius-lg); color: white; box-shadow: var(--shadow-md);">
            <div style="font-size: 0.75rem; font-weight: 600; color: #c7d2fe; text-transform: uppercase; margin-bottom: 0.25rem;">Stok: ${sup}</div>
            <div style="font-size: 1.25rem; font-weight: 700; color: ${st.sisa >= 0 ? '#38bdf8' : '#f87171'};">${st.sisa.toLocaleString('id-ID')} Liter</div>
            <div style="font-size: 0.7rem; color: #94a3b8; margin-top: 0.25rem;">Masuk: ${st.masuk.toLocaleString('id-ID')}L | Pakai: ${st.keluar.toLocaleString('id-ID')}L</div>
        </div>`;
    });

    if (summaryDiv) summaryDiv.innerHTML = summaryHtml;
};

window.handleTableSolarSupplierChange = async (selectEl, id, isAuto, date) => {
    let chosenSupplier = selectEl.value;
    const prevVal = selectEl.getAttribute('data-prev-val') || '';

    if (chosenSupplier === '__SPLIT__') {
        selectEl.value = prevVal;
        const data = getData();
        const records = getCalculatedSolarRecords(data);
        const rec = records.find(r => r.id === id);

        let targetId = id;
        let amount = rec ? (parseFloat(rec.amount) || 0) : 0;
        let currentSup = rec ? rec.supplier : prevVal;
        let type = rec ? rec.type : 'Keluar';

        if (rec && rec.parentRowId) {
            targetId = rec.parentRowId;
            amount = rec.totalOriginalAmount || (amount * 2);
        }

        window.openSplitSolarModal(targetId, isAuto, date, amount, currentSup, type);
        return;
    }

    if (chosenSupplier === '__NEW__') {
        const input = prompt('Masukkan Nama Pemasok Solar Baru:');
        if (!input || !input.trim()) { selectEl.value = prevVal; return; }
        chosenSupplier = input.trim().toUpperCase();
    }

    await saveSolarSupplierToDatabase(chosenSupplier);
    const data = getData();

    if (isAuto) {
        const baseRowId = id.replace(/__part\d+$/, '');
        if (!data.solarRowOverrides) data.solarRowOverrides = {};
        data.solarRowOverrides[baseRowId] = chosenSupplier;

        const overrideItem = { id: `row-${baseRowId}`, date: date, supplier: chosenSupplier, created_at: new Date().toISOString() };
        await saveData(data, 'solar_overrides', overrideItem);
        window.render_solar();
        showToast(`Pemasok diubah ke "${chosenSupplier}"`, 'success');
    } else {
        if (!data.solar) data.solar = [];
        const index = data.solar.findIndex(s => s.id === id);
        if (index > -1) {
            data.solar[index].supplier = chosenSupplier;
            const solarItem = {
                id: data.solar[index].id,
                date: data.solar[index].date,
                type: data.solar[index].type,
                amount: parseFloat(data.solar[index].amount) || 0,
                description: data.solar[index].description || '',
                supplier: chosenSupplier,
                created_at: data.solar[index].created_at || new Date().toISOString()
            };
            data.solar[index] = solarItem;
            await saveData(data, 'solar', solarItem);
            window.render_solar();
            showToast(`Pemasok diubah ke "${chosenSupplier}"`, 'success');
        }
    }
};

window.openSplitSolarModal = (recordId, isAuto, date, totalAmount, currentSupplier, type) => {
    const data = getData();
    const suppliers = getAllSolarSuppliers(data);
    const numTotal = parseFloat(totalAmount) || 0;
    const halfQty = Math.round((numTotal / 2) * 100) / 100;
    const sup1 = (currentSupplier || suppliers[0] || '').toUpperCase();
    const sup2 = (suppliers.find(s => s.toUpperCase() !== sup1) || suppliers[0] || sup1).toUpperCase();

    let sup1Options = '';
    let sup2Options = '';
    suppliers.forEach(s => {
        sup1Options += `<option value="${s}" ${s === sup1 ? 'selected' : ''}>${s}</option>`;
        sup2Options += `<option value="${s}" ${s === sup2 ? 'selected' : ''}>${s}</option>`;
    });

    const formHtml = `
        <form id="form-split-solar" autocomplete="off">
            <div style="background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 0.75rem 1rem; margin-bottom: 1.25rem; font-size: 0.85rem; color: #0369a1;">
                <div style="font-weight: 700; margin-bottom: 0.35rem;">Bagi Transaksi Menjadi 2 Pemasok</div>
                <span>Tanggal: <strong>${formatDate(date)}</strong> | Volume: <strong>${numTotal.toLocaleString('id-ID')} L</strong></span>
            </div>
            <div style="display: flex; gap: 0.4rem; margin-bottom: 1rem; flex-wrap: wrap;">
                <button type="button" class="btn btn-sm" onclick="applySplitPresets(0.5, ${numTotal})">50% : 50%</button>
                <button type="button" class="btn btn-sm" onclick="applySplitPresets(0.6, ${numTotal})">60% : 40%</button>
                <button type="button" class="btn btn-sm" onclick="applySplitPresets(0.7, ${numTotal})">70% : 30%</button>
            </div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem;">
                <div style="background: #fff; border: 1.5px solid #0284c7; border-radius: 8px; padding: 0.85rem;">
                    <label style="font-size: 0.75rem;">Pemasok 1</label>
                    <select id="split-sup-1" class="form-control" required>${sup1Options}</select>
                    <label style="font-size: 0.75rem; margin-top:0.5rem;">Jumlah Liter</label>
                    <input type="number" id="split-qty-1" class="form-control" step="0.01" value="${halfQty}" required oninput="onSplitQty1Change(${numTotal})">
                </div>
                <div style="background: #fff; border: 1.5px solid #10b981; border-radius: 8px; padding: 0.85rem;">
                    <label style="font-size: 0.75rem;">Pemasok 2</label>
                    <select id="split-sup-2" class="form-control" required>${sup2Options}</select>
                    <label style="font-size: 0.75rem; margin-top:0.5rem;">Jumlah Liter</label>
                    <input type="number" id="split-qty-2" class="form-control" step="0.01" value="${Math.round((numTotal - halfQty)*100)/100}" required oninput="onSplitQty2Change(${numTotal})">
                </div>
            </div>
            <div class="form-actions" style="margin-top: 1.25rem;">
                <button type="button" class="btn" onclick="closeModal()">Batal</button>
                <button type="submit" class="btn btn-primary">Simpan Pembagian</button>
            </div>
        </form>
    `;

    window.openModal('✂️ Bagi Menjadi 2 Pemasok Solar', formHtml);

    window.applySplitPresets = (ratio1, total) => {
        const q1 = Math.round(total * ratio1 * 100) / 100;
        const q2 = Math.round((total - q1) * 100) / 100;
        document.getElementById('split-qty-1').value = q1;
        document.getElementById('split-qty-2').value = q2;
    };

    window.onSplitQty1Change = (total) => {
        const v1 = parseFloat(document.getElementById('split-qty-1')?.value || 0) || 0;
        document.getElementById('split-qty-2').value = Math.max(0, Math.round((total - v1) * 100) / 100);
    };

    window.onSplitQty2Change = (total) => {
        const v2 = parseFloat(document.getElementById('split-qty-2')?.value || 0) || 0;
        document.getElementById('split-qty-1').value = Math.max(0, Math.round((total - v2) * 100) / 100);
    };

    document.getElementById('form-split-solar').addEventListener('submit', async (e) => {
        e.preventDefault();
        const chosen1 = document.getElementById('split-sup-1').value.trim().toUpperCase();
        const chosen2 = document.getElementById('split-sup-2').value.trim().toUpperCase();
        const qty1 = parseFloat(document.getElementById('split-qty-1').value) || 0;
        const qty2 = parseFloat(document.getElementById('split-qty-2').value) || 0;

        await saveSolarSupplierToDatabase(chosen1);
        await saveSolarSupplierToDatabase(chosen2);

        const curData = getData();
        if (!isAuto) {
            const index = curData.solar.findIndex(s => s.id === recordId);
            if (index > -1) {
                const orig = curData.solar[index];
                orig.supplier = chosen1;
                orig.amount = qty1;
                orig.description = (orig.description || '') + ' (Bagian 1)';
                await saveData(curData, 'solar', orig);

                const item2 = { id: generateId(), date: orig.date, type: orig.type, amount: qty2, description: (orig.description || '') + ' (Bagian 2)', supplier: chosen2, created_at: new Date().toISOString() };
                curData.solar.push(item2);
                await saveData(curData, 'solar', item2);
            }
        } else {
            const baseRowId = recordId.replace(/__part\d+$/, '');
            const splitData = { split: true, sup1: chosen1, qty1, sup2: chosen2, qty2 };
            if (!curData.solarRowOverrides) curData.solarRowOverrides = {};
            curData.solarRowOverrides[baseRowId] = splitData;
            await saveData(curData, 'solar_overrides', { id: `row-${baseRowId}`, date, supplier: JSON.stringify(splitData), created_at: new Date().toISOString() });
        }

        window.closeModal();
        window.render_solar();
        showToast('Pembagian berhasil disimpan!');
    });
};

window.openAddSolarSupplierModal = () => {
    const formHtml = `
        <form id="form-add-supplier" autocomplete="off">
            <div class="form-group"><label>Nama Pemasok Solar</label><input type="text" id="new-solar-supplier-name" class="form-control" required oninput="this.value = this.value.toUpperCase()"></div>
            <div class="form-group"><label>Stok Awal (Liter)</label><input type="number" id="new-solar-initial-stock" class="form-control" step="0.01" value="0"></div>
            <div class="form-group"><label>Tanggal Masuk</label><input type="date" id="new-solar-date" class="form-control" value="${new Date().toISOString().split('T')[0]}"></div>
            <div class="form-actions" style="margin-top:1.5rem;"><button type="button" class="btn" onclick="closeModal()">Batal</button><button type="submit" class="btn btn-primary">Simpan Pemasok</button></div>
        </form>`;
    window.openModal('Tambah Pemasok Solar', formHtml);
    document.getElementById('form-add-supplier').addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('new-solar-supplier-name').value.trim().toUpperCase();
        await saveSolarSupplierToDatabase(name);
        const stock = parseFloat(document.getElementById('new-solar-initial-stock').value) || 0;
        const date = document.getElementById('new-solar-date').value;
        if (stock > 0) {
            const curData = getData();
            if (!curData.solar) curData.solar = [];
            const item = { id: generateId(), date, supplier: name, type: 'Masuk', amount: stock, description: 'STOK AWAL PEMASOK', created_at: new Date().toISOString() };
            curData.solar.push(item);
            await saveData(curData, 'solar', item);
        }
        window.closeModal();
        window.render_solar();
        showToast(`Pemasok ${name} disimpan!`);
    });
};

window.openBulkUpdateSolarSupplierModal = () => {
    const data = getData();
    const suppliers = getAllSolarSuppliers(data);
    const today = new Date().toISOString().split('T')[0];
    const formHtml = `
        <form id="form-bulk-solar-supplier" autocomplete="off">
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:1rem;">
                <div class="form-group"><label>Tanggal Mulai</label><input type="date" id="bulk-start-date" class="form-control" value="${today}" required></div>
                <div class="form-group"><label>Tanggal Akhir</label><input type="date" id="bulk-end-date" class="form-control" value="${today}" required></div>
            </div>
            <div class="form-group"><label>Pemasok Baru</label><select id="bulk-supplier-select" class="form-control" required><option value="">-- Pilih Pemasok --</option>${suppliers.map(s=>`<option value="${s}">${s}</option>`).join('')}</select></div>
            <div class="form-actions" style="margin-top:1.5rem;"><button type="button" class="btn" onclick="closeModal()">Batal</button><button type="submit" class="btn btn-primary">Terapkan Perubahan</button></div>
        </form>`;
    window.openModal('Ubah Pemasok Rentang Tanggal', formHtml);
    document.getElementById('form-bulk-solar-supplier').addEventListener('submit', async (e) => {
        e.preventDefault();
        const sDate = document.getElementById('bulk-start-date').value;
        const eDate = document.getElementById('bulk-end-date').value;
        const chosen = document.getElementById('bulk-supplier-select').value;
        await saveSolarSupplierToDatabase(chosen);
        const curData = getData();
        let cur = new Date(sDate);
        const end = new Date(eDate);
        if (!curData.solarDateOverrides) curData.solarDateOverrides = {};
        while (cur <= end) {
            const dStr = cur.toISOString().split('T')[0];
            curData.solarDateOverrides[dStr] = chosen;
            await saveData(curData, 'solar_overrides', { id: `date-${dStr}`, date: dStr, supplier: chosen, created_at: new Date().toISOString() });
            cur.setDate(cur.getDate() + 1);
        }
        window.closeModal();
        window.render_solar();
        showToast('Pemasok berhasil diubah untuk rentang tanggal!');
    });
};

window.openAddSolarModal = () => {
    const data = getData();
    const suppliers = getAllSolarSuppliers(data);
    const def = getDefaultSolarSupplier(data);
    const formHtml = `
        <form id="form-solar" autocomplete="off">
            <div class="form-group"><label>Tanggal</label><input type="date" id="solar-date" class="form-control" value="${new Date().toISOString().split('T')[0]}" required></div>
            <div class="form-group"><label>Pemasok</label><select id="solar-supplier" class="form-control" required>${suppliers.map(s=>`<option value="${s}" ${s===def?'selected':''}>${s}</option>`).join('')}</select></div>
            <div class="form-group"><label>Jenis</label><select id="solar-type" class="form-control" required><option value="Masuk">Masuk (Beli Solar)</option><option value="Keluar">Keluar (Pemakaian Manual)</option></select></div>
            <div class="form-group"><label>Jumlah (Liter)</label><input type="number" id="solar-amount" class="form-control" step="0.01" required></div>
            <div class="form-group"><label>Keterangan</label><input type="text" id="solar-description" class="form-control" oninput="this.value = this.value.toUpperCase()"></div>
            <div class="form-actions"><button type="button" class="btn" onclick="closeModal()">Batal</button><button type="submit" class="btn btn-primary">Simpan</button></div>
        </form>`;
    window.openModal('Tambah Data Solar', formHtml);
    document.getElementById('form-solar').addEventListener('submit', (e) => { e.preventDefault(); window.saveSolar(); });
};

window.editSolar = (id) => {
    const data = getData();
    const s = data.solar.find(x => x.id === id);
    if (!s) return;
    const suppliers = getAllSolarSuppliers(data);
    const formHtml = `
        <form id="form-solar" autocomplete="off">
            <input type="hidden" id="solar-id" value="${s.id}">
            <div class="form-group"><label>Tanggal</label><input type="date" id="solar-date" class="form-control" value="${s.date}" required></div>
            <div class="form-group"><label>Pemasok</label><select id="solar-supplier" class="form-control" required>${suppliers.map(sup=>`<option value="${sup}" ${sup===(s.supplier||'').toUpperCase()?'selected':''}>${sup}</option>`).join('')}</select></div>
            <div class="form-group"><label>Jenis</label><select id="solar-type" class="form-control" required><option value="Masuk" ${s.type==='Masuk'?'selected':''}>Masuk (Beli Solar)</option><option value="Keluar" ${s.type==='Keluar'?'selected':''}>Keluar (Pemakaian Manual)</option></select></div>
            <div class="form-group"><label>Jumlah (Liter)</label><input type="number" id="solar-amount" class="form-control" step="0.01" value="${s.amount}" required></div>
            <div class="form-group"><label>Keterangan</label><input type="text" id="solar-description" class="form-control" value="${s.description||''}" oninput="this.value = this.value.toUpperCase()"></div>
            <div class="form-actions"><button type="button" class="btn" onclick="closeModal()">Batal</button><button type="submit" class="btn btn-primary">Simpan</button></div>
        </form>`;
    window.openModal('Edit Data Solar', formHtml);
    document.getElementById('form-solar').addEventListener('submit', (e) => { e.preventDefault(); window.saveSolar(); });
};

window.saveSolar = async () => {
    const id = document.getElementById('solar-id')?.value || generateId();
    const data = getData();
    if (!data.solar) data.solar = [];
    const item = {
        id,
        date: document.getElementById('solar-date').value,
        supplier: document.getElementById('solar-supplier').value,
        type: document.getElementById('solar-type').value,
        amount: parseFloat(document.getElementById('solar-amount').value) || 0,
        description: document.getElementById('solar-description').value,
        created_at: new Date().toISOString()
    };
    const idx = data.solar.findIndex(x => x.id === id);
    if (idx >= 0) data.solar[idx] = item;
    else data.solar.push(item);
    await saveData(data, 'solar', item);
    window.closeModal();
    window.render_solar();
    showToast('Data solar disimpan!');
};

window.deleteSolar = async (id) => {
    if (!confirm('Hapus data solar ini?')) return;
    const data = getData();
    data.solar = data.solar.filter(s => s.id !== id);
    saveData(data);
    await deleteFromDatabase('solar', id);
    window.render_solar();
};
