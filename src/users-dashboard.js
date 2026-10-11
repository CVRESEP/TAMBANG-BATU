// ============================================================
// src/users-dashboard.js — Dashboard & Manajemen Pengguna (Users)
// ============================================================
import { getData, saveData, deleteFromDatabase, generateId, formatCurrency, formatDate } from './core.js';

let currentEditId = null;

// ---- DASHBOARD ----
window.render_dashboard = () => {
    const data = getData();
    const statBuyers = document.getElementById('stat-buyers');
    const statDrivers = document.getElementById('stat-drivers');
    const statSales = document.getElementById('stat-sales');
    const statExpense = document.getElementById('stat-expense');
    
    if (statBuyers) statBuyers.textContent = data.buyers.length;
    if (statDrivers) statDrivers.textContent = data.drivers.length;
    const totalSales = data.transactions.reduce((sum, tr) => sum + tr.totalAmount, 0);
    const totalExpense = data.transactions.reduce((sum, tr) => sum + (tr.operationalExpense || 0) + (tr.retributionExpense || 0), 0);
    if (statSales) statSales.textContent = formatCurrency(totalSales);
    if (statExpense) statExpense.textContent = formatCurrency(totalExpense);

    const tbody = document.getElementById('tbody-recent');
    if (!tbody) return;
    tbody.innerHTML = '';
    if (data.transactions.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Belum ada transaksi</td></tr>';
        return;
    }
    const recentTx = [...data.transactions].reverse().slice(0, 5);
    recentTx.forEach(tx => {
        const buyer = data.buyers.find(b => b.id === tx.buyerId);
        const driver = data.drivers.find(d => d.id === tx.driverId);
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${formatDate(tx.date)}</td><td>${buyer ? buyer.name : '-'}</td><td>${driver ? driver.name : '-'}</td><td>${formatCurrency(tx.totalAmount)}</td><td><span class="badge ${tx.status === 'Lunas' ? 'success' : 'warning'}">${tx.status || 'Belum Lunas'}</span></td>`;
        tbody.appendChild(tr);
    });
};

// ---- USERS ----
window.render_users = () => {
    const data = getData();
    const tbody = document.getElementById('users-table-body');
    if (!tbody) return;
    if (!data.profiles || data.profiles.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Belum ada akun terdaftar</td></tr>';
        return;
    }
    tbody.innerHTML = data.profiles.map(p => `
        <tr>
            <td>
                <div class="d-flex align-center" style="gap:0.75rem">
                    <div style="width:32px;height:32px;background:var(--primary-color);color:white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:0.8rem">
                        ${p.fullName ? p.fullName.charAt(0).toUpperCase() : '?'}
                    </div>
                    <div>
                        <div style="font-weight:600">${p.fullName || 'No Name'}</div>
                        <div style="font-size:0.75rem;color:#64748b">${p.email || '-'}</div>
                    </div>
                </div>
            </td>
            <td><span class="badge" style="background:${p.role==='Admin'?'#f0fdf4':'#f8fafc'};color:${p.role==='Admin'?'#166534':'#64748b'};border:1px solid ${p.role==='Admin'?'#bbf7d0':'#e2e8f0'}">${p.role||'User'}</span></td>
            <td>${p.created_at ? formatDate(p.created_at.split('T')[0]) : '-'}</td>
            <td>
                <div class="d-flex" style="gap:0.5rem">
                    <button class="btn-icon" style="color:var(--primary-color)" onclick="editUser('${p.id}')"><span class="material-symbols-outlined">edit</span></button>
                    <button class="btn-icon" style="color:var(--danger)" onclick="deleteFromDatabase('profiles','${p.id}');let d=getData();d.profiles=d.profiles.filter(x=>x.id!=='${p.id}');saveData(d);render_users();"><span class="material-symbols-outlined">delete</span></button>
                </div>
            </td>
        </tr>
    `).join('');
};

window.openAddUserModal = () => {
    currentEditId = null;
    const formHtml = `
        <form id="form-user" autocomplete="off">
            <div class="form-group"><label>Nama Lengkap</label><input type="text" id="user-fullname" class="form-control" required></div>
            <div class="form-group"><label>Email / Username</label><input type="text" id="user-email" class="form-control" required></div>
            <div class="form-group"><label>Password</label><input type="password" id="user-password" class="form-control" placeholder="Isi password baru..." required></div>
            <div class="form-group"><label>Role</label>
                <select id="user-role" class="form-control">
                    <option value="Admin">Admin</option>
                    <option value="User">User (Read Only)</option>
                </select>
            </div>
            <div class="form-actions">
                <button type="button" class="btn" onclick="closeModal()">Batal</button>
                <button type="submit" class="btn btn-primary">Simpan Akun</button>
            </div>
        </form>`;
    window.openModal('Tambah Akun Baru', formHtml);
    document.getElementById('form-user').onsubmit = (e) => { e.preventDefault(); saveUser(); };
};

window.editUser = (id) => {
    currentEditId = id;
    const p = getData().profiles.find(x => x.id === id);
    if (!p) return;
    const formHtml = `
        <form id="form-user" autocomplete="off">
            <div class="form-group"><label>Nama Lengkap</label><input type="text" id="user-fullname" class="form-control" value="${p.fullName||''}" required></div>
            <div class="form-group"><label>Email / Username</label><input type="text" id="user-email" class="form-control" value="${p.email||''}" required></div>
            <div class="form-group"><label>Password</label><input type="password" id="user-password" class="form-control" placeholder="Kosongkan jika tidak ingin ganti"></div>
            <div class="form-group"><label>Role</label>
                <select id="user-role" class="form-control">
                    <option value="Admin" ${p.role==='Admin'?'selected':''}>Admin</option>
                    <option value="User" ${p.role==='User'?'selected':''}>User (Read Only)</option>
                </select>
            </div>
            <div class="form-actions">
                <button type="button" class="btn" onclick="closeModal()">Batal</button>
                <button type="submit" class="btn btn-primary">Perbarui Akun</button>
            </div>
        </form>`;
    window.openModal('Edit Akun', formHtml);
    document.getElementById('form-user').onsubmit = (e) => { e.preventDefault(); saveUser(id); };
};

export function saveUser(id = null) {
    const fullName = document.getElementById('user-fullname').value;
    const email = document.getElementById('user-email').value;
    const password = document.getElementById('user-password').value;
    const role = document.getElementById('user-role').value;
    const data = getData();
    if (!data.profiles) data.profiles = [];
    let item;
    if (id) {
        const idx = data.profiles.findIndex(p => p.id === id);
        if (idx > -1) {
            const updated = { ...data.profiles[idx], fullName, email, role };
            if (password) updated.password = password;
            data.profiles[idx] = updated;
            item = data.profiles[idx];
        }
    } else {
        item = { id: generateId(), fullName, email, password, role, created_at: new Date().toISOString() };
        data.profiles.push(item);
    }
    saveData(data, 'profiles', { id: item.id, full_name: item.fullName, email: item.email, password: item.password, role: item.role, created_at: item.created_at });
    window.closeModal();
    window.render_users();
}
window.saveUser = saveUser;
