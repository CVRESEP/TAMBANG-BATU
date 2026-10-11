// ============================================================
// src/master-data.js — Pembeli, Sopir, Jenis Pengeluaran
// ============================================================
import { getData, saveData, deleteFromDatabase, generateId, formatCurrency, formatDate } from './core.js';

let currentEditId = null;

// ---- PEMBELI ----
window.render_pembeli = () => {
    const data = getData();
    const tbody = document.getElementById('tbody-pembeli');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (data.buyers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">Belum ada data pembeli</td></tr>';
        return;
    }
    data.buyers.forEach(buyer => {
        const tr = document.createElement('tr');
        const badgeColor = buyer.category === 'Proyek' ? 'var(--success)' : 'var(--primary-color)';
        const badgeBg = buyer.category === 'Proyek' ? 'rgba(16,185,129,0.1)' : 'rgba(79,70,229,0.1)';
        tr.innerHTML = `
            <td><input type="checkbox" class="check-pembeli" data-id="${buyer.id}"></td>
            <td><strong>${buyer.name}</strong></td>
            <td><span style="display:inline-block;padding:0.25rem 0.5rem;border-radius:1rem;font-size:0.75rem;background:${badgeBg};color:${badgeColor};font-weight:600">${buyer.category||'Umum'}</span></td>
            <td>${buyer.address}</td>
            <td>${buyer.unit}</td>
            <td>${formatCurrency(buyer.unitPrice)}</td>
            <td>
                <div class="d-flex" style="gap:0.5rem">
                    <button class="btn-icon" style="color:var(--primary-color)" onclick="editPembeli('${buyer.id}')"><span class="material-symbols-outlined">edit</span></button>
                    <button class="btn-icon" style="color:var(--danger)" onclick="deletePembeli('${buyer.id}')"><span class="material-symbols-outlined">delete</span></button>
                </div>
            </td>`;
        tbody.appendChild(tr);
    });
};

document.getElementById('btn-add-pembeli')?.addEventListener('click', () => {
    currentEditId = null;
    const formHtml = `
        <form id="form-pembeli" autocomplete="off">
            <div class="form-group"><label>Nama Pembeli</label><input type="text" id="pembeli-name" class="form-control" required></div>
            <div class="form-group"><label>Kategori</label>
                <select id="pembeli-category" class="form-control" required>
                    <option value="Umum">Umum</option><option value="Proyek">Proyek</option>
                </select>
            </div>
            <div class="form-group"><label>Alamat</label><input type="text" id="pembeli-address" class="form-control" required></div>
            <div class="form-group"><label>Satuan</label>
                <select id="pembeli-unit" class="form-control" required>
                    <option value="Ton">Ton</option><option value="Retase">Retase</option><option value="M3">M3</option>
                </select>
            </div>
            <div class="form-group"><label>Harga Satuan (Rp)</label><input type="number" id="pembeli-price" class="form-control" required></div>
            <div class="form-actions">
                <button type="button" class="btn" onclick="closeModal()">Batal</button>
                <button type="submit" class="btn btn-primary">Simpan</button>
            </div>
        </form>`;
    window.openModal('Tambah Pembeli', formHtml);
    document.getElementById('form-pembeli').addEventListener('submit', (e) => { e.preventDefault(); savePembeli(); });
});

window.editPembeli = (id) => {
    currentEditId = id;
    const buyer = getData().buyers.find(b => b.id === id);
    if (!buyer) return;
    const formHtml = `
        <form id="form-pembeli" autocomplete="off">
            <div class="form-group"><label>Nama Pembeli</label><input type="text" id="pembeli-name" class="form-control" value="${buyer.name}" required></div>
            <div class="form-group"><label>Kategori</label>
                <select id="pembeli-category" class="form-control" required>
                    <option value="Umum" ${buyer.category!=='Proyek'?'selected':''}>Umum</option>
                    <option value="Proyek" ${buyer.category==='Proyek'?'selected':''}>Proyek</option>
                </select>
            </div>
            <div class="form-group"><label>Alamat</label><input type="text" id="pembeli-address" class="form-control" value="${buyer.address}" required></div>
            <div class="form-group"><label>Satuan</label>
                <select id="pembeli-unit" class="form-control" required>
                    <option value="Ton" ${buyer.unit==='Ton'?'selected':''}>Ton</option>
                    <option value="Retase" ${buyer.unit==='Retase'?'selected':''}>Retase</option>
                    <option value="M3" ${buyer.unit==='M3'?'selected':''}>M3</option>
                </select>
            </div>
            <div class="form-group"><label>Harga Satuan (Rp)</label><input type="number" id="pembeli-price" class="form-control" value="${buyer.unitPrice}" required></div>
            <div class="form-actions">
                <button type="button" class="btn" onclick="closeModal()">Batal</button>
                <button type="submit" class="btn btn-primary">Simpan Perubahan</button>
            </div>
        </form>`;
    window.openModal('Edit Pembeli', formHtml);
    document.getElementById('form-pembeli').addEventListener('submit', (e) => { e.preventDefault(); savePembeli(); });
};

