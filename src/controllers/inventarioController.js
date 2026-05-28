import { pool } from '../config/bd.js';

// ══════════════════════════════════════════════════════════════════════════════
//  CONTROLLER: INVENTARIO
//  Usa las vistas: v_inventario_resumen, v_inventario_por_presentacion
//  Usa la función: fn_actualizar_stock_manual
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/inventario
// Vista general del módulo Inventario (tabla principal del dashboard)
export const getInventarioResumen = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                id_producto,
                producto,
                categoria,
                stock_minimo,
                stock_total,
                estado_stock,
                valor_total_inventario,
                ultima_actualizacion
            FROM v_inventario_resumen
        `);

        // Calcular KPIs para el header del módulo
        const total     = result.rows.length;
        const criticos  = result.rows.filter(r => r.estado_stock === 'CRÍTICO').length;
        const optimos   = result.rows.filter(r => r.estado_stock === 'ÓPTIMO').length;
        const valorTotal = result.rows.reduce(
            (sum, r) => sum + parseFloat(r.valor_total_inventario || 0), 0
        );

        res.json({
            kpis: {
                total_productos:  total,
                stock_critico:    criticos,
                stock_optimo:     optimos,
                valor_total:      valorTotal.toFixed(2)
            },
            productos: result.rows
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al obtener inventario' });
    }
};

// GET /api/inventario/:id_producto
// Detalle completo de un producto en inventario (modal "Ver inventario")
export const getInventarioByProducto = async (req, res) => {
    const { id_producto } = req.params;
    try {
        // Info general del producto
        const prod = await pool.query(`
            SELECT
                p.id_producto, p.nombre, p.descripcion, p.sku,
                p.marca, p.stock_minimo, p.estado,
                c.nombre AS categoria,
                COALESCE((
                    SELECT SUM(pp.stock_actual)
                    FROM producto_presentacion pp
                    WHERE pp.id_producto = p.id_producto AND pp.estado = 1
                ), 0)   AS stock_total,
                COALESCE((
                    SELECT SUM(pp.stock_actual * pp.precio_costo)
                    FROM producto_presentacion pp
                    WHERE pp.id_producto = p.id_producto AND pp.estado = 1
                ), 0)   AS valor_total_inventario,
                p.updated_at AS ultima_actualizacion
            FROM producto p
            JOIN categoria_producto c ON c.id_categoria = p.id_categoria
            WHERE p.id_producto = $1 AND p.estado != 2
        `, [id_producto]);

        if (prod.rowCount === 0)
            return res.status(404).json({ message: 'Producto no encontrado' });

        // Stock por presentación
        const pres = await pool.query(`
            SELECT * FROM v_inventario_por_presentacion
            WHERE id_producto = $1
        `, [id_producto]);

        // Historial de ventas del producto
        const ventas = await pool.query(`
            SELECT
                COUNT(*)                    AS total_ventas,
                COALESCE(SUM(
                    (vp.precio_unitario - COALESCE(pp.precio_costo, 0)) * vp.cantidad
                ), 0)                       AS ganancia_total,
                COALESCE(SUM(vp.cantidad), 0) AS unidades_vendidas
            FROM venta_producto vp
            LEFT JOIN producto_presentacion pp ON pp.id = vp.id_pp
            WHERE vp.id_producto = $1
        `, [id_producto]);

        // Últimas 10 ventas
        const ultimasVentas = await pool.query(`
            SELECT
                vp.created_at,
                COALESCE(c.nombre, 'Sin cliente')   AS cliente,
                pr.nombre                            AS presentacion,
                vp.cantidad,
                vp.precio_unitario,
                vp.total,
                (vp.precio_unitario - COALESCE(pp.precio_costo, 0)) * vp.cantidad AS ganancia
            FROM venta_producto vp
            LEFT JOIN cliente c ON c.id_cliente = vp.id_cliente
            LEFT JOIN producto_presentacion pp ON pp.id = vp.id_pp
            LEFT JOIN presentacion pr ON pr.id_presentacion = pp.id_presentacion
            WHERE vp.id_producto = $1
            ORDER BY vp.created_at DESC
            LIMIT 10
        `, [id_producto]);

        res.json({
            producto:        prod.rows[0],
            presentaciones:  pres.rows,
            stats_ventas:    ventas.rows[0],
            ultimas_ventas:  ultimasVentas.rows
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al obtener detalle de inventario' });
    }
};

// GET /api/inventario/presentacion/:id_pp
// Datos de una presentación específica para el modal "Actualizar Stock"
export const getPresentacionStock = async (req, res) => {
    const { id_pp } = req.params;
    try {
        const result = await pool.query(`
            SELECT * FROM v_inventario_por_presentacion WHERE id_pp = $1
        `, [id_pp]);

        if (result.rowCount === 0)
            return res.status(404).json({ message: 'Presentación no encontrada' });

        // Historial de movimientos
        const historial = await pool.query(`
            SELECT
                im.created_at       AS fecha,
                pr.nombre           AS presentacion,
                im.tipo,
                im.stock_antes,
                im.stock_despues,
                im.cantidad,
                im.boleta_ref,
                im.observacion,
                u.nombre            AS usuario
            FROM inventario_movimiento im
            JOIN producto_presentacion pp ON pp.id = im.id_pp
            JOIN presentacion pr ON pr.id_presentacion = pp.id_presentacion
            JOIN usuarios u ON u.id_usuario = im.id_usuario_reg
            WHERE im.id_pp = $1
            ORDER BY im.created_at DESC
            LIMIT 20
        `, [id_pp]);

        res.json({
            presentacion: result.rows[0],
            historial:    historial.rows
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al obtener datos de la presentación' });
    }
};

// GET /api/inventario/producto/:id_producto/presentaciones
// Todas las presentaciones de un producto con su stock (para modal Actualizar Stock)
export const getPresentacionesStock = async (req, res) => {
    const { id_producto } = req.params;
    try {
        // Info básica del producto
        const prod = await pool.query(`
            SELECT p.id_producto, p.nombre, p.stock_minimo,
                   COALESCE((
                       SELECT SUM(pp.stock_actual)
                       FROM producto_presentacion pp
                       WHERE pp.id_producto = p.id_producto AND pp.estado = 1
                   ), 0) AS stock_total
            FROM producto p
            WHERE p.id_producto = $1 AND p.estado != 2
        `, [id_producto]);

        if (prod.rowCount === 0)
            return res.status(404).json({ message: 'Producto no encontrado' });

        // Presentaciones con stock
        const pres = await pool.query(`
            SELECT * FROM v_inventario_por_presentacion
            WHERE id_producto = $1
            ORDER BY es_principal DESC, presentacion ASC
        `, [id_producto]);

        // Historial reciente del producto (todas sus presentaciones)
        const historial = await pool.query(`
            SELECT
                im.created_at       AS fecha,
                pr.nombre           AS presentacion,
                im.tipo,
                im.stock_antes,
                im.stock_despues,
                im.cantidad,
                im.boleta_ref,
                im.observacion,
                u.nombre            AS usuario
            FROM inventario_movimiento im
            JOIN producto_presentacion pp ON pp.id = im.id_pp
            JOIN presentacion pr ON pr.id_presentacion = pp.id_presentacion
            JOIN usuarios u ON u.id_usuario = im.id_usuario_reg
            WHERE pp.id_producto = $1
            ORDER BY im.created_at DESC
            LIMIT 30
        `, [id_producto]);

        res.json({
            producto:      prod.rows[0],
            presentaciones: pres.rows,
            historial:     historial.rows
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al obtener stock del producto' });
    }
};

// PUT /api/inventario/actualizar-stock
// Actualiza el stock de una presentación (ingreso, ajuste, devolución)
export const actualizarStock = async (req, res) => {
    const { id_pp, tipo, cantidad, boleta_ref, observacion } = req.body;

    if (!id_pp || !tipo || !cantidad)
        return res.status(400).json({ message: 'id_pp, tipo y cantidad son requeridos' });

    if (!['ingreso', 'ajuste', 'devolucion'].includes(tipo))
        return res.status(400).json({ message: 'Tipo inválido. Usa: ingreso, ajuste, devolucion' });

    if (Number(cantidad) <= 0)
        return res.status(400).json({ message: 'La cantidad debe ser mayor a 0' });

    try {
        // Usar la función de BD que maneja la lógica y crea el movimiento
        const result = await pool.query(
            `SELECT * FROM fn_actualizar_stock_manual($1, $2::tipo_movimiento_enum, $3, $4, $5, $6)`,
            [
                id_pp,
                tipo,
                Number(cantidad),
                boleta_ref   || null,
                observacion  || null,
                req.usuario.id
            ]
        );

        res.json({
            message:       'Stock actualizado correctamente',
            stock_antes:   result.rows[0].stock_antes,
            stock_despues: result.rows[0].stock_despues,
            id_movimiento: result.rows[0].id_movimiento
        });
    } catch (err) {
        console.error(err);
        // El error de la función de BD tiene mensajes claros, los retransmitimos
        res.status(400).json({ message: err.message?.split('\n')[0] || 'Error al actualizar stock' });
    }
};

// GET /api/inventario/movimientos
// Historial global de movimientos (para reportes)
export const getMovimientos = async (req, res) => {
    try {
        const { id_producto, tipo, fecha_inicio, fecha_fin, limit = 50 } = req.query;

        let where = [];
        let params = [];
        let i = 1;

        if (id_producto) {
            where.push(`pp.id_producto = $${i++}`);
            params.push(Number(id_producto));
        }
        if (tipo) {
            where.push(`im.tipo = $${i++}::tipo_movimiento_enum`);
            params.push(tipo);
        }
        if (fecha_inicio) {
            where.push(`im.created_at >= $${i++}`);
            params.push(fecha_inicio);
        }
        if (fecha_fin) {
            where.push(`im.created_at <= $${i++}`);
            params.push(fecha_fin + ' 23:59:59');
        }

        const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

        params.push(Number(limit));
        const result = await pool.query(`
            SELECT
                im.id_movimiento,
                im.created_at           AS fecha,
                p.nombre                AS producto,
                pr.nombre               AS presentacion,
                im.tipo,
                im.stock_antes,
                im.stock_despues,
                im.cantidad,
                im.boleta_ref,
                im.observacion,
                u.nombre                AS usuario
            FROM inventario_movimiento im
            JOIN producto_presentacion pp ON pp.id = im.id_pp
            JOIN producto p ON p.id_producto = pp.id_producto
            JOIN presentacion pr ON pr.id_presentacion = pp.id_presentacion
            JOIN usuarios u ON u.id_usuario = im.id_usuario_reg
            ${whereClause}
            ORDER BY im.created_at DESC
            LIMIT $${i}
        `, params);

        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al obtener movimientos' });
    }
};
