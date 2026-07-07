import { pool } from '../config/bd.js';
import { ejecutarGeneracionDiaria } from '../jobs/notificacionesJob.js';
import { generarAlerta } from '../helpers/notificaciones.js';

const EVENTOS_VALIDOS = ['vencimiento_membresia', 'cumpleanos', 'deuda_pendiente', 'manual'];
const CODIGOS_SISTEMA = ['vencimiento_7d', 'vencimiento_3d', 'vencimiento_hoy', 'cumpleanos', 'deuda'];

// ══════════════════════════════════════════════════════════════════════════════
//  CONTROLLER: NOTIFICACIONES
//  Panel de alertas generadas por el cron/job: el staff las revisa y las
//  despacha manualmente (botón WhatsApp en el frontend), luego se marcan como
//  enviadas o descartadas aquí.
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/notificaciones/pendientes
export const getPendientes = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT n.id_notificacion, n.mensaje, n.referencia_id, n.fecha_registro,
                   t.codigo AS tipo_codigo, t.nombre AS tipo_nombre,
                   c.id_cliente, c.nombre || ' ' || c.apellido AS nombre_cliente, c.celular
            FROM notificaciones_enviadas n
            JOIN tipos_notificaciones t ON t.id_tipo_notificacion = n.id_tipo_notificacion
            JOIN cliente c ON c.id_cliente = n.id_cliente
            WHERE n.estado = 1
            ORDER BY n.fecha_registro DESC
        `);
        res.json({ total: result.rows.length, data: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al obtener notificaciones pendientes' });
    }
};

// PUT /api/notificaciones/:id/enviar
export const marcarEnviada = async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(`
            UPDATE notificaciones_enviadas SET estado = 2, fecha_enviado = NOW()
            WHERE id_notificacion = $1 AND estado = 1
            RETURNING *
        `, [id]);
        if (!result.rows.length) return res.status(404).json({ message: 'Notificación no encontrada o ya procesada' });
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al marcar notificación como enviada' });
    }
};

// PUT /api/notificaciones/:id/descartar
export const descartarNotificacion = async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(`
            UPDATE notificaciones_enviadas SET estado = 0
            WHERE id_notificacion = $1 AND estado = 1
            RETURNING *
        `, [id]);
        if (!result.rows.length) return res.status(404).json({ message: 'Notificación no encontrada o ya procesada' });
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al descartar notificación' });
    }
};

// POST /api/notificaciones/generar-ahora
export const generarAhora = async (req, res) => {
    try {
        const resumen = await ejecutarGeneracionDiaria();
        res.json({ message: 'Generación ejecutada', resumen });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al generar notificaciones' });
    }
};

// GET /api/notificaciones/cliente/:id
// Historial de notificaciones de un cliente específico (para su ficha).
export const getHistorialCliente = async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(`
            SELECT n.id_notificacion, n.mensaje, n.estado, n.fecha_registro, n.fecha_enviado,
                   t.nombre AS tipo_nombre
            FROM notificaciones_enviadas n
            JOIN tipos_notificaciones t ON t.id_tipo_notificacion = n.id_tipo_notificacion
            WHERE n.id_cliente = $1
            ORDER BY n.fecha_registro DESC
            LIMIT 20
        `, [id]);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al obtener historial de notificaciones del cliente' });
    }
};

// ── CRUD de tipos de notificación (catálogo + regla de disparo) ─────────────

// GET /api/notificaciones/tipos
export const getTipos = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id_tipo_notificacion, codigo, nombre, plantilla_texto, activo,
                   regla_evento, regla_dias_offset,
                   codigo = ANY($1) AS es_sistema
            FROM tipos_notificaciones ORDER BY id_tipo_notificacion
        `, [CODIGOS_SISTEMA]);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al obtener tipos de notificación' });
    }
};

