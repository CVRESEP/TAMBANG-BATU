const fs = require('fs');
let js = fs.readFileSync('script.js', 'utf-8');

// 1. Fix Header Title (exclude icons)
js = js.replace(
    'pageTitle.textContent = targetLink.textContent.trim();',
    `const linkText = Array.from(targetLink.childNodes).filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join('');\n            pageTitle.textContent = linkText || targetLink.innerText.split('\\n').pop().trim();`
);

// 2. Update renderSalesRows for mobile responsiveness
const salesRowFunc = `function renderSalesRows(data) {
    const container = document.getElementById('penjualan-rows-container');
    let html = \`
        <div class="row-item-header d-flex" style="gap:1rem; padding-bottom:0.5rem; border-bottom:1px solid #e5e7eb; margin-bottom:0.5rem; font-size:0.75rem; font-weight:600; color:#4b5563;">
            <div style="flex:2">Pembeli</div>
            <div style="flex:0.8; text-align:center">Jml Sopir</div>
            <div style="flex:1">Qty</div>
            <div style="flex:1.5">Harga Satuan</div>
            <div style="flex:2">Total Harga</div>
            <div style="width:40px"></div>
        </div>
    \`;

    let sumTotal = 0;
    penjualanRows.forEach((row) => {
        sumTotal += (row.total || 0);
        let isProyekTon = false;
        let options = '<option value="">Pilih...</option>';
        data.buyers.forEach(b => {
            options += \`<option value="\${b.id}" \${b.id === row.buyerId ? 'selected' : ''}>\${b.name} (\${b.category || 'Umum'})\${b.unit ? ' - ' + b.unit : ''}</option>\`;
            if (row.buyerId === b.id) {
                if (row.unitPrice === undefined) row.unitPrice = b.unitPrice;
                if ((b.category || '').toLowerCase() === 'proyek' && (b.unit || '').toLowerCase() === 'ton') isProyekTon = true;
            }
        });

        let driverCountHtml = isProyekTon 
            ? \`<input type="number" class="form-control" style="background:#f8fafc; border-color:#cbd5e1; text-align:center" step="1" min="1" value="\${row.driverCount || 1}" oninput="updateSalesRow('\${row.id}', 'driverCount', this.value)">\`
            : \`<input type="text" class="form-control" style="background:#e2e8f0; border-color:#cbd5e1; color:#94a3b8; text-align:center;" value="-" readonly>\`;

        html += \`
            <div class="row-item" data-id="\${row.id}">
                <div style="flex:2">
                    <label class="mobile-label">Pembeli</label>
                    <select class="form-control sales-buyer" style="background:#f8fafc; border-color:#cbd5e1;" onchange="updateSalesRow('\${row.id}', 'buyerId', this.value)">
                        \${options}
                    </select>
                </div>
                <div class="d-flex" style="gap:0.5rem; flex:1.8">
                    <div style="flex:0.8">
                        <label class="mobile-label">Jml Sopir</label>
                        \${driverCountHtml}
                    </div>
                    <div style="flex:1">
                        <label class="mobile-label">Quantity</label>
                        <input type="number" class="form-control" style="background:#f8fafc; border-color:#cbd5e1;" step="0.01" min="0" value="\${row.qty}" oninput="updateSalesRow('\${row.id}', 'qty', this.value)">
                    </div>
                </div>
                <div class="d-flex" style="gap:0.5rem; flex:3.5">
                    <div style="flex:1.5">
                        <label class="mobile-label">Harga Satuan</label>
                        <input type="text" class="form-control" style="background:#f8fafc; border-color:#cbd5e1;" value="\${row.unitPrice ? formatCurrency(row.unitPrice) : 'Rp 0'}" readonly>
                    </div>
                    <div style="flex:2">
                        <label class="mobile-label">Total Harga</label>
                        <input type="text" class="form-control" style="background:#eef2ff; border-color:#c7d2fe; color:#4338ca; font-weight:600;" value="\${formatCurrency(row.total)}" readonly>
                    </div>
                </div>
                <div class="d-flex align-center" style="gap:0.5rem; width:100%; margin-top:0.25rem">
                    <button type="button" class="btn" style="background:var(--secondary-color); color:white; padding:0.5rem; flex:1; font-size:0.85rem;" onclick="openSetoranDetail('\${row.id}')">
                        <span class="material-symbols-outlined" style="font-size:1.1rem; vertical-align:middle">payments</span> Atur Setoran
                    </button>
                    <button type="button" class="btn btn-danger" style="padding:0.5rem; width:40px" onclick="removeSalesRow('\${row.id}')">
                        <span class="material-symbols-outlined">delete</span>
                    </button>
                </div>
            </div>
        \`;
    });

    html += \`
        <div class="d-flex align-center justify-between" style="margin-top:1rem; padding-top:1rem; border-top:2px solid #e2e8f0;">
            <div style="font-weight:700; color:#1e293b; font-size:1rem;">Total Pembelian:</div>
            <div style="font-weight:800; font-size:1.2rem; color:var(--primary-color);">\${formatCurrency(sumTotal)}</div>
        </div>
    \`;

    container.innerHTML = html;
    if (window.updateNetProfitSummary) window.updateNetProfitSummary();
}`;

