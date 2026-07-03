// ══════════════════════════════════════════════════════
//  MÓDULO: FOTOS POR PRESENTACIÓN (variante de producto)
//  Galería dentro del formulario de presentación-producto.
//  - Subir (input + arrastrar) varias imágenes por variante
//  - Marcar principal (sale primera) · eliminar
//  - Reordenar arrastrando (la principal queda fija arriba)
//  Nombres con prefijo ppf* para no colisionar con fotos.js/productos.js
// ══════════════════════════════════════════════════════

let _ppfFotos   = [];
let _idPPActivo = null;
let _ppfDragIdx = null;

// ── PANEL (mostrar/ocultar al editar una presentación) ──
function ppfMostrarPanel(idPP) {
    const panel = document.getElementById('ppfPanel');
    if (!panel) return;
    panel.style.display = 'block';
    ppfInitDropZone();
    ppfCargar(idPP);
}

function ppfOcultarPanel() {
    const panel = document.getElementById('ppfPanel');
    if (panel) panel.style.display = 'none';
    _idPPActivo = null;
    _ppfFotos   = [];
}

// ¿La variante en edición ya tiene imágenes propias? (para el aviso al guardar)
function ppfTieneFotos() {
    return _ppfFotos.length > 0;
}

// ── CARGAR ──────────────────────────────────────────────
async function ppfCargar(idPP) {
    _idPPActivo = idPP;
    const cont = document.getElementById('ppfGaleria');
    if (!cont) return;
    cont.innerHTML = '<div style="text-align:center;padding:14px;color:#bbb;font-size:12px">Cargando imágenes...</div>';
    try {
        _ppfFotos = await api('GET', `/api/presentaciones/producto-precio/${idPP}/fotos`);
        ppfRender();
    } catch (e) {
        cont.innerHTML = `<div style="color:#c62828;padding:10px;font-size:12px">${e.message}</div>`;
    }
}