// POST /api/notificaciones/tipos
// Tipo nuevo: el código se genera a partir del nombre (slug), único.
export const createTipo = async (req, res) => {
    const { nombre, plantilla_texto, regla_evento = 'manual', regla_dias_offset } = req.body;
    if (!nombre?.trim() || !plantilla_texto?.trim())
        return res.status(400).json({ message: 'Nombre y plantilla de texto son obligatorios' });
    if (!EVENTOS_VALIDOS.includes(regla_evento))
        return res.status(400).json({ message: 'Regla de evento inválida' });
    if (regla_evento === 'vencimiento_membresia' && (regla_dias_offset === undefined || regla_dias_offset === null || regla_dias_offset === ''))
        return res.status(400).json({ message: 'Debes indicar los días de offset para una regla de vencimiento' });
    const offset = regla_evento === 'vencimiento_membresia' ? Number(regla_dias_offset) : null;

    try {
        let codigo = nombre.trim().toLowerCase()
            .normalize('NFD').replace(/[̀-ͯ]/g, '')
            .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
        if (!codigo) codigo = 'tipo';
        const existe = await pool.query(`SELECT 1 FROM tipos_notificaciones WHERE codigo LIKE $1`, [`${codigo}%`]);
        if (existe.rows.length) codigo = `${codigo}_${existe.rows.length + 1}`;

        const result = await pool.query(`
            INSERT INTO tipos_notificaciones (codigo, nombre, plantilla_texto, activo, regla_evento, regla_dias_offset)
            VALUES ($1, $2, $3, TRUE, $4, $5) RETURNING *
        `, [codigo, nombre.trim(), plantilla_texto.trim(), regla_evento, offset]);
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al crear tipo de notificación' });
    }
};

// PUT /api/notificaciones/tipos/:id
// Siempre editable: nombre, plantilla_texto, activo. La regla (evento+offset)
// solo es editable si el tipo NO es de sistema (los 5 de sistema conservan
// su regla fija, usada de forma hardcodeada por notificacionesJob.js).
export const updateTipo = async (req, res) => {
    const { id } = req.params;
    const { nombre, plantilla_texto, activo, regla_evento, regla_dias_offset } = req.body;
    if (!plantilla_texto?.trim()) return res.status(400).json({ message: 'La plantilla de texto es obligatoria' });
    try {
        const actual = await pool.query(`SELECT codigo FROM tipos_notificaciones WHERE id_tipo_notificacion=$1`, [id]);
        if (!actual.rows.length) return res.status(404).json({ message: 'Tipo de notificación no encontrado' });
        const esSistema = CODIGOS_SISTEMA.includes(actual.rows[0].codigo);

        let result;
        if (esSistema) {
            result = await pool.query(`
                UPDATE tipos_notificaciones
                SET nombre = COALESCE($1, nombre), plantilla_texto = $2, activo = COALESCE($3, activo)
                WHERE id_tipo_notificacion = $4
                RETURNING *
            `, [nombre?.trim() || null, plantilla_texto.trim(), activo, id]);
        } else {
            if (regla_evento && !EVENTOS_VALIDOS.includes(regla_evento))
                return res.status(400).json({ message: 'Regla de evento inválida' });
            const offset = regla_evento === 'vencimiento_membresia' ? Number(regla_dias_offset) : null;
            result = await pool.query(`
                UPDATE tipos_notificaciones
                SET nombre = COALESCE($1, nombre), plantilla_texto = $2, activo = COALESCE($3, activo),
                    regla_evento = COALESCE($4, regla_evento), regla_dias_offset = $5
                WHERE id_tipo_notificacion = $6
                RETURNING *
            `, [nombre?.trim() || null, plantilla_texto.trim(), activo, regla_evento || null, offset, id]);
        }
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al actualizar tipo de notificación' });
    }
};