// Replace renderSalesRows
const oldRenderSales = /function renderSalesRows\(data\) \{[\s\S]*?container\.innerHTML = html;[\s\S]*?if \(window\.updateNetProfitSummary\) window\.updateNetProfitSummary\(\);[\s\S]*?\}/;
js = js.replace(oldRenderSales, salesRowFunc);

// Also update renderOpsRows for consistency
const opsRowFunc = `function renderOpsRows(data) {
    const container = document.getElementById('ops-rows-container');
    let html = \`
        <div class="row-item-header d-flex" style="gap:1rem; padding-bottom:0.5rem; border-bottom:1px solid #e5e7eb; margin-bottom:0.5rem; font-size:0.75rem; font-weight:600; color:#4b5563;">
            <div style="flex:2">Jenis Pengeluaran</div>
            <div style="flex:1">Qty</div>
            <div style="flex:1.5">Harga Satuan</div>
            <div style="flex:2">Total Harga</div>
            <div style="width:40px"></div>
        </div>
    \`;

    opsExpenseRows.forEach((row) => {
        html += \`
            <div class="row-item" data-id="\${row.id}">
                <div style="flex:2">
                    <label class="mobile-label">Jenis Pengeluaran</label>
                    <input type="text" class="form-control" style="background:#f8fafc; border-color:#cbd5e1;" value="\${row.name}" oninput="updateOpsRow('\${row.id}', 'name', this.value)">
                </div>
                <div class="d-flex" style="gap:0.5rem; flex:4.5">
                    <div style="flex:1">
                        <label class="mobile-label">Qty</label>
                        <input type="number" class="form-control" style="background:#f8fafc; border-color:#cbd5e1;" step="0.01" min="0" value="\${row.qty}" oninput="updateOpsRow('\${row.id}', 'qty', this.value)">
                    </div>
                    <div style="flex:1.5">
                        <label class="mobile-label">Harga</label>
                        <input type="number" class="form-control" style="background:#f8fafc; border-color:#cbd5e1;" step="1" min="0" value="\${row.basePrice}" oninput="updateOpsRow('\${row.id}', 'basePrice', this.value)">
                    </div>
                    <div style="flex:2">
                        <label class="mobile-label">Total</label>
                        <input type="text" class="form-control" style="background:#f1f5f9; border-color:#cbd5e1; font-weight:600;" value="\${formatCurrency(row.total)}" readonly>
                    </div>
                    <div style="width:40px; align-self:flex-end">
                        <button type="button" class="btn-icon text-danger" onclick="removeOpsRow('\${row.id}')">
                            <span class="material-symbols-outlined">delete</span>
                        </button>
                    </div>
                </div>
            </div>
        \`;
    });
    container.innerHTML = html;
    if (window.updateNetProfitSummary) window.updateNetProfitSummary();
}`;

const oldRenderOps = /function renderOpsRows\(data\) \{[\s\S]*?container\.innerHTML = html;[\s\S]*?if \(window\.updateNetProfitSummary\) window\.updateNetProfitSummary\(\);[\s\S]*?\}/;
js = js.replace(oldRenderOps, opsRowFunc);

fs.writeFileSync('script.js', js);
console.log('Fixed header icons and made form rows responsive.');
