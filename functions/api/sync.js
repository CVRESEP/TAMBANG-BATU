import { createClient } from "@libsql/client/web";

export async function onRequestGet(context) {
    const { env } = context;
    
    
    const client = createClient({
        url: env.TURSO_URL,
        authToken: env.TURSO_AUTH_TOKEN,
    });

    // Auto-migrate profiles and solar tables
    try {
        await client.execute(`
            CREATE TABLE IF NOT EXISTS profiles (
                id TEXT PRIMARY KEY,
                full_name TEXT,
                email TEXT UNIQUE,
                role TEXT,
                created_at TEXT
            )
        `);
        // Ensure password column exists (SQLite doesn't support ADD COLUMN IF NOT EXISTS)
        try {
            await client.execute(`ALTER TABLE profiles ADD COLUMN password TEXT`);
        } catch (e) {}
        
        await client.execute(`
            CREATE TABLE IF NOT EXISTS solar (
                id TEXT PRIMARY KEY,
                type TEXT,
                date TEXT,
                amount REAL,
                description TEXT,
                created_at TEXT
            )
        `);
        try {
            await client.execute(`ALTER TABLE solar ADD COLUMN supplier TEXT`);
        } catch (e) {}
        try {
            await client.execute(`ALTER TABLE expense_types ADD COLUMN linked_solar_supplier TEXT`);
        } catch (e) {}
        await client.execute(`
            CREATE TABLE IF NOT EXISTS solar_suppliers (
                id TEXT PRIMARY KEY,
                name TEXT UNIQUE,
                created_at TEXT
            )
        `);
    } catch (e) {
        console.error("Migration failed:", e);
    }

    try {
        const [buyers, drivers, expenseTypes, settlements, deductions, transactions, profiles, solar, solarSuppliers] = await Promise.all([
            client.execute("SELECT * FROM buyers"),
            client.execute("SELECT * FROM drivers"),
            client.execute("SELECT * FROM expense_types"),
            client.execute("SELECT * FROM settlements"),
            client.execute("SELECT * FROM deductions"),
            client.execute("SELECT * FROM transactions"),
            client.execute("SELECT * FROM profiles"),
            client.execute("SELECT * FROM solar"),
            client.execute("SELECT * FROM solar_suppliers")
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
            solarSuppliers: solarSuppliers ? solarSuppliers.rows : []
        }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200
        });
    } catch (e) {
        return new Response(JSON.stringify({ error: e.message }), { status: 500 });
    }
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

        if (!table || !item) {
            return new Response("Missing table or item", { status: 400 });
        }

        // Build the columns and values dynamically
        const columns = Object.keys(item);
        const placeholders = columns.map(() => '?').join(', ');
        const values = Object.values(item).map(v => typeof v === 'object' && v !== null ? JSON.stringify(v) : v);
        
        // For upsert we use ON CONFLICT (id) DO UPDATE SET ...
        const updateClause = columns.filter(c => c !== 'id').map(c => `${c} = excluded.${c}`).join(', ');
        
        let query = `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`;
        if (updateClause.length > 0) {
            query += ` ON CONFLICT (id) DO UPDATE SET ${updateClause}`;
        } else {
            query += ` ON CONFLICT (id) DO NOTHING`; // Or handle edge case where table only has ID
        }

        await client.execute({ sql: query, args: values });

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
