// si ya hay token, redirige al dashboard
if (localStorage.getItem('token')) {
    window.location.replace('/dashboard');
}

// Aplica el logo de login y el favicon configurados en Configuración >
// Identidad Visual. Best-effort: si falla o no hay nada configurado, se
// mantiene el emoji 🌋 (fallback) y el favicon estático del HTML.
async function _aplicarBrandingLogin() {
    try {
        const res = await fetch('/api/configuracion/publica');
        if (!res.ok) return;
        const cfg = await res.json();

        if (cfg.logo_login_base64) {
            const emoji = document.getElementById('brandLogoEmoji');
            const img   = document.getElementById('brandLogoImg');
            if (img) { img.src = cfg.logo_login_base64; img.style.display = ''; }
            if (emoji) emoji.style.display = 'none';
        }
        if (cfg.logo_base64) {
            document.querySelectorAll('link[rel="icon"], link[rel="apple-touch-icon"]')
                .forEach(el => { el.href = cfg.logo_base64; });
        }
    } catch (_) { /* mantiene el fallback */ }
}
_aplicarBrandingLogin();

document.addEventListener('DOMContentLoaded', () => {
    document.body.style.visibility = 'visible';

    // Enter para hacer login
    document.addEventListener('keydown', e => {
        if (e.key === 'Enter') doLogin();
    });

    document.getElementById('btnLogin').addEventListener('click', doLogin);

    // Toggle show/hide password
    document.getElementById('togglePwd').addEventListener('click', () => {
        const pwd = document.getElementById('password');
        const btn = document.getElementById('togglePwd');
        if (pwd.type === 'password') {
            pwd.type = 'text';
            btn.textContent = '🙈';
        } else {
            pwd.type = 'password';
            btn.textContent = '👁';
        }
    });
});

async function doLogin() {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    const errorDiv = document.getElementById('mensajeError');
    const btnLogin = document.getElementById('btnLogin');

    if (!username || !password) {
        showError('Completa todos los campos');
        return;
    }

    btnLogin.disabled = true;
    btnLogin.innerHTML = '<span class="spin"></span>Ingresando...';
    errorDiv.style.display = 'none';

    try {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });

        const data = await res.json();

        if (res.ok) {
            localStorage.setItem('token',    data.token);
            localStorage.setItem('usuario',  JSON.stringify(data.usuario));
            localStorage.setItem('opciones', JSON.stringify(data.opciones || []));
            window.location.replace('/dashboard');
        } else if (res.status === 403) {
            showWarn(data.message || 'Acceso restringido');
            resetBtn();
        } else {
            showError(data.message || 'Error al iniciar sesión');
            resetBtn();
        }
    } catch {
        showError('No se pudo conectar al servidor');
        resetBtn();
    }

    function showError(msg) {
        document.getElementById('mensajeWarn').style.display = 'none';
        errorDiv.textContent = msg;
        errorDiv.style.display = 'block';
    }

    function showWarn(msg) {
        errorDiv.style.display = 'none';
        const w = document.getElementById('mensajeWarn');
        w.innerHTML = `⚠️ ${msg}`;
        w.style.display = 'block';
    }

    function resetBtn() {
        btnLogin.disabled = false;
        btnLogin.innerHTML = 'Ingresar';
    }
}
