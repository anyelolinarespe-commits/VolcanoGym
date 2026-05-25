// si ya hay token, redirige al dashboard
if (localStorage.getItem('token')) {
    window.location.replace('/dashboard');
}

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
        } else {
            showError(data.message || 'Error al iniciar sesión');
            resetBtn();
        }
    } catch {
        showError('No se pudo conectar al servidor');
        resetBtn();
    }

    function showError(msg) {
        errorDiv.textContent = msg;
        errorDiv.style.display = 'block';
    }

    function resetBtn() {
        btnLogin.disabled = false;
        btnLogin.innerHTML = 'Ingresar';
    }
}