export function savePembeli() {
    const name = document.getElementById('pembeli-name').value;
    const category = document.getElementById('pembeli-category').value;
    const address = document.getElementById('pembeli-address').value;
    const unit = document.getElementById('pembeli-unit').value;
    const unitPrice = parseFloat(document.getElementById('pembeli-price').value);
    const data = getData();
    let item;
    if (currentEditId) {
        const idx = data.buyers.findIndex(b => b.id === currentEditId);
        if (idx > -1) { data.buyers[idx] = { ...data.buyers[idx], name, category, address, unit, unitPrice }; item = data.buyers[idx]; }
    } else {
        item = { id: generateId(), name, category, address, unit, unitPrice };
        data.buyers.push(item);
    }
    saveData(data, 'buyers', { id: item.id, name: item.name, category: item.category, address: item.address, unit: item.unit, unitprice: item.unitPrice });
    window.closeModal();
    window.render_pembeli();
}
window.savePembeli = savePembeli;

window.deletePembeli = (id) => {
    if (confirm('Apakah Anda yakin ingin menghapus pembeli ini?')) {
        const data = getData();
        data.buyers = data.buyers.filter(b => b.id !== id);
        saveData(data);
        deleteFromDatabase('buyers', id);
        window.render_pembeli();
    }
};

