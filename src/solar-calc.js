// ============================================================
// src/solar-calc.js — FIFO Solar Calculation Engine
// ============================================================
import { getData } from './core.js';

export function getAllSolarSuppliers(data) {
    const supSet = new Set();
    (data.solarSuppliers || []).forEach(s => {
        const name = typeof s === 'string' ? s : s.name;
        if (name && name.trim()) supSet.add(name.trim().toUpperCase());
    });
    (data.solar || []).forEach(s => {
        if (s.supplier && s.supplier.trim()) supSet.add(s.supplier.trim().toUpperCase());
    });
    (data.expenseTypes || []).forEach(e => {
        if (e.linkedSolarSupplier && e.linkedSolarSupplier.trim()) {
            supSet.add(e.linkedSolarSupplier.trim().toUpperCase());
        }
    });
    if (data.solarRowOverrides) {
        Object.values(data.solarRowOverrides).forEach(sup => {
            if (typeof sup === 'string' && sup.trim()) {
                supSet.add(sup.trim().toUpperCase());
            } else if (sup && typeof sup === 'object') {
                if (sup.sup1 && typeof sup.sup1 === 'string' && sup.sup1.trim()) supSet.add(sup.sup1.trim().toUpperCase());
                if (sup.sup2 && typeof sup.sup2 === 'string' && sup.sup2.trim()) supSet.add(sup.sup2.trim().toUpperCase());
            }
        });
    }
    if (data.solarDateOverrides) {
        Object.values(data.solarDateOverrides).forEach(sup => {
            if (typeof sup === 'string' && sup.trim()) {
                supSet.add(sup.trim().toUpperCase());
            } else if (sup && typeof sup === 'object') {
                if (sup.sup1 && typeof sup.sup1 === 'string' && sup.sup1.trim()) supSet.add(sup.sup1.trim().toUpperCase());
                if (sup.sup2 && typeof sup.sup2 === 'string' && sup.sup2.trim()) supSet.add(sup.sup2.trim().toUpperCase());
            }
        });
    }
    return Array.from(supSet).sort();
}

export function getDefaultSolarSupplier(data) {
    const solarExps = (data.expenseTypes || []).filter(e => e.linkedSolarSupplier && e.linkedSolarSupplier.trim());
    if (solarExps.length > 0) {
        return solarExps[0].linkedSolarSupplier.trim().toUpperCase();
    }
    const allSuppliers = getAllSolarSuppliers(data);
    return allSuppliers.length > 0 ? allSuppliers[0] : '';
}

export function getPertaminaDexSupplier(data) {
    const suppliers = getAllSolarSuppliers(data);
    const dex = suppliers.find(s => s.toUpperCase().includes('PERTAMINA DEX') || s.toUpperCase().includes('DEX'));
    if (dex) return dex;
    return 'PERTAMINA DEX';
}

