const fs = require('fs');

let content = fs.readFileSync('script.js', 'utf-8');

// Update initAuth to use username and call /api/auth
content = content.replace(/async function initAuth\(\) \{[\s\S]*?async function handleUserSignIn\(user\) \{/m, `async function initAuth() {
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const username = document.getElementById('login-username').value;
            const password = document.getElementById('login-password').value;
            const errorEl = document.getElementById('login-error');
            const btn = document.getElementById('btn-login');

            errorEl.textContent = '';
            btn.disabled = true;
            btn.innerHTML = '<div style="width:20px;height:20px;border:2px solid rgba(255,255,255,0.2);border-top-color:#fff;border-radius:50%;animation:spin 0.6s linear infinite;"></div> <span>Processing...</span>';

            try {
                const response = await fetch('/api/auth', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ username, password })
                });

                const result = await response.json();

                if (response.ok && result.success) {
                    handleUserSignIn(result.user);
                } else {
                    errorEl.textContent = result.error || "Login gagal.";
                    btn.disabled = false;
                    btn.innerHTML = '<span>Sign In</span> <span class="material-symbols-outlined">login</span>';
                }
            } catch (err) {
                console.error("Auth Failure:", err);
                errorEl.textContent = "Terjadi kesalahan koneksi.";
                btn.disabled = false;
                btn.innerHTML = '<span>Sign In</span> <span class="material-symbols-outlined">login</span>';
            }
        });
    }

    const session = localStorage.getItem('session');
    if (session) {
        handleUserSignIn(JSON.parse(session));
    }
}

async function handleUserSignIn(user) {`);

// Ensure handleUserSignIn uses user.username if email is missing
content = content.replace(/document\.getElementById\('header-user-name'\)\.textContent = `\$\{currentUser\.profile\.full_name\} \(\$\{currentUser\.profile\.role\}\)`;/g, `document.getElementById('header-user-name').textContent = \`\${user.profile?.full_name || user.username} (\${user.profile?.role || 'User'})\`;`);

fs.writeFileSync('script.js', content);
console.log('script.js updated with real auth logic.');
