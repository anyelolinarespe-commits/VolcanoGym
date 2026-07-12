import { pool } from '../config/bd.js';
import { registrarAuditoria, getIP } from '../helpers/auditoria.js';

// ══════════════════════════════════════════════════════════════════════════════
//  CONTROLLER: INVENTARIO
//  Usa las vistas: v_inventario_resumen, v_inventario_por_presentacion
//  Actualiza stock via transacción directa (evita ambigüedad en fn_actualizar_stock_manual)
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/inventario
// Vista general del módulo Inventario (tabla principal del dashboard)
export const getInventarioResumen = async (req, res) => {
    try {
        const { q, id, filtro_stock, page, limit } = req.query;
        const pageNum  = Math.max(1, parseInt(page)  || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 25));
        const offset   = (pageNum - 1) * limitNum;

        const conds  = [];
        const params = [];
        let i = 1;

        if (id !== undefined) {
            const idNum = parseInt(id, 10);
            if (Number.isInteger(idNum) && idNum > 0) {
                conds.push(`id_producto = $${i++}`);
                params.push(idNum);
            }
        } else if (q) {
            conds.push(`(LOWER(producto) LIKE $${i} OR LOWER(categoria) LIKE $${i})`);
            params.push(`%${q.toLowerCase()}%`);
            i++;
        }
        if (filtro_stock === 'critico') conds.push(`estado_stock = 'CRÍTICO'`);
        if (filtro_stock === 'optimo')  conds.push(`estado_stock = 'ÓPTIMO'`);

        const whereStr = conds.length ? 'WHERE ' + conds.join(' AND ') : '';

        const [kpiRes, countRes, dataRes] = await Promise.all([
            pool.query(`
                SELECT
                    COUNT(*)                                                 AS total,
                    COUNT(*) FILTER (WHERE estado_stock = 'CRÍTICO')        AS criticos,
                    COUNT(*) FILTER (WHERE estado_stock = 'ÓPTIMO')         AS optimos,
                    COALESCE(SUM(valor_total_inventario), 0)                AS valor_total
                FROM v_inventario_resumen
            `),
            pool.query(`SELECT COUNT(*) FROM v_inventario_resumen ${whereStr}`, params),
            pool.query(`
                SELECT id_producto, producto, categoria, stock_minimo,
                       stock_total, estado_stock, valor_total_inventario, ultima_actualizacion
                FROM v_inventario_resumen
                ${whereStr}
                ORDER BY estado_stock DESC, producto
                LIMIT $${i} OFFSET $${i + 1}
            `, [...params, limitNum, offset])
        ]);

        const kpi   = kpiRes.rows[0];
        const total = parseInt(countRes.rows[0].count);

        res.json({
            kpis: {
                total_productos: parseInt(kpi.total),
                stock_critico:   parseInt(kpi.criticos),
                stock_optimo:    parseInt(kpi.optimos),
                valor_total:     parseFloat(kpi.valor_total).toFixed(2)
            },
            data:  dataRes.rows,
            total,
            page:  pageNum,
            pages: Math.ceil(total / limitNum),
            limit: limitNum,
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

        // Historial de ventas del producto (desde venta_detalle)
        const ventas = await pool.query(`
            SELECT
                COUNT(DISTINCT vd.id_venta)          AS total_ventas,
                COALESCE(SUM(
                    (vd.precio_unitario - COALESCE(pp.precio_costo, 0)) * vd.cantidad
                ), 0)                                AS ganancia_total,
                COALESCE(SUM(vd.cantidad), 0)        AS unidades_vendidas
            FROM venta_detalle vd
            JOIN producto_presentacion pp ON pp.id = vd.id_pp
            JOIN venta v ON v.id = vd.id_venta
            WHERE pp.id_producto = $1
              AND v.estado_venta != 'anulada'
        `, [id_producto]);

        // Últimas 10 ventas (desde venta_detalle)
        const ultimasVentas = await pool.query(`
            SELECT
                v.created_at,
                CASE WHEN v.id_cliente IS NOT NULL
                     THEN c.nombre || ' ' || c.apellido
                     ELSE COALESCE(v.nombre_cliente_libre, 'Sin cliente') END AS cliente,
                pr.nombre                                                      AS presentacion,
                vd.cantidad,
                vd.precio_unitario,
                vd.subtotal                                                    AS total,
                (vd.precio_unitario - COALESCE(pp.precio_costo, 0)) * vd.cantidad AS ganancia
            FROM venta_detalle vd
            JOIN venta v ON v.id = vd.id_venta
            LEFT JOIN cliente c ON c.id_cliente = v.id_cliente
            JOIN producto_presentacion pp ON pp.id = vd.id_pp
            JOIN presentacion pr ON pr.id_presentacion = pp.id_presentacion
            WHERE pp.id_producto = $1
              AND v.estado_venta != 'anulada'
            ORDER BY v.created_at DESC
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
// Actualiza el stock de una presentación (ingreso, ajuste, salida)
export const actualizarStock = async (req, res) => {
    const { id_pp, tipo, cantidad, boleta_ref, observacion } = req.body;

    if (!id_pp || !tipo || !cantidad)
        return res.status(400).json({ message: 'id_pp, tipo y cantidad son requeridos' });

    if (!['ingreso', 'ajuste', 'salida'].includes(tipo))
        return res.status(400).json({ message: 'Tipo inválido. Usa: ingreso, ajuste, salida' });

    if (Number(cantidad) <= 0)
        return res.status(400).json({ message: 'La cantidad debe ser mayor a 0' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const lockRes = await client.query(
            `SELECT stock_actual FROM producto_presentacion WHERE id = $1 FOR UPDATE`,
            [id_pp]
        );
        if (lockRes.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Presentación no encontrada' });
        }

        const stockAntes   = lockRes.rows[0].stock_actual;
        const delta        = tipo === 'salida' ? -Number(cantidad) : Number(cantidad);
        const stockDespues = tipo === 'ajuste' ? Number(cantidad) : stockAntes + delta;

        if (stockDespues < 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                message: `Stock insuficiente. Stock actual: ${stockAntes}, cantidad solicitada: ${Number(cantidad)}.`
            });
        }

        await client.query(
            `UPDATE producto_presentacion SET stock_actual = $1 WHERE id = $2`,
            [stockDespues, id_pp]
        );

        const movRes = await client.query(
            `INSERT INTO inventario_movimiento
                (id_pp, id_usuario_reg, tipo, stock_antes, stock_despues, cantidad, boleta_ref, observacion)
             VALUES ($1, $2, $3::tipo_movimiento_enum, $4, $5, $6, $7, $8)
             RETURNING id_movimiento`,
            [id_pp, req.usuario.id, tipo, stockAntes, stockDespues, delta, boleta_ref || null, observacion || null]
        );

        await client.query('COMMIT');

        registrarAuditoria({
            id_usuario:       req.usuario.id,
            nombre_usuario:   req.usuario.nombre || req.usuario.username,
            accion:           'EDITAR',
            modulo:           'Inventario',
            descripcion:      `Stock ${tipo} — PP ID: ${id_pp} | Antes: ${stockAntes} → Después: ${stockDespues}${observacion ? ` | Obs: ${observacion}` : ''}`,
            ip:               getIP(req),
            datos_anteriores: { id_pp: Number(id_pp), stock: stockAntes },
            datos_nuevos:     { stock: stockDespues, tipo_movimiento: tipo, cantidad: Number(cantidad) },
        });

        res.json({
            message:       'Stock actualizado correctamente',
            stock_antes:   stockAntes,
            stock_despues: stockDespues,
            id_movimiento: movRes.rows[0].id_movimiento
        });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(400).json({ message: err.message?.split('\n')[0] || 'Error al actualizar stock' });
    } finally {
        client.release();
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
