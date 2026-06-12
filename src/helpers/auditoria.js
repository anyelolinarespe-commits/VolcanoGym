import { pool } from '../config/bd.js';

/**
 * Inserta un registro en la tabla auditoria.
 * Fire-and-forget: nunca lanza excepción para no bloquear la respuesta principal.
 *
 * @param {object} opts
 * @param {number}  opts.id_usuario
 * @param {string}  opts.nombre_usuario  - nombre completo del usuario
 * @param {'CREAR'|'EDITAR'|'ELIMINAR'|'LOGIN'|'LOGOUT'} opts.accion
 * @param {string}  opts.modulo          - nombre del módulo/entidad afectada
 * @param {string}  opts.descripcion     - detalle legible de la acción
 * @param {string}  [opts.ip]            - IP del cliente (opcional)
 */
export async function registrarAuditoria({ id_usuario, nombre_usuario, accion, modulo, descripcion, ip }) {
    try {
        await pool.query(
            `INSERT INTO auditoria (id_usuario, nombre_usuario, accion, modulo, descripcion, ip_usuario)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [id_usuario ?? null, nombre_usuario ?? 'Desconocido', accion, modulo, descripcion, ip ?? null]
        );
    } catch (err) {
        console.error('[Auditoría] Error al registrar:', err.message);
    }
}

/** Extrae la IP real del request (soporta proxy/load balancer) */
export function getIP(req) {
    return (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '').split(',')[0].trim() || null;
}
