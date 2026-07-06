import { pool } from '../config/bd.js';
import { registrarAuditoria, getIP } from '../helpers/auditoria.js';

// Imágenes permitidas
const CLAVES_IMAGEN = {
  logo_base64:       { label: 'Logo (sidebar)'       },
  icono_base64:      { label: 'Icono / Favicon'       },
  logo_login_base64: { label: 'Logo Login'             },
  qr_pago_base64:    { label: 'QR de Pago'             },
};

const MIME_PERMITIDOS = new Set(['image/jpeg', 'image/jpg', 'image/png']);
const MIME_SOLO_PNG   = new Set(['image/png']);

// ── Configuración general (imágenes) ─────────────────────────────────────────

// GET /api/configuracion
export const getConfiguracion = async (req, res) => {
  try {
    const result = await pool.query(`SELECT clave, valor FROM configuracion_imagenes ORDER BY clave`);
    const config = {};
    for (const row of result.rows) config[row.clave] = row.valor;
    res.json(config);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al obtener configuración' });
  }
};

// GET /api/configuracion/publica  (SIN AUTH — usado por login.html y volcano_web)
// Solo lectura: logos necesarios en páginas sin sesión (branding del login,
// favicon del sitio público).
export const getConfiguracionPublica = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT clave, valor FROM configuracion_imagenes WHERE clave IN ('logo_login_base64','logo_base64')`
    );
    const config = {};
    for (const row of result.rows) config[row.clave] = row.valor;
    res.json(config);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al obtener configuración' });
  }
};

// POST /api/configuracion/imagen/:clave
export const uploadImagen = async (req, res) => {
  const { clave } = req.params;
  const meta = CLAVES_IMAGEN[clave];
  if (!meta) return res.status(400).json({ message: 'Tipo de imagen no permitido' });
  if (!req.file) return res.status(400).json({ message: 'No se recibió ningún archivo' });

  const mime = req.file.mimetype;
  const permitidos = clave === 'icono_base64' ? MIME_SOLO_PNG : MIME_PERMITIDOS;
  if (!permitidos.has(mime)) {
    const fmt = clave === 'icono_base64' ? 'PNG' : 'JPG o PNG';
    return res.status(422).json({ message: `Solo se permiten imágenes en formato ${fmt}` });
  }

  try {
    const base64 = `data:${mime};base64,${req.file.buffer.toString('base64')}`;
    await pool.query(`
      INSERT INTO configuracion_imagenes (clave, valor, modificado_por, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (clave) DO UPDATE SET valor = $2, modificado_por = $3, updated_at = NOW()
    `, [clave, base64, req.usuario.id]);
    registrarAuditoria({
      id_usuario: req.usuario.id, nombre_usuario: req.usuario.nombre || req.usuario.username,
      accion: 'EDITAR', modulo: 'Configuración', descripcion: `${meta.label} actualizado`, ip: getIP(req),
    });
    res.json({ message: `${meta.label} actualizado`, url: base64 });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al guardar la imagen' });
  }
};

// ── Redes sociales (CRUD) ─────────────────────────────────────────────────────

// GET /api/configuracion/redes
export const getRedes = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, nombre, tipo, url, activo, orden FROM redes_sociales_config ORDER BY orden ASC, id ASC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al obtener redes sociales' });
  }
};

// POST /api/configuracion/redes
export const createRed = async (req, res) => {
  const { nombre, tipo, url, activo = true } = req.body;
  if (!nombre?.trim() || !tipo?.trim()) {
    return res.status(400).json({ message: 'Nombre y tipo son obligatorios' });
  }
  try {
    const maxOrden = await pool.query(`SELECT COALESCE(MAX(orden), 0) AS m FROM redes_sociales_config`);
    const orden = parseInt(maxOrden.rows[0].m) + 1;
    const result = await pool.query(`
      INSERT INTO redes_sociales_config (nombre, tipo, url, activo, orden)
      VALUES ($1, $2, $3, $4, $5) RETURNING *
    `, [nombre.trim(), tipo.trim(), url?.trim() || null, activo, orden]);
    registrarAuditoria({
      id_usuario: req.usuario.id, nombre_usuario: req.usuario.nombre || req.usuario.username,
      accion: 'CREAR', modulo: 'Configuración', descripcion: `Red social "${nombre}" agregada`,
      ip: getIP(req), datos_nuevos: result.rows[0],
    });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al crear red social' });
  }
};

// PUT /api/configuracion/redes/:id
export const updateRed = async (req, res) => {
  const { id } = req.params;
  const { nombre, tipo, activo } = req.body;
  const urlProvided = 'url' in req.body;
  const urlVal = urlProvided ? (req.body.url?.trim() || null) : undefined;
  try {
    const prev = await pool.query(`SELECT * FROM redes_sociales_config WHERE id = $1`, [id]);
    if (!prev.rowCount) return res.status(404).json({ message: 'Red social no encontrada' });

    const result = await pool.query(`
      UPDATE redes_sociales_config
      SET nombre  = COALESCE($1, nombre),
          tipo    = COALESCE($2, tipo),
          url     = CASE WHEN $3 THEN $4 ELSE url END,
          activo  = COALESCE($5, activo)
      WHERE id = $6 RETURNING *
    `, [nombre?.trim() || null, tipo?.trim() || null, urlProvided, urlVal ?? null, activo ?? null, id]);

    registrarAuditoria({
      id_usuario: req.usuario.id, nombre_usuario: req.usuario.nombre || req.usuario.username,
      accion: 'EDITAR', modulo: 'Configuración',
      descripcion: `Red social #${id} "${result.rows[0].nombre}" actualizada`,
      ip: getIP(req), datos_anteriores: prev.rows[0], datos_nuevos: result.rows[0],
    });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al actualizar red social' });
  }
};

