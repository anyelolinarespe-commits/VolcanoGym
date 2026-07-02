// ══════════════════════════════════════════════════════
//  MÓDULO: FOTOS DE PRODUCTO
//  Tab "Fotos" en el modal de producto
//  - Drag & drop + click para subir
//  - Vista previa de galería
//  - Marcar como principal
//  - Eliminar foto
// ══════════════════════════════════════════════════════

let _fotosProducto      = [];
let _idProductoFotos    = null;
let _isDraggingOver     = false;

// ── CARGAR FOTOS ──────────────────────────────────────
async function cargarFotosProducto(idProducto) {
    _idProductoFotos = idProducto;
    const cont = document.getElementById('fotosGaleria');
    if (!cont) return;

    cont.innerHTML = `
      <div style="text-align:center;padding:20px;color:#bbb">
        <i class="bi bi-hourglass-split" style="font-size:24px"></i>
        <div style="margin-top:8px">Cargando fotos...</div>
      </div>`;

    try {
        _fotosProducto = await api('GET', `/api/productos/${idProducto}/fotos`);
        renderFotosGaleria(_fotosProducto);
    } catch (e) {
        cont.innerHTML = `<div style="color:#c62828;padding:16px;text-align:center">${e.message}</div>`;
    }
}

// ── RENDER GALERÍA ────────────────────────────────────
function renderFotosGaleria(fotos) {
    const cont = document.getElementById('fotosGaleria');
    if (!cont) return;

    if (!fotos.length) {
        cont.innerHTML = `
          <div style="text-align:center;padding:30px;color:#bbb">
            <i class="bi bi-image" style="font-size:40px;display:block;margin-bottom:10px"></i>
            Sin fotos. Sube la primera imagen del producto.
          </div>`;
        return;
    }

    cont.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:12px;padding:4px">
        ${fotos.map(f => `
          <div style="position:relative;border-radius:10px;overflow:hidden;
                      border:2px solid ${f.es_principal ? '#ff7043' : '#e0e0e0'};
                      box-shadow:${f.es_principal ? '0 0 0 2px #ff704344' : 'none'};
                      transition:all .2s">
            <!-- Imagen -->
            <img src="${f.url_foto}" alt="Foto producto"
              style="width:100%;height:120px;object-fit:cover;display:block;cursor:pointer"
              onclick="verFotoAmpliada('${f.url_foto}')"
              onerror="this.src='/img/no-image.png'">

            <!-- Badge principal -->
            ${f.es_principal
              ? `<div style="position:absolute;top:6px;left:6px;background:#ff7043;color:#fff;
                             font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px">
                   ★ PRINCIPAL
                 </div>`
              : ''}

            <!-- Acciones -->
            <div style="display:flex;justify-content:space-between;align-items:center;
                        padding:6px 8px;background:#fafafa;border-top:1px solid #f0f0f0">
              ${!f.es_principal
                ? `<button title="Marcar como principal"
                     onclick="marcarFotoPrincipal(${f.id_foto})"
                     style="background:none;border:none;cursor:pointer;
                            font-size:16px;color:#e65100;padding:2px 4px"
                     title="Marcar como principal">★</button>`
                : `<span style="font-size:16px;color:#ff7043;padding:2px 4px">★</span>`}
              <button title="Eliminar foto"
                onclick="eliminarFoto(${f.id_foto}, ${f.es_principal})"
                style="background:none;border:none;cursor:pointer;
                       font-size:14px;color:#c62828;padding:2px 4px">
                <i class="bi bi-trash"></i>
              </button>
            </div>
          </div>`).join('')}
      </div>`;
}

// ── VER FOTO AMPLIADA ─────────────────────────────────
function verFotoAmpliada(url) {
    // Crea un overlay simple para ver la foto en grande
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        position:fixed;inset:0;background:rgba(0,0,0,.85);
        display:flex;align-items:center;justify-content:center;
        z-index:9999;cursor:zoom-out`;
    overlay.innerHTML = `
        <img src="${url}" style="max-width:90vw;max-height:90vh;
               border-radius:8px;box-shadow:0 8px 32px rgba(0,0,0,.5)">`;
    overlay.onclick = () => document.body.removeChild(overlay);
    document.body.appendChild(overlay);
}