// ---- SOPIR ----
window.render_sopir = () => {
    const data = getData();
    const tbody = document.getElementById('tbody-sopir');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (data.drivers.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Belum ada data sopir</td></tr>';
        return;
    }
    data.drivers.forEach(driver => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><input type="checkbox" class="check-sopir" data-id="${driver.id}"></td>
            <td><strong>${driver.name}</strong></td>
            <td><span class="badge" style="background:#f3f4f6;color:#111827;padding:0.2rem 0.6rem;border-radius:0.5rem;border:1px solid #e5e7eb;">${driver.vehicleNumber}</span></td>
            <td>${driver.phone}</td>
            <td>
                <div class="d-flex" style="gap:0.5rem">
                    <button class="btn-icon" style="color:var(--primary-color)" onclick="editSopir('${driver.id}')"><span class="material-symbols-outlined">edit</span></button>
                    <button class="btn-icon" style="color:var(--danger)" onclick="deleteSopir('${driver.id}')"><span class="material-symbols-outlined">delete</span></button>
                </div>
            </td>`;
        tbody.appendChild(tr);
    });
};

document.getElementById('btn-add-sopir')?.addEventListener('click', () => {
    currentEditId = null;
    const formHtml = `
        <form id="form-sopir" autocomplete="off">
            <div class="form-group"><label>Nama Sopir</label><input type="text" id="sopir-name" class="form-control" required></div>
            <div class="form-group"><label>No. Polisi Kendaraan</label><input type="text" id="sopir-vehicle" class="form-control" required placeholder="Contoh: BE 1234 ABC"></div>
            <div class="form-group"><label>No. WhatsApp / HP</label><input type="text" id="sopir-phone" class="form-control" required></div>
            <div class="form-actions">
                <button type="button" class="btn" onclick="closeModal()">Batal</button>
                <button type="submit" class="btn btn-primary">Simpan</button>
            </div>
        </form>`;
    window.openModal('Tambah Sopir', formHtml);
    document.getElementById('form-sopir').addEventListener('submit', (e) => { e.preventDefault(); saveSopir(); });
});

window.editSopir = (id) => {
    currentEditId = id;
    const driver = getData().drivers.find(d => d.id === id);
    if (!driver) return;
    const formHtml = `
        <form id="form-sopir" autocomplete="off">
            <div class="form-group"><label>Nama Sopir</label><input type="text" id="sopir-name" class="form-control" value="${driver.name}" required></div>
            <div class="form-group"><label>No. Polisi Kendaraan</label><input type="text" id="sopir-vehicle" class="form-control" value="${driver.vehicleNumber}" required></div>
            <div class="form-group"><label>No. WhatsApp / HP</label><input type="text" id="sopir-phone" class="form-control" value="${driver.phone}" required></div>
            <div class="form-actions">
                <button type="button" class="btn" onclick="closeModal()">Batal</button>
                <button type="submit" class="btn btn-primary">Simpan Perubahan</button>
            </div>
        </form>`;
    window.openModal('Edit Sopir', formHtml);
    document.getElementById('form-sopir').addEventListener('submit', (e) => { e.preventDefault(); saveSopir(); });
};

export function saveSopir() {
    const name = document.getElementById('sopir-name').value;
    const vehicleNumber = document.getElementById('sopir-vehicle').value;
    const phone = document.getElementById('sopir-phone').value;
    const data = getData();
    let item;
    if (currentEditId) {
        const idx = data.drivers.findIndex(d => d.id === currentEditId);
        if (idx > -1) { data.drivers[idx] = { ...data.drivers[idx], name, vehicleNumber, phone }; item = data.drivers[idx]; }
    } else {
        item = { id: generateId(), name, vehicleNumber, phone };
        data.drivers.push(item);
    }
    saveData(data, 'drivers', { id: item.id, name: item.name, vehiclenumber: item.vehicleNumber, phone: item.phone });
    window.closeModal();
    window.render_sopir();
}
window.saveSopir = saveSopir;

window.deleteSopir = (id) => {
    if (confirm('Apakah Anda yakin ingin menghapus sopir ini?')) {
        const data = getData();
        data.drivers = data.drivers.filter(d => d.id !== id);
        saveData(data);
        deleteFromDatabase('drivers', id);
        window.render_sopir();
    }
};

// ---- PENGELUARAN ----
window.render_pengeluaran = () => {
    const data = getData();
    const tbody = document.getElementById('tbody-pengeluaran');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (data.expenseTypes.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted">Belum ada jenis pengeluaran</td></tr>';
        return;
    }
    const solarSupplierList = window.getDistinctSuppliers ? window.getDistinctSuppliers() : [];

    const sortedExpenses = [...data.expenseTypes].sort((a, b) => {
        if (a.category !== b.category) return a.category.localeCompare(b.category);
        return (a.order || 0) - (b.order || 0);
    });

    sortedExpenses.forEach(exp => {
        const tr = document.createElement('tr');
        const badgeClass = exp.category === 'Operasional' ? 'danger' : 'warning';
        tr.innerHTML = `
            <td><input type="checkbox" class="check-pengeluaran" data-id="${exp.id}"></td>
            <td><strong>${exp.name}</strong></td>
            <td><span class="badge ${badgeClass}">${exp.category}</span></td>
            <td>${exp.nature || 'Tidak Pasti'}</td>
            <td>${exp.unit || '-'}</td>
            <td>${formatCurrency(exp.basePrice || 0)}</td>
            <td>
                <select class="form-control form-control-sm" style="font-size:0.75rem;padding:0.2rem" onchange="updatePengeluaranLinkedBuyer('${exp.id}', this.value)">
                    <option value="">- Tidak -</option>
                    ${getData().buyers.map(b => `<option value="${b.id}" ${b.id === exp.linkedBuyerId ? 'selected' : ''}>${b.name}</option>`).join('')}
                </select>
            </td>
            <td>
                <select class="form-control form-control-sm" style="font-size:0.75rem;padding:0.2rem;min-width:110px;" onchange="updatePengeluaranLinkedSupplier('${exp.id}', this.value)">
                    <option value="">- Tidak -</option>
                    ${solarSupplierList.map(sup => `<option value="${sup}" ${sup === (exp.linkedSolarSupplier || '').toUpperCase() ? 'selected' : ''}>${sup}</option>`).join('')}
                    <option value="__NEW__">+ Tambah Pemasok...</option>
                </select>
            </td>
            <td>
                <div class="d-flex" style="gap:0.5rem">
                    <button class="btn-icon" style="color:var(--primary-color)" onclick="editPengeluaran('${exp.id}')"><span class="material-symbols-outlined">edit</span></button>
                    <button class="btn-icon" style="color:var(--danger)" onclick="deletePengeluaran('${exp.id}')"><span class="material-symbols-outlined">delete</span></button>
                </div>
            </td>`;
        tbody.appendChild(tr);
    });
};

document.getElementById('btn-add-pengeluaran')?.addEventListener('click', () => {
    currentEditId = null;
    const data = getData();
    const maxOrder = data.expenseTypes.length > 0 ? Math.max(...data.expenseTypes.map(e => parseInt(e.order) || 0)) : 0;
    const formHtml = `
        <form id="form-pengeluaran" autocomplete="off">
            <div class="form-group"><label>Nama Pengeluaran</label><input type="text" id="pengeluaran-name" class="form-control" oninput="this.value=this.value.toUpperCase()" required></div>
            <div class="form-group"><label>Kategori</label>
                <select id="pengeluaran-category" class="form-control" required>
                    <option value="Operasional">Operasional</option><option value="Retribusi">Retribusi</option>
                </select>
            </div>
            <div class="form-group"><label>Sifat Pengeluaran</label>
                <select id="pengeluaran-nature" class="form-control" required>
                    <option value="Pasti">Pasti (Tetap)</option><option value="Tidak Pasti">Tidak Pasti (Opsional)</option>
                </select>
            </div>
            <div class="form-group"><label>Satuan (Ritase, Liter, dll)</label><input type="text" id="pengeluaran-unit" class="form-control" oninput="this.value=this.value.toUpperCase()" required></div>
            <div class="form-group"><label>Harga Satuan / Patokan (Rp)</label><input type="number" id="pengeluaran-price" class="form-control" required value="0"></div>
            <div class="form-group"><label>No Urut (Tampilan di Form Penjualan)</label><input type="number" id="pengeluaran-order" class="form-control" value="${maxOrder + 1}"></div>
            <div class="form-actions">
                <button type="button" class="btn" onclick="closeModal()">Batal</button>
                <button type="submit" class="btn btn-primary">Simpan</button>
            </div>
        </form>`;
    window.openModal('Tambah Jenis Pengeluaran', formHtml);
    document.getElementById('form-pengeluaran').addEventListener('submit', (e) => { e.preventDefault(); savePengeluaran(); });
});

window.editPengeluaran = (id) => {
    currentEditId = id;
    const exp = getData().expenseTypes.find(e => e.id === id);
    if (!exp) return;
    const formHtml = `
        <form id="form-pengeluaran" autocomplete="off">
            <div class="form-group"><label>Nama Pengeluaran</label><input type="text" id="pengeluaran-name" class="form-control" value="${exp.name}" oninput="this.value=this.value.toUpperCase()" required></div>
            <div class="form-group"><label>Kategori</label>
                <select id="pengeluaran-category" class="form-control" required>
                    <option value="Operasional" ${exp.category==='Operasional'?'selected':''}>Operasional</option>
                    <option value="Retribusi" ${exp.category==='Retribusi'?'selected':''}>Retribusi</option>
                </select>
            </div>
            <div class="form-group"><label>Sifat Pengeluaran</label>
                <select id="pengeluaran-nature" class="form-control" required>
                    <option value="Pasti" ${exp.nature==='Pasti'?'selected':''}>Pasti (Tetap)</option>
                    <option value="Tidak Pasti" ${exp.nature==='Tidak Pasti'?'selected':''}>Tidak Pasti (Opsional)</option>
                </select>
            </div>
            <div class="form-group"><label>Satuan</label><input type="text" id="pengeluaran-unit" class="form-control" value="${exp.unit||''}" oninput="this.value=this.value.toUpperCase()" required></div>
            <div class="form-group"><label>Harga Satuan (Rp)</label><input type="number" id="pengeluaran-price" class="form-control" value="${exp.basePrice||0}" required></div>
            <div class="form-group"><label>No Urut</label><input type="number" id="pengeluaran-order" class="form-control" value="${exp.order||0}"></div>
            <div class="form-actions">
                <button type="button" class="btn" onclick="closeModal()">Batal</button>
                <button type="submit" class="btn btn-primary">Simpan Perubahan</button>
            </div>
        </form>`;
    window.openModal('Edit Jenis Pengeluaran', formHtml);
    document.getElementById('form-pengeluaran').addEventListener('submit', (e) => { e.preventDefault(); savePengeluaran(); });
};

export function savePengeluaran() {
    const name = document.getElementById('pengeluaran-name').value.toUpperCase();
    const category = document.getElementById('pengeluaran-category').value;
    const nature = document.getElementById('pengeluaran-nature').value;
    const unit = document.getElementById('pengeluaran-unit').value.toUpperCase();
    const basePrice = parseFloat(document.getElementById('pengeluaran-price').value) || 0;
    const order = parseInt(document.getElementById('pengeluaran-order').value) || 0;
    const data = getData();
    let item;
    let oldLinkedBuyerId = null;
    let oldLinkedSolarSupplier = null;
    if (currentEditId) {
        const oldExp = data.expenseTypes.find(e => e.id === currentEditId);
        if (oldExp) { oldLinkedBuyerId = oldExp.linkedBuyerId || null; oldLinkedSolarSupplier = oldExp.linkedSolarSupplier || null; }
        const idx = data.expenseTypes.findIndex(e => e.id === currentEditId);
        if (idx > -1) {
            data.expenseTypes[idx] = { ...data.expenseTypes[idx], name, category, nature, unit, basePrice, order, linkedBuyerId: oldLinkedBuyerId, linkedSolarSupplier: oldLinkedSolarSupplier };
            item = data.expenseTypes[idx];
        }
    } else {
        item = { id: generateId(), name, category, nature, unit, basePrice, order, linkedBuyerId: null, linkedSolarSupplier: null };
        data.expenseTypes.push(item);
    }
    saveData(data, 'expense_types', { id: item.id, name: item.name, category: item.category, nature: item.nature, unit: item.unit, baseprice: item.basePrice, sort_order: item.order, linked_buyer_id: item.linkedBuyerId, linked_solar_supplier: item.linkedSolarSupplier });
    window.closeModal();
    window.render_pengeluaran();
}
window.savePengeluaran = savePengeluaran;

window.deletePengeluaran = (id) => {
    if (confirm('Apakah Anda yakin ingin menghapus jenis pengeluaran ini?')) {
        const data = getData();
        data.expenseTypes = data.expenseTypes.filter(e => e.id !== id);
        saveData(data);
        deleteFromDatabase('expense_types', id);
        window.render_pengeluaran();
    }
};

window.updatePengeluaranLinkedBuyer = (id, buyerId) => {
    const data = getData();
    const exp = data.expenseTypes.find(e => e.id === id);
    if (exp) {
        exp.linkedBuyerId = buyerId || null;
        saveData(data, 'expense_types', { id: exp.id, name: exp.name, category: exp.category, nature: exp.nature, unit: exp.unit, baseprice: exp.basePrice, sort_order: exp.order, linked_buyer_id: buyerId || null, linked_solar_supplier: exp.linkedSolarSupplier });
    }
};

window.updatePengeluaranLinkedSupplier = async (id, supplierVal) => {
    if (supplierVal === '__NEW__') {
        const input = prompt('Masukkan Nama Pemasok Solar Baru:');
        if (!input || !input.trim()) { window.render_pengeluaran(); return; }
        supplierVal = input.trim().toUpperCase();
    }
    const data = getData();
    const exp = data.expenseTypes.find(e => e.id === id);
    if (exp) {
        exp.linkedSolarSupplier = supplierVal || null;
        await saveData(data, 'expense_types', { id: exp.id, name: exp.name, category: exp.category, nature: exp.nature, unit: exp.unit, baseprice: exp.basePrice, sort_order: exp.order, linked_buyer_id: exp.linkedBuyerId, linked_solar_supplier: supplierVal || null });
    }
    window.render_pengeluaran();
};

export { currentEditId };
