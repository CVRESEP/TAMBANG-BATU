import { createClient } from "@libsql/client/web";

export async function onRequestGet(context) {
    const { env } = context;
    
    const client = createClient({
        url: env.TURSO_URL,
        authToken: env.TURSO_AUTH_TOKEN,
    });

    try {
        const [buyers, drivers, expenseTypes, settlements, deductions, transactions, profiles, solar, solarSuppliers, solarOverrides] = await Promise.all([
            client.execute("SELECT * FROM buyers"),
            client.execute("SELECT * FROM drivers"),
            client.execute("SELECT * FROM expense_types"),
            client.execute("SELECT * FROM settlements"),
            client.execute("SELECT * FROM deductions"),
            client.execute("SELECT * FROM transactions"),
            client.execute("SELECT * FROM profiles"),
            client.execute("SELECT * FROM solar"),
            client.execute("SELECT * FROM solar_suppliers"),
            client.execute("SELECT * FROM solar_overrides")
        ]);

        return new Response(JSON.stringify({
            buyers: buyers.rows,
            drivers: drivers.rows,
            expenseTypes: expenseTypes.rows,
            settlements: settlements.rows,
            deductions: deductions.rows,
            transactions: transactions.rows,
            profiles: profiles.rows,
            solar: solar.rows,
            solarSuppliers: solarSuppliers ? solarSuppliers.rows : [],
            solarOverrides: solarOverrides ? solarOverrides.rows : []
        }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200
        });
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
}

const ALLOWED_TABLES = new Set([
    'buyers', 'drivers', 'expense_types', 'settlements', 'deductions',
    'transactions', 'profiles', 'solar', 'solar_suppliers', 'solar_overrides'
]);
const IDENT_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;

// Kolom tambahan yang dibutuhkan fitur penagihan
const TX_PAYMENT_COLUMNS = {
    payments: "TEXT DEFAULT '[]'",
    paid_amount: 'REAL DEFAULT 0',
    paid_at: 'TEXT',
    payment_method: 'TEXT',
    payment_note: 'TEXT',
    status: "TEXT DEFAULT 'Belum Lunas'"
};

let _txColumnsChecked = false;
async function ensureTransactionColumns(client) {
    if (_txColumnsChecked) return;
    const info = await client.execute("PRAGMA table_info(transactions)");
    const existing = new Set(info.rows.map(r => String(r.name).toLowerCase()));
    for (const [col, def] of Object.entries(TX_PAYMENT_COLUMNS)) {
        if (!existing.has(col)) {
            await client.execute(`ALTER TABLE transactions ADD COLUMN ${col} ${def}`);
        }
    }
    _txColumnsChecked = true;
}

export async function onRequestPost(context) {
    const { env, request } = context;
    const client = createClient({
        url: env.TURSO_URL,
        authToken: env.TURSO_AUTH_TOKEN,
    });

    try {
        const body = await request.json();
        const { table, item } = body;

        if (!table || !item || item.id === undefined || item.id === null) {
            return new Response(JSON.stringify({ error: "Missing table, item, or item.id" }), { status: 400 });
        }
        if (!ALLOWED_TABLES.has(table)) {
            return new Response(JSON.stringify({ error: `Invalid table: ${table}` }), { status: 400 });
        }

        const columns = Object.keys(item).filter(c => item[c] !== undefined);
        if (columns.some(c => !IDENT_RE.test(c))) {
            return new Response(JSON.stringify({ error: "Invalid column name" }), { status: 400 });
        }

        if (table === 'transactions') {
            await ensureTransactionColumns(client);
        }

        const toVal = v => (typeof v === 'object' && v !== null) ? JSON.stringify(v) : v;
        const updateCols = columns.filter(c => c !== 'id');

        // 1) Coba UPDATE dulu — mendukung update parsial (mis. hanya kolom pembayaran)
        let affected = 0;
        if (updateCols.length > 0) {
            const res = await client.execute({
                sql: `UPDATE ${table} SET ${updateCols.map(c => `${c} = ?`).join(', ')} WHERE id = ?`,
                args: [...updateCols.map(c => toVal(item[c])), item.id]
            });
            affected = res.rowsAffected || 0;
        }

        // 2) Jika belum ada, INSERT baris baru
        if (affected === 0) {
            await client.execute({
                sql: `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')}) ON CONFLICT (id) DO NOTHING`,
                args: columns.map(c => toVal(item[c]))
            });
        }

        return new Response(JSON.stringify({ success: true }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200
        });
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
}

export async function onRequestDelete(context) {
    const { env, request } = context;
    const url = new URL(request.url);
    const table = url.searchParams.get('table');
    const id = url.searchParams.get('id');

    if (!table || !id) {
        return new Response("Missing table or id", { status: 400 });
    }

    const client = createClient({
        url: env.TURSO_URL,
        authToken: env.TURSO_AUTH_TOKEN,
    });

    try {
        await client.execute({ sql: `DELETE FROM ${table} WHERE id = ?`, args: [id] });
        return new Response(JSON.stringify({ success: true }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200
        });
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
}