// ── RENDER GALERÍA ──────────────────────────────────────
function ppfRender() {
    const cont = document.getElementById('ppfGaleria');
    if (!cont) return;

    if (!_ppfFotos.length) {
        cont.innerHTML = `
          <div style="text-align:center;padding:14px;color:#bbb;font-size:12px">
            <i class="bi bi-image" style="font-size:24px;display:block;margin-bottom:6px"></i>
            Sin imágenes. Si no subes ninguna, se usará la de la presentación principal.
          </div>`;
        return;
    }

    cont.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(116px,1fr));gap:10px">
        ${_ppfFotos.map((f, idx) => {
            const principal = !!f.es_principal;
            const inactiva  = Number(f.estado) === 0;
            return `
            <div class="ppf-card"
                 draggable="${principal ? 'false' : 'true'}"
                 ondragstart="ppfDragStart(event,${idx})"
                 ondragover="ppfDragOver(event,${idx})"
                 ondragend="ppfDragEnd(event)"
                 onmouseover="this.style.boxShadow='0 4px 12px rgba(0,0,0,.12)'"
                 onmouseout="this.style.boxShadow='none'"
                 style="position:relative;border-radius:12px;overflow:hidden;
                        border:2px solid ${inactiva ? '#cfcfcf' : (principal ? '#ff7043' : '#e8e8e8')};
                        background:#f5f5f5;transition:box-shadow .15s;${principal ? '' : 'cursor:grab'}">

              <img src="${f.url_foto}" alt="foto presentación"
                style="width:100%;height:96px;object-fit:cover;display:block;cursor:zoom-in;${inactiva ? 'filter:grayscale(1);opacity:.5' : ''}"
                onclick="ppfVerAmpliada('${f.id_foto}')"
                onerror="this.style.background='#eee'">

              ${principal
                ? `<div style="position:absolute;top:5px;left:5px;background:#ff7043;color:#fff;
                               font-size:9px;font-weight:700;padding:2px 7px;border-radius:9px;box-shadow:0 1px 3px rgba(0,0,0,.25)">★ PRINCIPAL</div>`
                : `<span title="Arrastrar para reordenar"
                     style="position:absolute;top:5px;left:5px;width:22px;height:22px;border-radius:6px;
                            background:rgba(0,0,0,.45);color:#fff;display:flex;align-items:center;justify-content:center;font-size:13px">
                     <i class="bi bi-grip-vertical"></i></span>`}

              ${inactiva
                ? `<div style="position:absolute;top:5px;right:5px;background:#757575;color:#fff;
                               font-size:9px;font-weight:700;padding:2px 7px;border-radius:9px">INACTIVA</div>`
                : ''}

              <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;
                          padding:5px 8px;background:#fff;border-top:1px solid #f0f0f0">
                ${!principal
                  ? `<button type="button" title="Marcar como principal"
                       onclick="ppfMarcarPrincipal(${f.id_foto})"
                       style="background:none;border:none;cursor:pointer;font-size:11px;color:#e65100;padding:0;display:flex;align-items:center;gap:3px;font-weight:600">
                       <i class="bi bi-star"></i> Principal</button>`
                  : `<span style="font-size:11px;color:#ff7043;display:flex;align-items:center;gap:3px;font-weight:600"><i class="bi bi-star-fill"></i> Portada</span>`}
                <div style="display:flex;align-items:center;gap:8px">
                  <button type="button" title="${inactiva ? 'Activar imagen (mostrarla)' : 'Desactivar imagen (ocultarla sin borrar)'}"
                    onclick="ppfToggleEstado(${f.id_foto}, ${inactiva ? 1 : 0})"
                    style="background:none;border:none;cursor:pointer;font-size:14px;color:${inactiva ? '#9e9e9e' : '#2e7d32'};padding:0">
                    <i class="bi bi-${inactiva ? 'eye-slash' : 'eye'}"></i>
                  </button>
                  <button type="button" title="Eliminar imagen"
                    onclick="ppfEliminar(${f.id_foto}, ${principal})"
                    style="background:none;border:none;cursor:pointer;font-size:13px;color:#c62828;padding:0">
                    <i class="bi bi-trash"></i>
                  </button>
                </div>
              </div>
            </div>`;
        }).join('')}
      </div>`;
}

// ── VER AMPLIADA ────────────────────────────────────────
function ppfVerAmpliada(idFoto) {
    const f = _ppfFotos.find(x => String(x.id_foto) === String(idFoto));
    if (!f) return;
    const overlay = document.createElement('div');
    overlay.style.cssText =
        'position:fixed;inset:0;background:rgba(0,0,0,.85);display:flex;' +
        'align-items:center;justify-content:center;z-index:9999;cursor:zoom-out';
    overlay.innerHTML = `<img src="${f.url_foto}" style="max-width:90vw;max-height:90vh;border-radius:8px;box-shadow:0 8px 32px rgba(0,0,0,.5)">`;
    overlay.onclick = () => document.body.removeChild(overlay);
    document.body.appendChild(overlay);
}

// ── MARCAR PRINCIPAL ────────────────────────────────────
async function ppfMarcarPrincipal(idFoto) {
    if (!_idPPActivo) return;
    try {
        await api('PUT', `/api/presentaciones/producto-precio/${_idPPActivo}/fotos/${idFoto}/principal`);
        await ppfCargar(_idPPActivo);
        ppfRefrescarListado();
    } catch (e) {
        showAlert('alertPreciosPresentacion', e.message);
    }
}

// ── ACTIVAR / INACTIVAR (sin borrar) ────────────────────
async function ppfToggleEstado(idFoto, nuevoEstado) {
    if (!_idPPActivo) return;
    try {
        await api('PUT', `/api/presentaciones/producto-precio/${_idPPActivo}/fotos/${idFoto}/estado`, { estado: nuevoEstado });
        await ppfCargar(_idPPActivo);
        ppfRefrescarListado();
    } catch (e) {
        showAlert('alertPreciosPresentacion', e.message);
    }
}

// ── ELIMINAR ────────────────────────────────────────────
function ppfEliminar(idFoto, esPrincipal) {
    const msg = esPrincipal
        ? '¿Eliminar la imagen principal? La siguiente pasará a ser la principal.'
        : '¿Eliminar esta imagen? Esta acción no se puede deshacer.';
    showConfirm(msg, async () => {
        try {
            await api('DELETE', `/api/presentaciones/producto-precio/${_idPPActivo}/fotos/${idFoto}`);
            await ppfCargar(_idPPActivo);
            ppfRefrescarListado();
        } catch (e) {
            showAlert('alertPreciosPresentacion', e.message);
        }
    }, { btnLabel: 'Eliminar', btnColor: '#c62828', title: '⚠️ Eliminar imagen' });
}

// ── SUBIR ───────────────────────────────────────────────
async function ppfSubir(file) {
    if (!_idPPActivo) {
        showAlert('alertPreciosPresentacion', 'Guarda la presentación primero antes de subir imágenes');
        return;
    }
    const tipos = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!tipos.includes(file.type)) {
        showAlert('alertPreciosPresentacion', 'Solo se permiten imágenes JPEG, PNG, WEBP o GIF');
        return;
    }
    if (file.size > 5 * 1024 * 1024) {
        showAlert('alertPreciosPresentacion', 'La imagen no puede superar 5 MB');
        return;
    }

    const zona = document.getElementById('ppfDropZone');
    const zonaHtml = zona ? zona.innerHTML : '';
    if (zona) zona.innerHTML = '<i class="bi bi-hourglass-split"></i> Subiendo...';

    try {
        const fd = new FormData();
        fd.append('foto', file);
        await apiForm('POST', `/api/presentaciones/producto-precio/${_idPPActivo}/fotos`, fd);

        const input = document.getElementById('ppfInput');
        if (input) input.value = '';
        await ppfCargar(_idPPActivo);
        ppfRefrescarListado();
        showAlert('alertPreciosPresentacion', '✓ Imagen subida', 'success');
    } catch (e) {
        showAlert('alertPreciosPresentacion', e.message);
    } finally {
        if (zona) zona.innerHTML = zonaHtml;
    }
}