// PUT /api/configuracion/redes/orden  (batch reorder)
export const reordenarRedes = async (req, res) => {
  const { redes } = req.body;
  if (!Array.isArray(redes) || !redes.length)
    return res.status(400).json({ message: 'redes debe ser un array' });
  try {
    for (const { id, orden } of redes) {
      await pool.query(`UPDATE redes_sociales_config SET orden=$1 WHERE id=$2`, [orden, id]);
    }
    res.json({ message: 'Orden actualizado' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al reordenar' });
  }
};

// DELETE /api/configuracion/redes/:id
export const deleteRed = async (req, res) => {
  const { id } = req.params;
  try {
    const prev = await pool.query(`SELECT * FROM redes_sociales_config WHERE id = $1`, [id]);
    if (!prev.rowCount) return res.status(404).json({ message: 'Red social no encontrada' });
    await pool.query(`DELETE FROM redes_sociales_config WHERE id = $1`, [id]);
    registrarAuditoria({
      id_usuario: req.usuario.id, nombre_usuario: req.usuario.nombre || req.usuario.username,
      accion: 'ELIMINAR', modulo: 'Configuración',
      descripcion: `Red social "${prev.rows[0].nombre}" eliminada`,
      ip: getIP(req), datos_anteriores: prev.rows[0],
    });
    res.json({ message: 'Red social eliminada' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al eliminar red social' });
  }
};

// ── Banners web (CRUD) ────────────────────────────────────────────────────────

// fecha_fin: string ISO/datetime-local o vacío → NULL (indefinido)
const _parseFechaFin = (v) => {
  if (!v || !String(v).trim()) return null;
  const d = new Date(v);
  return isNaN(d.getTime()) ? null : d.toISOString();
};

// GET /api/configuracion/banners
export const getBanners = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, imagen, url, fecha_fin, principal, activo, orden FROM banners_config ORDER BY principal DESC, orden ASC, id ASC`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al obtener banners' });
  }
};

// GET /api/configuracion/banners/publico  (SIN AUTH — usado por volcano_web)
// Solo lectura: banners activos y vigentes, para pintar el carrusel de la home.
export const getBannersPublico = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, imagen, url, principal, orden
      FROM banners_config
      WHERE activo = TRUE AND (fecha_fin IS NULL OR fecha_fin > NOW())
      ORDER BY principal DESC, orden ASC, id ASC
    `);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al obtener banners' });
  }
};

// POST /api/configuracion/banners
export const createBanner = async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'La imagen del banner es obligatoria' });
  const mime = req.file.mimetype;
  if (!MIME_PERMITIDOS.has(mime)) {
    return res.status(422).json({ message: 'Solo se permiten imágenes en formato JPG o PNG' });
  }
  try {
    const imagen = `data:${mime};base64,${req.file.buffer.toString('base64')}`;
    const fechaFin = _parseFechaFin(req.body.fecha_fin);
    const url = req.body.url?.trim() || null;
    const activo = req.body.activo === undefined ? true : req.body.activo === 'true' || req.body.activo === true;
    const maxOrden = await pool.query(`SELECT COALESCE(MAX(orden), 0) AS m FROM banners_config`);
    const orden = parseInt(maxOrden.rows[0].m) + 1;
    const result = await pool.query(`
      INSERT INTO banners_config (imagen, url, fecha_fin, activo, orden)
      VALUES ($1, $2, $3, $4, $5) RETURNING id, imagen, url, fecha_fin, principal, activo, orden
    `, [imagen, url, fechaFin, activo, orden]);
    registrarAuditoria({
      id_usuario: req.usuario.id, nombre_usuario: req.usuario.nombre || req.usuario.username,
      accion: 'CREAR', modulo: 'Configuración',
      descripcion: `Banner #${result.rows[0].id} agregado`,
      ip: getIP(req), datos_nuevos: { id: result.rows[0].id, fecha_fin: fechaFin || 'Indefinido' },
    });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al crear banner' });
  }
};

