import { pool } from '../config/bd.js';
import { generarAlerta } from '../helpers/notificaciones.js';

// ══════════════════════════════════════════════════════════════════════════════
//  JOB: generación diaria de alertas (Notificaciones).
//  Genérico por "evento": la regla de disparo (qué evento, con qué offset de
//  días) vive en tipos_notificaciones (columnas regla_evento/regla_dias_offset),
//  no hardcodeada aquí. Así un tipo creado desde la UI puede tener disparo
//  automático sin tocar este archivo — solo se soportan los 3 eventos con
//  datos reales disponibles hoy.
// ══════════════════════════════════════════════════════════════════════════════

const EVALUADORES_EVENTO = {
    async vencimiento_membresia(client, tipo) {
        const { rows } = await client.query(`
            SELECT m.id_membresia, m.id_cliente, m.fecha_fin,
                   c.nombre || ' ' || c.apellido AS nombre_cliente
            FROM membresia m
            JOIN cliente c ON c.id_cliente = m.id_cliente
            WHERE m.estado IN ('activa','vencida') AND c.deleted_at IS NULL
              AND m.fecha_fin::date = (CURRENT_DATE + ($1 || ' days')::interval)::date
        `, [tipo.regla_dias_offset]);
        return rows.map(r => ({
            idCliente: r.id_cliente,
            referenciaId: r.id_membresia,
            variables: {
                nombre: r.nombre_cliente,
                fecha_fin: new Date(r.fecha_fin).toLocaleDateString('es-PE', { timeZone: 'America/Lima' }),
            },
        }));
    },

    async cumpleanos(client) {
        const { rows } = await client.query(`
            SELECT id_cliente, nombre || ' ' || apellido AS nombre_cliente
            FROM cliente
            WHERE deleted_at IS NULL AND fecha_nacimiento IS NOT NULL
              AND EXTRACT(MONTH FROM fecha_nacimiento) = EXTRACT(MONTH FROM CURRENT_DATE)
              AND EXTRACT(DAY FROM fecha_nacimiento) = EXTRACT(DAY FROM CURRENT_DATE)
        `);
        return rows.map(r => ({ idCliente: r.id_cliente, variables: { nombre: r.nombre_cliente } }));
    },

    async deuda_pendiente(client) {
        const { rows } = await client.query(`
            SELECT m.id_membresia, m.id_cliente, m.saldo_pendiente,
                   c.nombre || ' ' || c.apellido AS nombre_cliente
            FROM membresia m
            JOIN cliente c ON c.id_cliente = m.id_cliente
            WHERE m.estado = 'activa' AND m.saldo_pendiente > 0 AND c.deleted_at IS NULL
        `);
        return rows.map(r => ({
            idCliente: r.id_cliente,
            referenciaId: r.id_membresia,
            variables: { nombre: r.nombre_cliente, monto: Number(r.saldo_pendiente).toFixed(2) },
        }));
    },
};

// Devuelve un objeto { codigo_tipo: cantidad_generada } dinámico — no una
// forma fija — porque el conjunto de tipos automáticos puede crecer sin
// tocar este archivo.
export async function ejecutarGeneracionDiaria() {
    const client = await pool.connect();
    const resumen = {};
    try {
        const { rows: tipos } = await client.query(`
            SELECT id_tipo_notificacion, codigo, regla_evento, regla_dias_offset
            FROM tipos_notificaciones
            WHERE activo = TRUE AND regla_evento != 'manual'
        `);

        for (const tipo of tipos) {
            const evaluador = EVALUADORES_EVENTO[tipo.regla_evento];
            if (!evaluador) continue; // regla_evento desconocida — el CHECK de BD ya lo previene, defensivo igual

            const destinatarios = await evaluador(client, tipo);
            let creadas = 0;
            for (const d of destinatarios) {
                const ok = await generarAlerta(client, {
                    idCliente: d.idCliente,
                    codigoTipo: tipo.codigo,
                    referenciaId: d.referenciaId,
                    variables: d.variables,
                });
                if (ok) creadas++;
            }
            resumen[tipo.codigo] = creadas;
        }

        return resumen;
    } finally {
        client.release();
    }
}

// Purga registros ya resueltos (enviado=2 o descartado=0) con más de 6 meses.
// Las pendientes (estado=1) nunca se purgan automáticamente.
export async function purgarNotificacionesViejas() {
    const result = await pool.query(`
        DELETE FROM notificaciones_enviadas
        WHERE estado IN (0, 2) AND fecha_registro < CURRENT_DATE - INTERVAL '6 months'
    `);
    return result.rowCount;
}
