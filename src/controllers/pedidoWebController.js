import { pool } from '../config/bd.js';
import { getIO } from '../realtime.js';

// ══════════════════════════════════════════════════════════════════════════════
//  CONTROLLER: PEDIDOS WEB (pre-registro público desde el catálogo)
// ══════════════════════════════════════════════════════════════════════════════

// POST /api/pedidos-web  (público, sin autenticación)
export const crearPedidoWeb = async (req, res) => {
  try {
    const { id_pp, cantidad = 1, nombre, celular } = req.body;

    const idPp = parseInt(id_pp, 10);
    if (!Number.isInteger(idPp) || idPp <= 0)
      return res.status(400).json({ message: 'Producto inválido' });

    const cant = parseInt(cantidad, 10);
    const cantidadFinal = Number.isInteger(cant) && cant > 0 ? cant : 1;

    const nombreCliente = (nombre || '').trim();
    const celularCliente = (celular || '').trim();
    if (!nombreCliente) return res.status(400).json({ message: 'El nombre es requerido' });
    if (!celularCliente) return res.status(400).json({ message: 'El celular es requerido' });

    const prod = await pool.query(`
      SELECT pp.precio_venta, pp.stock_actual,
             p.nombre||' ('||pr.nombre||')' AS snap
      FROM producto_presentacion pp
      JOIN producto p ON p.id_producto = pp.id_producto
      JOIN presentacion pr ON pr.id_presentacion = pp.id_presentacion
      WHERE pp.id = $1
    `, [idPp]);
    if (!prod.rows.length)
      return res.status(404).json({ message: 'Producto no encontrado' });

    const { precio_venta, stock_actual, snap } = prod.rows[0];
    if (cantidadFinal > stock_actual)
      return res.status(400).json({
        message: stock_actual > 0
          ? `Solo quedan ${stock_actual} unidades disponibles de "${snap}"`
          : `"${snap}" no tiene stock disponible por ahora`
      });

    const codR = await pool.query(`SELECT 'PW-' || lpad(nextval('pedido_web_codigo_seq')::text, 6, '0') AS codigo`);
    const codigoPedido = codR.rows[0].codigo;

    await pool.query(`
      INSERT INTO pedido_web
        (codigo_pedido, id_pp, nombre_snapshot, precio_snapshot, cantidad, nombre_cliente, celular)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
    `, [codigoPedido, idPp, snap, precio_venta, cantidadFinal, nombreCliente, celularCliente]);

    const total = parseFloat((Number(precio_venta) * cantidadFinal).toFixed(2));

    getIO()?.to('verificacion').emit('nuevo-pedido-web', {
      codigo_pedido: codigoPedido,
      nombre_snapshot: snap,
      nombre_cliente: nombreCliente,
      celular: celularCliente,
      cantidad: cantidadFinal,
      total,
    });

    res.status(201).json({
      codigo_pedido: codigoPedido,
      nombre_snapshot: snap,
      precio: Number(precio_venta),
      cantidad: cantidadFinal,
      total,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error al registrar el pedido' });
  }
};