// PUT /api/configuracion/banners/:id
export const updateBanner = async (req, res) => {
  const { id } = req.params;
  try {
    const prev = await pool.query(`SELECT id, fecha_fin FROM banners_config WHERE id = $1`, [id]);
    if (!prev.rowCount) return res.status(404).json({ message: 'Banner no encontrado' });

    const fechaFin = _parseFechaFin(req.body.fecha_fin);
    const url = 'url' in req.body ? (req.body.url?.trim() || null) : undefined;
    const activo = 'activo' in req.body ? (req.body.activo === 'true' || req.body.activo === true) : undefined;
    let imagen = null;
    if (req.file) {
      const mime = req.file.mimetype;
      if (!MIME_PERMITIDOS.has(mime)) {
        return res.status(422).json({ message: 'Solo se permiten imágenes en formato JPG o PNG' });
      }
      imagen = `data:${mime};base64,${req.file.buffer.toString('base64')}`;
    }

    const result = await pool.query(`
      UPDATE banners_config
      SET imagen    = COALESCE($1, imagen),
          fecha_fin = $2,
          url       = COALESCE($3, url),
          activo    = COALESCE($4, activo)
      WHERE id = $5 RETURNING id, imagen, url, fecha_fin, principal, activo, orden
    `, [imagen, fechaFin, url, activo, id]);

    registrarAuditoria({
      id_usuario: req.usuario.id, nombre_usuario: req.usuario.nombre || req.usuario.username,
      accion: 'EDITAR', modulo: 'Configuración', descripcion: `Banner #${id} actualizado`,
      ip: getIP(req),
      datos_anteriores: { id: prev.rows[0].id, fecha_fin: prev.rows[0].fecha_fin || 'Indefinido' },
      datos_nuevos: { id: result.rows[0].id, fecha_fin: result.rows[0].fecha_fin || 'Indefinido' },
    });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al actualizar banner' });
  }
};

// DELETE /api/configuracion/banners/:id
export const deleteBanner = async (req, res) => {
  const { id } = req.params;
  try {
    const prev = await pool.query(`SELECT id, fecha_fin FROM banners_config WHERE id = $1`, [id]);
    if (!prev.rowCount) return res.status(404).json({ message: 'Banner no encontrado' });
    await pool.query(`DELETE FROM banners_config WHERE id = $1`, [id]);
    registrarAuditoria({
      id_usuario: req.usuario.id, nombre_usuario: req.usuario.nombre || req.usuario.username,
      accion: 'ELIMINAR', modulo: 'Configuración', descripcion: `Banner #${id} eliminado`,
      ip: getIP(req),
      datos_anteriores: { id: prev.rows[0].id, fecha_fin: prev.rows[0].fecha_fin || 'Indefinido' },
    });
    res.json({ message: 'Banner eliminado' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al eliminar banner' });
  }
};

// PUT /api/configuracion/banners/orden  (batch reorder)
export const reordenarBanners = async (req, res) => {
  const { banners } = req.body;
  if (!Array.isArray(banners) || !banners.length)
    return res.status(400).json({ message: 'banners debe ser un array' });
  try {
    for (const { id, orden } of banners) {
      await pool.query(`UPDATE banners_config SET orden=$1 WHERE id=$2`, [orden, id]);
    }
    res.json({ message: 'Orden actualizado' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al reordenar banners' });
  }
};

// PUT /api/configuracion/banners/:id/principal
export const marcarBannerPrincipal = async (req, res) => {
  const { id } = req.params;
  const principal = req.body.principal !== false;  // por defecto true
  try {
    const prev = await pool.query(`SELECT id FROM banners_config WHERE id = $1`, [id]);
    if (!prev.rowCount) return res.status(404).json({ message: 'Banner no encontrado' });

    if (principal) {
      // Solo uno puede ser principal: marca este y desmarca el resto
      await pool.query(`UPDATE banners_config SET principal = (id = $1)`, [id]);
    } else {
      await pool.query(`UPDATE banners_config SET principal = FALSE WHERE id = $1`, [id]);
    }
    registrarAuditoria({
      id_usuario: req.usuario.id, nombre_usuario: req.usuario.nombre || req.usuario.username,
      accion: 'EDITAR', modulo: 'Configuración',
      descripcion: principal ? `Banner #${id} marcado como principal` : `Banner #${id} desmarcado como principal`,
      ip: getIP(req),
    });
    res.json({ message: principal ? 'Banner marcado como principal' : 'Banner desmarcado' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al marcar banner principal' });
  }
};
