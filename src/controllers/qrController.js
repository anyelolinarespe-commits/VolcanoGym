import { pool } from '../config/bd.js';
import { registrarAuditoria, getIP } from '../helpers/auditoria.js';

// Tipos de QR permitidos y su etiqueta legible
const TIPOS_QR = {
  membresia: 'QR de Membresía',
  venta:     'QR de Venta',
};

const MIME_PERMITIDOS = new Set(['image/jpeg', 'image/jpg', 'image/png']);

// GET /api/qr  — lista ambos QR (panel de configuración)
export const getQrs = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id_qr, tipo, imagen, activo, descripcion, updated_at
         FROM qr_pago ORDER BY tipo`
    );
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al obtener los QR de pago' });
  }
};

// GET /api/qr/:tipo — devuelve el QR de un tipo (usado por las pantallas de cobro).
// La imagen solo se incluye si el QR está activo.
export const getQrPorTipo = async (req, res) => {
  const { tipo } = req.params;
  if (!TIPOS_QR[tipo]) return res.status(400).json({ message: 'Tipo de QR no válido' });
  try {
    const result = await pool.query(
      `SELECT tipo, imagen, activo FROM qr_pago WHERE tipo = $1`, [tipo]
    );
    if (!result.rowCount) return res.json({ tipo, imagen: null, activo: false });
    const row = result.rows[0];
    res.json({ tipo: row.tipo, activo: row.activo, imagen: row.activo ? row.imagen : null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al obtener el QR' });
  }
};

// POST /api/qr/:tipo/imagen — sube / reemplaza la imagen del QR
export const uploadQr = async (req, res) => {
  const { tipo } = req.params;
  const label = TIPOS_QR[tipo];
  if (!label) return res.status(400).json({ message: 'Tipo de QR no válido' });
  if (!req.file) return res.status(400).json({ message: 'No se recibió ningún archivo' });

  const mime = req.file.mimetype;
  if (!MIME_PERMITIDOS.has(mime)) {
    return res.status(422).json({ message: 'Solo se permiten imágenes en formato JPG o PNG' });
  }

  try {
    const base64 = `data:${mime};base64,${req.file.buffer.toString('base64')}`;
    const result = await pool.query(`
      INSERT INTO qr_pago (tipo, imagen, modificado_por, updated_at)
      VALUES ($1, $2, $3, NOW())
      ON CONFLICT (tipo) DO UPDATE SET imagen = $2, modificado_por = $3, updated_at = NOW()
      RETURNING id_qr, tipo, imagen, activo
    `, [tipo, base64, req.usuario.id]);
    registrarAuditoria({
      id_usuario: req.usuario.id, nombre_usuario: req.usuario.nombre || req.usuario.username,
      accion: 'EDITAR', modulo: 'Configuración', descripcion: `${label} actualizado`, ip: getIP(req),
    });
    res.json({ message: `${label} actualizado`, ...result.rows[0] });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al guardar el QR' });
  }
};

// PUT /api/qr/:tipo — activar / desactivar el QR
export const toggleQr = async (req, res) => {
  const { tipo } = req.params;
  const label = TIPOS_QR[tipo];
  if (!label) return res.status(400).json({ message: 'Tipo de QR no válido' });
  const activo = req.body.activo === true || req.body.activo === 'true';
  try {
    const result = await pool.query(`
      UPDATE qr_pago SET activo = $1, modificado_por = $2, updated_at = NOW()
      WHERE tipo = $3 RETURNING id_qr, tipo, imagen, activo
    `, [activo, req.usuario.id, tipo]);
    if (!result.rowCount) return res.status(404).json({ message: 'QR no encontrado' });
    registrarAuditoria({
      id_usuario: req.usuario.id, nombre_usuario: req.usuario.nombre || req.usuario.username,
      accion: 'EDITAR', modulo: 'Configuración',
      descripcion: `${label} ${activo ? 'activado' : 'desactivado'}`, ip: getIP(req),
    });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al actualizar el QR' });
  }
};
