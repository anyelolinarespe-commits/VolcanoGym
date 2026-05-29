async function loadCategorias() {
  const tbody = document.getElementById('tbodyCategorias');
  if (tbody) {
    tbody.innerHTML = '<tr class="loading-row"><td colspan="5">Cargando...</td></tr>';
  }
 
  try {
    dataCategorias = await api('GET', '/api/categorias');
    renderCategorias(dataCategorias);
    
    const el = document.getElementById('countCategorias');
    if (el) {
      el.textContent = dataCategorias.filter(c => c.estado === 1).length;
    }
  } catch (e) {
    if (tbody) {
      tbody.innerHTML = `<tr class="empty-row"><td colspan="5">${e.message}</td></tr>`;
    }
  }
}
 
/**
 * Renderiza las filas en la tabla de categorías
 */
function renderCategorias(data) {
  const tbody = document.getElementById('tbodyCategorias');
  if (!tbody) return;
 
  if (!data.length) {
    tbody.innerHTML = '<tr class="empty-row"><td colspan="5">Sin categorías registradas</td></tr>';
    return;
  }
 
  tbody.innerHTML = data.map(c => {
    const pct = parseFloat(c.porcentaje_descuento ?? 0);
    const descuentoBadge = pct > 0
      ? `<span style="background:var(--color-warning-bg);color:var(--color-warning);padding:2px 8px;border-radius:12px;font-size:12px;font-weight:600">-${pct % 1 === 0 ? pct : pct.toFixed(2)}%</span>`
      : `<span style="color:var(--color-text-muted);font-size:12px">—</span>`;
    return `
    <tr>
      <td>${c.id_categoria}</td>
      <td><strong>${c.nombre}</strong></td>
      <td style="color:var(--color-text-secondary)">${c.descripcion || '—'}</td>
      <td style="text-align:center">${descuentoBadge}</td>
      <td style="text-align:center">
        <span class="badge-estado ${c.estado === 1 ? 'badge-activo' : 'badge-inactivo'}">
          ${c.estado === 1 ? 'ACTIVO' : 'INACTIVO'}
        </span>
      </td>
      <td>
        <div style="display:flex;gap:6px;justify-content:center">
          <button class="btn-icon edit" title="Editar" onclick="editCategoria(${c.id_categoria})">
            <i class="bi bi-pencil"></i>
          </button>
        </div>
      </td>
    </tr>`;
  }).join('');
}
 
/**
 * Prepara y abre el modal para crear una nueva categoría
 */
function nuevaCategoria() {
  // Limpiar el ID oculto (indica que es un POST)
  document.getElementById('categoriaId').value = '';

  // Resetear el formulario
  document.getElementById('categoriaNombre').value = '';
  document.getElementById('categoriaDescripcion').value = '';
  document.getElementById('categoriaDescuento').value = '0';

  // Por defecto, las nuevas categorías son activas (ocultamos el selector de estado)
  const estadoGroup = document.getElementById('categoriaEstadoGroup');
  if (estadoGroup) estadoGroup.style.display = 'none';

  // Configurar visual del modal
  document.getElementById('modalCategoriaTitle').textContent = 'Nueva Categoría';
  document.getElementById('alertCategoria').className = 'alert-msg';
  
  // Abrir el modal
  const modal = document.getElementById('modalCategoria');
  if (modal) modal.classList.add('open');
}
 
/**
 * Carga los datos de una categoría en el modal para editarla
 */
function editCategoria(id) {
  const cat = dataCategorias.find(x => x.id_categoria === id);
  if (!cat) return;
 
  // Cargar valores en los inputs
  document.getElementById('categoriaId').value = id;
  document.getElementById('categoriaNombre').value = cat.nombre;
  document.getElementById('categoriaDescripcion').value = cat.descripcion || '';
  document.getElementById('categoriaDescuento').value = parseFloat(cat.porcentaje_descuento ?? 0);
  
  const selectEstado = document.getElementById('categoriaEstado');
  if (selectEstado) selectEstado.value = cat.estado;
 
  // Mostrar el selector de estado al editar
  const estadoGroup = document.getElementById('categoriaEstadoGroup');
  if (estadoGroup) estadoGroup.style.display = 'block';
 
  // Configurar visual
  document.getElementById('modalCategoriaTitle').textContent = 'Editar Categoría';
  document.getElementById('alertCategoria').className = 'alert-msg';
  
  // Abrir el modal
  const modal = document.getElementById('modalCategoria');
  if (modal) modal.classList.add('open');
}
 
/**
 * Guarda o actualiza la categoría mediante la API
 */
async function saveCategoria() {
  const id             = document.getElementById('categoriaId').value;
  const nombre         = document.getElementById('categoriaNombre').value.trim();
  const descripcion    = document.getElementById('categoriaDescripcion').value.trim();
  const estado         = document.getElementById('categoriaEstado').value;
  const porcentaje_descuento = parseFloat(document.getElementById('categoriaDescuento').value || 0);

  if (!nombre) {
    showAlert('alertCategoria', 'El nombre es requerido');
    return;
  }

  try {
    const payload = {
      nombre,
      descripcion,
      porcentaje_descuento,
      estado: Number(estado)
    };
 
    if (id) {
      // Si hay ID, es actualización (PUT)
      await api('PUT', `/api/categorias/${id}`, payload);
    } else {
      // Si no hay ID, es creación (POST)
      await api('POST', '/api/categorias', { nombre, descripcion, porcentaje_descuento });
    }
 
    closeModal('modalCategoria');
    await loadCategorias();
 
    // Sincronizar select de categorías en otros módulos si existe
    if (typeof cargarCategoriasSelect === 'function') {
      cargarCategoriasSelect();
    }
  } catch (e) {
    showAlert('alertCategoria', e.message);
  }
}
function resetCategoriaForm() {
  document.getElementById('categoriaId').value = '';
  document.getElementById('categoriaNombre').value = '';
  document.getElementById('categoriaDescripcion').value = '';
  document.getElementById('categoriaDescuento').value = '0';
  document.getElementById('alertCategoria').className = 'alert-msg';
  document.getElementById('modalCategoriaTitle').textContent = 'Nueva Categoría';
  const estadoGroup = document.getElementById('categoriaEstadoGroup');
  if (estadoGroup) estadoGroup.style.display = 'none';
}