function ppfHandleInput(input) {
    if (input.files && input.files[0]) ppfSubir(input.files[0]);
}

// ── DROP ZONE ───────────────────────────────────────────
function ppfInitDropZone() {
    const zona = document.getElementById('ppfDropZone');
    if (!zona || zona._ppfInit) return;
    zona._ppfInit = true;

    zona.addEventListener('dragover', (e) => {
        e.preventDefault();
        zona.style.borderColor = '#26a69a';
        zona.style.background  = '#e0f2f1';
    });
    zona.addEventListener('dragleave', () => {
        zona.style.borderColor = '#cfd8dc';
        zona.style.background  = '#fafafa';
    });
    zona.addEventListener('drop', (e) => {
        e.preventDefault();
        zona.style.borderColor = '#cfd8dc';
        zona.style.background  = '#fafafa';
        const files = e.dataTransfer.files;
        if (files.length > 0) ppfSubir(files[0]);
    });
    zona.addEventListener('click', () => {
        document.getElementById('ppfInput')?.click();
    });
}

// ── DRAG & DROP REORDER (principal fija arriba) ─────────
function ppfDragStart(e, idx) {
    if (_ppfFotos[idx]?.es_principal) { e.preventDefault(); return; }
    _ppfDragIdx = idx;
    e.dataTransfer.effectAllowed = 'move';
}

function ppfDragOver(e, idx) {
    e.preventDefault();
    if (_ppfDragIdx === null || _ppfDragIdx === idx) return;
    // No mover la principal ni soltar por encima de ella
    if (_ppfFotos[_ppfDragIdx]?.es_principal || _ppfFotos[idx]?.es_principal) return;
    const moved = _ppfFotos.splice(_ppfDragIdx, 1)[0];
    _ppfFotos.splice(idx, 0, moved);
    _ppfDragIdx = idx;
    ppfRender();
}

function ppfDragEnd() {
    _ppfDragIdx = null;
    ppfGuardarOrden();
}

async function ppfGuardarOrden() {
    if (!_idPPActivo || !_ppfFotos.length) return;
    try {
        const payload = _ppfFotos.map((f, i) => ({ id_foto: f.id_foto, orden: i }));
        await api('PUT', `/api/presentaciones/producto-precio/${_idPPActivo}/fotos/orden`, { fotos: payload });
        ppfRefrescarListado();
    } catch (e) {
        console.warn('Error al guardar orden de imágenes:', e.message);
    }
}

// Refresca la tabla de presentaciones para actualizar la miniatura
function ppfRefrescarListado() {
    const idProd = document.getElementById('ppProductoId')?.value;
    if (idProd && typeof cargarPreciosPresentacion === 'function') cargarPreciosPresentacion(idProd);
}