// ── MARCAR COMO PRINCIPAL ─────────────────────────────
async function marcarFotoPrincipal(idFoto) {
    if (!_idProductoFotos) return;
    try {
        await api('PUT', `/api/productos/${_idProductoFotos}/fotos/${idFoto}/principal`);
        await cargarFotosProducto(_idProductoFotos);
        // Actualizar foto_principal en la tabla de productos si está cargada
        if (typeof loadProductos === 'function') loadProductos();
    } catch (e) {
        showAlert('alertFotos', e.message);
    }
}

// ── ELIMINAR FOTO ─────────────────────────────────────
async function eliminarFoto(idFoto, esPrincipal) {
    const msg = esPrincipal
        ? '¿Eliminar la foto principal? La siguiente foto pasará a ser la principal.'
        : '¿Eliminar esta foto?';
    if (!confirm(msg)) return;

    try {
        await api('DELETE', `/api/productos/${_idProductoFotos}/fotos/${idFoto}`);
        await cargarFotosProducto(_idProductoFotos);
        if (typeof loadProductos === 'function') loadProductos();
    } catch (e) {
        showAlert('alertFotos', e.message);
    }
}

// ── SUBIR FOTO (desde input o drop) ──────────────────
async function subirFotoProducto(file) {
    if (!_idProductoFotos) {
        showAlert('alertFotos', 'Guarda el producto primero antes de subir fotos');
        return;
    }

    // Validar tipo
    const tiposPermitidos = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!tiposPermitidos.includes(file.type)) {
        showAlert('alertFotos', 'Solo se permiten imágenes JPEG, PNG, WEBP o GIF');
        return;
    }

    // Validar tamaño (5 MB)
    if (file.size > 5 * 1024 * 1024) {
        showAlert('alertFotos', 'La imagen no puede superar 5 MB');
        return;
    }

    // Mostrar progreso
    const btnSubir = document.getElementById('btnSubirFoto');
    if (btnSubir) {
        btnSubir.disabled = true;
        btnSubir.innerHTML = '<i class="bi bi-hourglass-split me-1"></i>Subiendo...';
    }

    try {
        const formData = new FormData();
        formData.append('foto', file);

        await apiForm('POST', `/api/productos/${_idProductoFotos}/fotos`, formData);

        // Limpiar input
        const input = document.getElementById('fotoInput');
        if (input) input.value = '';

        // Recargar galería
        await cargarFotosProducto(_idProductoFotos);
        if (typeof loadProductos === 'function') loadProductos();

        showAlert('alertFotos', '✓ Foto subida correctamente', 'success');
    } catch (e) {
        showAlert('alertFotos', e.message);
    } finally {
        if (btnSubir) {
            btnSubir.disabled = false;
            btnSubir.innerHTML = '<i class="bi bi-upload me-1"></i>Subir foto';
        }
    }
}

// ── DRAG & DROP HANDLERS ──────────────────────────────
function initFotosDragDrop() {
    const zona = document.getElementById('fotoDropZone');
    if (!zona) return;
    if (zona.dataset.initialized) return;
    zona.dataset.initialized = '1';

    zona.addEventListener('dragover', (e) => {
        e.preventDefault();
        if (!_isDraggingOver) {
            _isDraggingOver = true;
            zona.style.borderColor  = 'var(--accent)';
            zona.style.background   = 'var(--accent-light, #fff3e0)';
            zona.style.transform    = 'scale(1.01)';
        }
    });

    zona.addEventListener('dragleave', () => {
        _isDraggingOver = false;
        zona.style.borderColor  = '#ddd';
        zona.style.background   = '#fafafa';
        zona.style.transform    = 'scale(1)';
    });

    zona.addEventListener('drop', (e) => {
        e.preventDefault();
        _isDraggingOver = false;
        zona.style.borderColor  = '#ddd';
        zona.style.background   = '#fafafa';
        zona.style.transform    = 'scale(1)';

        const files = e.dataTransfer.files;
        if (files.length > 0) subirFotoProducto(files[0]);
    });

    zona.addEventListener('click', () => {
        document.getElementById('fotoInput')?.click();
    });
}

// ── HANDLER INPUT FILE ────────────────────────────────
function handleFotoInputChange(input) {
    if (input.files && input.files[0]) {
        subirFotoProducto(input.files[0]);
    }
}

// ── INICIALIZAR TAB FOTOS ─────────────────────────────
// Llamar cuando se activa el tab de fotos en el modal producto
function activarTabFotos(idProducto) {
    if (idProducto) {
        _idProductoFotos = idProducto;
        cargarFotosProducto(idProducto);
    }
    // Inicializar drag & drop con pequeño delay para asegurar DOM
    setTimeout(initFotosDragDrop, 100);
}
