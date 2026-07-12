// ══════════════════════════════════════════════════════════════════════════════
//  HELPER: motor de generación de alertas del módulo Notificaciones.
//  Solo GENERA filas pendientes en notificaciones_enviadas — el envío real
//  sigue siendo manual (botón WhatsApp en el dashboard, patrón ya usado en
//  Membresías). Reutilizado por el cron diario y por el endpoint manual
//  "generar-ahora".
// ══════════════════════════════════════════════════════════════════════════════

const VENTANA_ANTISPAM_DIAS = 7;

// Inserta una alerta pendiente si no existe una del mismo tipo+cliente dentro
// de la ventana anti-spam. Devuelve true si se creó, false si se saltó por
// duplicado o si el tipo no existe/está inactivo.
export async function generarAlerta(client, { idCliente, codigoTipo, variables, referenciaId = null }) {
    const tipo = await client.query(
        `SELECT id_tipo_notificacion, plantilla_texto FROM tipos_notificaciones WHERE codigo=$1 AND activo=TRUE`,
        [codigoTipo]
    );
    if (!tipo.rows.length) return false;
    const { id_tipo_notificacion, plantilla_texto } = tipo.rows[0];

    const existe = await client.query(`
        SELECT 1 FROM notificaciones_enviadas
        WHERE id_cliente=$1 AND id_tipo_notificacion=$2
          AND fecha_registro >= NOW() - ($3 || ' days')::interval
    `, [idCliente, id_tipo_notificacion, VENTANA_ANTISPAM_DIAS]);
    if (existe.rows.length) return false;

    let mensaje = plantilla_texto;
    for (const [k, v] of Object.entries(variables)) {
        mensaje = mensaje.replaceAll(`{${k}}`, String(v));
    }

    await client.query(`
        INSERT INTO notificaciones_enviadas (id_cliente, id_tipo_notificacion, mensaje, referencia_id, estado)
        VALUES ($1, $2, $3, $4, 1)
    `, [idCliente, id_tipo_notificacion, mensaje, referenciaId]);
    return true;
}
