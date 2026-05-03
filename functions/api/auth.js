import { createClient } from "@libsql/client/web";

export async function onRequestPost(context) {
    const { env, request } = context;

    try {
        const body = await request.json();
        const { username, password } = body;

        // Default login: ADMIN / ADMIN (for safety)
        if (username === 'ADMIN' && password === 'ADMIN') {
             return new Response(JSON.stringify({
                success: true,
                user: { username: 'ADMIN', id: 'admin-id', profile: { full_name: 'Administrator', role: 'Admin' } }
            }), { headers: { 'Content-Type': 'application/json' }, status: 200 });
        }

        const client = createClient({
            url: env.TURSO_URL,
            authToken: env.TURSO_AUTH_TOKEN,
        });

        // Search for user in profiles table
        const result = await client.execute({
            sql: "SELECT * FROM profiles WHERE email = ? AND password = ?",
            args: [username, password]
        });

        if (result.rows.length > 0) {
            const user = result.rows[0];
            return new Response(JSON.stringify({
                success: true,
                user: {
                    username: user.email,
                    id: user.id,
                    profile: {
                        full_name: user.full_name,
                        role: user.role
                    }
                }
            }), {
                headers: { 'Content-Type': 'application/json' },
                status: 200
            });
        }

        return new Response(JSON.stringify({ error: "Username atau Password salah." }), {
            headers: { 'Content-Type': 'application/json' },
            status: 401
        });
    } catch (e) {
        return new Response(JSON.stringify({ error: "Terjadi kesalahan server: " + e.message }), { status: 500 });
    }
}
