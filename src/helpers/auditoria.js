import { pool } from '../config/bd.js';

/**
 * Inserta un registro en la tabla auditoria.
 * Fire-and-forget: nunca lanza excepción para no bloquear la respuesta principal.
 *
 * @param {object} opts
 * @param {number}  opts.id_usuario
 * @param {string}  opts.nombre_usuario
 * @param {'CREAR'|'EDITAR'|'ELIMINAR'|'LOGIN'|'LOGOUT'} opts.accion
 * @param {string}  opts.modulo
 * @param {string}  opts.descripcion
 * @param {string}  [opts.ip]
 * @param {object}  [opts.datos_anteriores] - JSONB con valores antes del cambio
 * @param {object}  [opts.datos_nuevos]     - JSONB con valores después del cambio
 */
export async function registrarAuditoria({
    id_usuario, nombre_usuario, accion, modulo, descripcion, ip,
    datos_anteriores = null,
    datos_nuevos     = null,
}) {
    try {
        await pool.query(
            `INSERT INTO auditoria
               (id_usuario, nombre_usuario, accion, modulo, descripcion, ip_usuario,
                datos_anteriores, datos_nuevos)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
                id_usuario ?? null,
                nombre_usuario ?? 'Desconocido',
                accion, modulo, descripcion,
                ip ?? null,
                datos_anteriores ? JSON.stringify(datos_anteriores) : null,
                datos_nuevos     ? JSON.stringify(datos_nuevos)     : null,
            ]
        );
    } catch (err) {
        console.error('[Auditoría] Error al registrar:', err.message);
    }
}

/** Extrae la IP real del request (soporta proxy/load balancer) */
export function getIP(req) {
    return (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim() || null;
}