export function getCalculatedSolarRecords(data) {
    const expenseMap = {};
    (data.expenseTypes || []).forEach(e => {
        expenseMap[e.id] = e;
    });

    const pertaminaDexSup = getPertaminaDexSupplier(data);

    // 1. Separate Masuk Batches (sorted chronologically)
    const masukBatches = (data.solar || [])
        .filter(s => s.type === 'Masuk')
        .map(s => ({
            id: s.id,
            date: s.date,
            supplier: (s.supplier || 'LAINNYA').toUpperCase().trim(),
            type: 'Masuk',
            amount: parseFloat(s.amount) || 0,
            remaining: parseFloat(s.amount) || 0,
            description: s.description || '',
            isAuto: false,
            created_at: s.created_at || s.date
        }));

    masukBatches.sort((a, b) => new Date(a.date) - new Date(b.date) || (a.created_at > b.created_at ? 1 : -1));

    // 2. Separate Manual Keluar
    const manualKeluar = (data.solar || [])
        .filter(s => s.type === 'Keluar')
        .map(s => ({
            id: s.id,
            date: s.date,
            supplier: (s.supplier || 'LAINNYA').toUpperCase().trim(),
            type: 'Keluar',
            amount: parseFloat(s.amount) || 0,
            description: s.description || '',
            isAuto: false,
            created_at: s.created_at || s.date
        }));

    // 3. Extract daily automatic usage from transactions
    const dailyUsages = {};
    (data.transactions || []).forEach(tx => {
        if (!tx.expenseDetails) return;
        const date = tx.date;
        let txDetails = typeof tx.expenseDetails === 'string' ? JSON.parse(tx.expenseDetails) : tx.expenseDetails;
        if (!Array.isArray(txDetails)) return;

        txDetails.forEach(d => {
            const exp = expenseMap[d.expenseId];
            if (!exp) return;

            const isSolar = (exp.linkedSolarSupplier && exp.linkedSolarSupplier.trim()) ||
                            (exp.name && exp.name.toUpperCase().includes('SOLAR'));

            if (isSolar) {
                const qty = parseFloat(d.qty) || 0;
                if (qty > 0) {
                    if (!dailyUsages[date]) {
                        dailyUsages[date] = {
                            date: date,
                            qty: 0,
                            expNames: new Set()
                        };
                    }
                    dailyUsages[date].qty += qty;
                    if (exp.name) dailyUsages[date].expNames.add(exp.name);
                }
            }
        });
    });

    // 4. Sort usage dates chronologically (ascending)
    const sortedUsageDates = Object.keys(dailyUsages).sort((a, b) => new Date(a) - new Date(b));
    const autoKeluar = [];

    function pushAutoKeluarItems(autoKeluarList, rowId, date, amount, fallbackSupplier, expNamesStr, dataObj) {
        let rowOverride = dataObj.solarRowOverrides ? dataObj.solarRowOverrides[rowId] : null;
        let dateOverride = dataObj.solarDateOverrides ? dataObj.solarDateOverrides[date] : null;

        if (typeof rowOverride === 'string' && rowOverride.startsWith('{') && rowOverride.includes('"split"')) {
            try { rowOverride = JSON.parse(rowOverride); } catch (e) {}
        }
        if (typeof dateOverride === 'string' && dateOverride.startsWith('{') && dateOverride.includes('"split"')) {
            try { dateOverride = JSON.parse(dateOverride); } catch (e) {}
        }

        // 1. Check Row-Level Split Override
        if (rowOverride && typeof rowOverride === 'object' && rowOverride.split) {
            const sup1 = (rowOverride.sup1 || fallbackSupplier).toUpperCase().trim();
            const sup2 = (rowOverride.sup2 || fallbackSupplier).toUpperCase().trim();
            let q1 = parseFloat(rowOverride.qty1);
            let q2 = parseFloat(rowOverride.qty2);

            if (isNaN(q1) || isNaN(q2)) {
                const p1 = parseFloat(rowOverride.pct1) || 50;
                q1 = Math.round(amount * (p1 / 100) * 100) / 100;
                q2 = Math.round((amount - q1) * 100) / 100;
            } else {
                const overrideTot = q1 + q2;
                if (Math.abs(overrideTot - amount) > 0.01 && overrideTot > 0) {
                    const ratio = amount / overrideTot;
                    q1 = Math.round(q1 * ratio * 100) / 100;
                    q2 = Math.round((amount - q1) * 100) / 100;
                }
            }

            autoKeluarList.push({
                id: `${rowId}__part1`,
                date: date,
                type: 'Keluar',
                supplier: sup1,
                amount: q1,
                description: `PEMAKAIAN HARIAN (BAGIAN 1: ${sup1}) [${expNamesStr}]`,
                isAuto: true,
                parentRowId: rowId,
                splitPart: 1,
                totalOriginalAmount: amount
            });

            autoKeluarList.push({
                id: `${rowId}__part2`,
                date: date,
                type: 'Keluar',
                supplier: sup2,
                amount: q2,
                description: `PEMAKAIAN HARIAN (BAGIAN 2: ${sup2}) [${expNamesStr}]`,
                isAuto: true,
                parentRowId: rowId,
                splitPart: 2,
                totalOriginalAmount: amount
            });
            return;
        }

        // 2. Check Date-Level Split Override
        if (dateOverride && typeof dateOverride === 'object' && dateOverride.split) {
            const sup1 = (dateOverride.sup1 || fallbackSupplier).toUpperCase().trim();
            const sup2 = (dateOverride.sup2 || fallbackSupplier).toUpperCase().trim();
            const p1 = parseFloat(dateOverride.pct1) || 50;
            const q1 = Math.round(amount * (p1 / 100) * 100) / 100;
            const q2 = Math.round((amount - q1) * 100) / 100;

            autoKeluarList.push({
                id: `${rowId}__part1`,
                date: date,
                type: 'Keluar',
                supplier: sup1,
                amount: q1,
                description: `PEMAKAIAN HARIAN (BAGIAN 1: ${sup1}) [${expNamesStr}]`,
                isAuto: true,
                parentRowId: rowId,
                splitPart: 1,
                totalOriginalAmount: amount
            });

            autoKeluarList.push({
                id: `${rowId}__part2`,
                date: date,
                type: 'Keluar',
                supplier: sup2,
                amount: q2,
                description: `PEMAKAIAN HARIAN (BAGIAN 2: ${sup2}) [${expNamesStr}]`,
                isAuto: true,
                parentRowId: rowId,
                splitPart: 2,
                totalOriginalAmount: amount
            });
            return;
        }

        // 3. Single Supplier (Row Override > Date Override > Fallback)
        const finalSupplier = (typeof rowOverride === 'string' && rowOverride.trim())
            ? rowOverride.trim().toUpperCase()
            : ((typeof dateOverride === 'string' && dateOverride.trim())
                ? dateOverride.trim().toUpperCase()
                : fallbackSupplier.toUpperCase().trim());

        autoKeluarList.push({
            id: rowId,
            date: date,
            type: 'Keluar',
            supplier: finalSupplier,
            amount: amount,
            description: `PEMAKAIAN HARIAN (${finalSupplier}) [${expNamesStr}]`,
            isAuto: true,
            totalOriginalAmount: amount
        });
    }

    // 5. FIFO deduction across batches
    sortedUsageDates.forEach(date => {
        const usage = dailyUsages[date];
        let needed = usage.qty;
        const expNamesStr = Array.from(usage.expNames).join(', ');
        let rowSeq = 0;

        for (let i = 0; i < masukBatches.length && needed > 0; i++) {
            const batch = masukBatches[i];
            if (batch.date <= date && batch.remaining > 0) {
                const take = Math.min(needed, batch.remaining);
                batch.remaining -= take;
                needed -= take;
                rowSeq++;

                const rowId = `auto-${date}-${batch.id || ('batch_' + i)}-${rowSeq}`;
                pushAutoKeluarItems(autoKeluar, rowId, date, take, batch.supplier, expNamesStr, data);
            }
        }

        if (needed > 0) {
            for (let i = 0; i < masukBatches.length && needed > 0; i++) {
                if (masukBatches[i].remaining > 0) {
                    const take = Math.min(needed, masukBatches[i].remaining);
                    masukBatches[i].remaining -= take;
                    needed -= take;
                    rowSeq++;

                    const rowId = `auto-${date}-${masukBatches[i].id || ('batch_' + i)}-${rowSeq}`;
                    pushAutoKeluarItems(autoKeluar, rowId, date, take, masukBatches[i].supplier, expNamesStr, data);
                }
            }
        }

        if (needed > 0) {
            rowSeq++;
            const rowId = `auto-${date}-dex-${rowSeq}`;
            pushAutoKeluarItems(autoKeluar, rowId, date, needed, pertaminaDexSup, expNamesStr, data);
        }
    });

    return [
        ...masukBatches.map(b => ({
            id: b.id,
            date: b.date,
            supplier: b.supplier,
            type: 'Masuk',
            amount: b.amount,
            description: b.description,
            isAuto: false
        })),
        ...manualKeluar,
        ...autoKeluar
    ];
}

window.getAllSolarSuppliers = getAllSolarSuppliers;
window.getDefaultSolarSupplier = getDefaultSolarSupplier;
window.getPertaminaDexSupplier = getPertaminaDexSupplier;
window.getCalculatedSolarRecords = getCalculatedSolarRecords;
