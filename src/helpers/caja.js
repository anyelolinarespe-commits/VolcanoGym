// ══════════════════════════════════════════════════════════════════════════════
//  HELPER: enganche entre Ventas y el módulo Caja.
//  Se usa dentro de la misma transacción de ventasController y de cajaController
//  para evitar un import controller→controller.
// ══════════════════════════════════════════════════════════════════════════════

// Sesión de caja actualmente abierta para un cajero (o null si no tiene una).
export async function getSesionAbiertaUsuario(client, idUsuario) {
    const { rows } = await client.query(
        `SELECT * FROM sesiones_caja WHERE id_usuario = $1 AND estado = 1 LIMIT 1`,
        [idUsuario]
    );
    return rows[0] || null;
}

// Registra un movimiento 'VENTA' en la sesión abierta del cajero que confirma
// el pago. Si no tiene sesión abierta, no hace nada: las ventas funcionan
// igual sin depender del módulo Caja.
export async function registrarVentaEnCaja(client, { idUsuario, monto, metodoPago, concepto, numeroVenta }) {
    const sesion = await getSesionAbiertaUsuario(client, idUsuario);
    if (!sesion) return;

    await client.query(`
        INSERT INTO movimientos_caja
          (id_sesion, tipo_movimiento, monto, metodo_pago, categoria, concepto, nro_comprobante)
        VALUES ($1, 'VENTA', $2, $3, 'Ventas', $4, $5)
    `, [sesion.id_sesion, monto, metodoPago, concepto, numeroVenta]);
}

// Anula todos los movimientos 'VENTA' asociados a una venta (por su número),
// usado cuando la venta se anula. No falla si no hay movimientos (venta sin
// sesión de caja abierta al momento de confirmarse).
export async function anularVentaEnCaja(client, numeroVenta) {
    await client.query(`
        UPDATE movimientos_caja
        SET estado = 0
        WHERE nro_comprobante = $1 AND tipo_movimiento = 'VENTA' AND estado = 1
    `, [numeroVenta]);
}
