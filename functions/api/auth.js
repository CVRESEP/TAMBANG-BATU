export async function onRequestPost(context) {
    const { request } = context;

    try {
        const body = await request.json();
        const { username, password } = body;

        // Default login: ADMIN / ADMIN
        if (username === 'ADMIN' && password === 'ADMIN') {
            return new Response(JSON.stringify({
                success: true,
                user: {
                    username: 'ADMIN',
                    id: 'admin-id',
                    profile: {
                        full_name: 'Administrator',
                        role: 'Admin'
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
        return new Response(JSON.stringify({ error: "Invalid request" }), { status: 400 });
    }
}