// DELETE /api/notificaciones/tipos/:id
// Borrado lógico (activo=false). Bloqueado para los 5 tipos de sistema
// (romperían el cron); el historial generado por el tipo se conserva.
export const deleteTipo = async (req, res) => {
    const { id } = req.params;
    try {
        const tipo = await pool.query(`SELECT codigo FROM tipos_notificaciones WHERE id_tipo_notificacion=$1`, [id]);
        if (!tipo.rows.length) return res.status(404).json({ message: 'Tipo de notificación no encontrado' });
        if (CODIGOS_SISTEMA.includes(tipo.rows[0].codigo)) {
            return res.status(409).json({ message: 'No se puede eliminar un tipo de sistema. Puedes desactivarlo en su lugar.' });
        }
        await pool.query(`UPDATE tipos_notificaciones SET activo = FALSE WHERE id_tipo_notificacion=$1`, [id]);
        res.json({ message: 'Tipo de notificación desactivado' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al eliminar tipo de notificación' });
    }
};

// ── Envío manual ──────────────────────────────────────────────────────────────

// POST /api/notificaciones/enviar-manual
// body: { id_tipo_notificacion, destino: 'todos'|'filtro'|'cliente', filtro?, id_cliente? }
export const enviarManual = async (req, res) => {
    const { id_tipo_notificacion, destino, filtro, id_cliente } = req.body;
    if (!id_tipo_notificacion || !destino) return res.status(400).json({ message: 'Tipo y destino son obligatorios' });

    const client = await pool.connect();
    try {
        const tipoRes = await client.query(`SELECT codigo FROM tipos_notificaciones WHERE id_tipo_notificacion=$1 AND activo=TRUE`, [id_tipo_notificacion]);
        if (!tipoRes.rows.length) return res.status(404).json({ message: 'Tipo de notificación no encontrado o inactivo' });
        const codigo = tipoRes.rows[0].codigo;

        let clientesQuery;
        if (destino === 'cliente' && id_cliente) {
            clientesQuery = await client.query(
                `SELECT id_cliente, nombre || ' ' || apellido AS nombre_cliente FROM cliente WHERE id_cliente=$1 AND deleted_at IS NULL`, [id_cliente]);
        } else if (destino === 'filtro' && filtro === 'con_deuda') {
            clientesQuery = await client.query(`
                SELECT DISTINCT c.id_cliente, c.nombre || ' ' || c.apellido AS nombre_cliente
                FROM cliente c JOIN membresia m ON m.id_cliente=c.id_cliente
                WHERE c.deleted_at IS NULL AND m.estado='activa' AND m.saldo_pendiente > 0`);
        } else {
            clientesQuery = await client.query(`
                SELECT DISTINCT c.id_cliente, c.nombre || ' ' || c.apellido AS nombre_cliente
                FROM cliente c JOIN membresia m ON m.id_cliente=c.id_cliente
                WHERE c.deleted_at IS NULL AND m.estado='activa'`);
        }

        let creadas = 0;
        for (const r of clientesQuery.rows) {
            const ok = await generarAlerta(client, {
                idCliente: r.id_cliente, codigoTipo: codigo,
                variables: { nombre: r.nombre_cliente },
            });
            if (ok) creadas++;
        }
        res.json({ message: `${creadas} notificación(es) generada(s)`, creadas, total_evaluados: clientesQuery.rows.length });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al enviar notificación manual' });
    } finally {
        client.release();
    }
};

// ── Historial + restaurar ────────────────────────────────────────────────────

// GET /api/notificaciones/historial?estado=1|2|0
export const getHistorial = async (req, res) => {
    const estado = ['0', '1', '2'].includes(req.query.estado) ? Number(req.query.estado) : 1;
    try {
        const result = await pool.query(`
            SELECT n.id_notificacion, n.mensaje, n.referencia_id, n.fecha_registro, n.fecha_enviado,
                   t.codigo AS tipo_codigo, t.nombre AS tipo_nombre,
                   c.id_cliente, c.nombre || ' ' || c.apellido AS nombre_cliente, c.celular
            FROM notificaciones_enviadas n
            JOIN tipos_notificaciones t ON t.id_tipo_notificacion = n.id_tipo_notificacion
            JOIN cliente c ON c.id_cliente = n.id_cliente
            WHERE n.estado = $1
            ORDER BY COALESCE(n.fecha_enviado, n.fecha_registro) DESC
            LIMIT 100
        `, [estado]);
        res.json({ total: result.rows.length, data: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al obtener historial de notificaciones' });
    }
};

// PUT /api/notificaciones/:id/restaurar
// Usado tanto para "Restaurar" (descartadas) como "Reenviar" (enviadas) —
// vuelve la fila a estado=1 y limpia fecha_enviado. Al reaparecer en
// Pendientes, el celular usado será el ACTUAL del cliente (JOIN en vivo).
export const restaurarNotificacion = async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(`
            UPDATE notificaciones_enviadas SET estado = 1, fecha_enviado = NULL
            WHERE id_notificacion = $1 AND estado IN (0, 2)
            RETURNING *
        `, [id]);
        if (!result.rows.length) return res.status(404).json({ message: 'Notificación no encontrada o ya está pendiente' });
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al restaurar notificación' });
    }
};
