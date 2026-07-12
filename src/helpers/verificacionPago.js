// ══════════════════════════════════════════════════════════════════════════════
//  HELPER compartido entre Ventas y Membresías: `verificacion_pago` sirve a
//  ambos orígenes (id_venta XOR id_pago). Un código de operación de
//  Yape/Plin/Transferencia ocupa el mismo espacio de nombres sin importar si
//  respalda una venta o un pago de membresía — no debería poder usarse dos
//  veces entre ambos módulos.
// ══════════════════════════════════════════════════════════════════════════════

// Busca si un código de operación ya está en uso (pendiente o aprobado),
// sin importar el origen. Devuelve { numero_venta } o { id_membresia } según
// corresponda, o null si no hay conflicto.
export async function buscarOperacionDuplicada(client, metodo_pago, numero_operacion) {
  const { rows } = await client.query(`
    SELECT v.numero_venta, pg.id_membresia
    FROM verificacion_pago vp
    LEFT JOIN venta v ON v.id = vp.id_venta
    LEFT JOIN pago  pg ON pg.id_pago = vp.id_pago
    WHERE vp.metodo_pago = $1 AND vp.numero_operacion = $2 AND vp.estado IN (1,2)
    LIMIT 1
  `, [metodo_pago, numero_operacion]);
  return rows[0] || null;
}

// Texto legible para el mensaje de error de duplicado.
export function describirOrigenDuplicado(dup) {
  return dup.numero_venta ? `la venta ${dup.numero_venta}` : `la membresía #${dup.id_membresia}`;
}
