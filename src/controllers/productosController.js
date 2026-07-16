import { pool } from '../config/bd.js';
import { registrarAuditoria, getIP } from '../helpers/auditoria.js';

// ══════════════════════════════════════════════════════════════════════════════
//  CONTROLLER: PRODUCTOS
//  BD nueva: producto ya NO tiene stock_actual, precio_venta, precio_costo,
//            unidad ni id_presentacion. Todo eso vive en producto_presentacion.
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/productos
export const getProductos = async (req, res) => {
    try {
        const { id_categoria, estado, q, id, stock_bajo, page, limit } = req.query;
        const pageNum  = Math.max(1, parseInt(page)  || 1);
        const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 25));
        const offset   = (pageNum - 1) * limitNum;

        let where = ['p.estado != 2'];
        let params = [];
        let i = 1;

        if (id_categoria && id_categoria !== 'todos') {
            where.push(`p.id_categoria = $${i++}`);
            params.push(Number(id_categoria));
        }
        if (estado && estado !== 'todos') {
            where.push(`p.estado = $${i++}`);
            params.push(Number(estado));
        }
        if (id !== undefined) {
            const idNum = parseInt(id, 10);
            if (Number.isInteger(idNum) && idNum > 0) {
                where.push(`p.id_producto = $${i++}`);
                params.push(idNum);
            }
        } else if (q) {
            where.push(`(LOWER(p.nombre) LIKE $${i} OR LOWER(p.marca) LIKE $${i} OR LOWER(p.sku) LIKE $${i})`);
            params.push(`%${q.toLowerCase()}%`);
            i++;
        }
        if (stock_bajo === '1') {
            where.push(`(
                SELECT COALESCE(SUM(pp2.stock_actual),0) FROM producto_presentacion pp2
                WHERE pp2.id_producto = p.id_producto AND pp2.estado = 1
            ) <= p.stock_minimo`);
        }

        const whereClause = 'WHERE ' + where.join(' AND ');

        const result = await pool.query(`
            SELECT
                p.id_producto,
                p.nombre,
                p.descripcion,
                p.marca,
                p.modelo,
                p.sku,
                p.codigo_barras,
                p.porcentaje_oferta,
                p.peso_kg,
                p.dimensiones,
                p.garantia_meses,
                p.stock_minimo,
                p.estado,
                p.created_at,
                c.id_categoria,
                c.nombre                            AS categoria,
                c.porcentaje_descuento              AS descuento_categoria,

                -- Stock total = suma de todas las presentaciones activas
                COALESCE((
                    SELECT SUM(pp.stock_actual)
                    FROM producto_presentacion pp
                    WHERE pp.id_producto = p.id_producto AND pp.estado = 1
                ), 0)                               AS stock_total,

                -- Precio de venta de la presentación principal
                (
                    SELECT pp.precio_venta
                    FROM producto_presentacion pp
                    WHERE pp.id_producto = p.id_producto
                      AND pp.es_principal = true AND pp.estado = 1
                    LIMIT 1
                )                                   AS precio_venta_principal,

                -- Precio de costo de la presentación principal
                (
                    SELECT pp.precio_costo
                    FROM producto_presentacion pp
                    WHERE pp.id_producto = p.id_producto
                      AND pp.es_principal = true AND pp.estado = 1
                    LIMIT 1
                )                                   AS precio_costo_principal,

                -- Nombre de la presentación principal
                (
                    SELECT pr.nombre
                    FROM producto_presentacion pp
                    JOIN presentacion pr ON pr.id_presentacion = pp.id_presentacion
                    WHERE pp.id_producto = p.id_producto
                      AND pp.es_principal = true AND pp.estado = 1
                    LIMIT 1
                )                                   AS presentacion_principal,

                -- Foto de la presentación principal (si tiene una propia)
                (
                    SELECT ppf.url_foto
                    FROM producto_presentacion pp
                    JOIN producto_presentacion_foto ppf
                        ON ppf.id_pp = pp.id AND ppf.es_principal = true AND ppf.estado = 1
                    WHERE pp.id_producto = p.id_producto
                      AND pp.es_principal = true AND pp.estado = 1
                    LIMIT 1
                )                                   AS foto_variante_principal,

                -- JSON con todas las presentaciones del producto
                (
                    SELECT json_agg(
                        json_build_object(
                            'id',            pp.id,
                            'id_presentacion', pp.id_presentacion,
                            'presentacion',  pres.nombre,
                            'precio_costo',  pp.precio_costo,
                            'precio_venta',  pp.precio_venta,
                            'stock_actual',  pp.stock_actual,
                            'stock_minimo',  pp.stock_minimo,
                            'es_principal',  pp.es_principal,
                            'foto_url',
                                (SELECT ppf.url_foto FROM producto_presentacion_foto ppf
                                 WHERE ppf.id_pp = pp.id AND ppf.es_principal = true AND ppf.estado = 1
                                 LIMIT 1),
                            'ganancia_pct',
                                CASE WHEN pp.precio_costo > 0
                                THEN ROUND((pp.precio_venta - pp.precio_costo) / pp.precio_costo * 100, 1)
                                ELSE NULL END
                        ) ORDER BY pp.es_principal DESC, pres.nombre
                    )
                    FROM producto_presentacion pp
                    JOIN presentacion pres ON pres.id_presentacion = pp.id_presentacion
                    WHERE pp.id_producto = p.id_producto AND pp.estado != 2
                )                                   AS presentaciones

            FROM producto p
            JOIN categoria_producto c ON c.id_categoria = p.id_categoria
            ${whereClause}
            ORDER BY p.created_at DESC
            LIMIT $${i} OFFSET $${i + 1}
        `, [...params, limitNum, offset]);

        const countRes = await pool.query(
            `SELECT COUNT(*) FROM producto p JOIN categoria_producto c ON c.id_categoria = p.id_categoria ${whereClause}`,
            params
        );

        const total = parseInt(countRes.rows[0].count);
        res.json({ data: result.rows, total, page: pageNum, pages: Math.ceil(total / limitNum), limit: limitNum });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al obtener productos' });
    }
};

// GET /api/productos/:id
export const getProductoById = async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(`
            SELECT
                p.*,
                c.nombre AS categoria
            FROM producto p
            JOIN categoria_producto c ON c.id_categoria = p.id_categoria
            WHERE p.id_producto = $1 AND p.estado != 2
        `, [id]);

        if (result.rowCount === 0)
            return res.status(404).json({ message: 'Producto no encontrado' });

        const producto = result.rows[0];

        // Presentaciones con stock
        const pres = await pool.query(`
            SELECT
                pp.id,
                pp.id_presentacion,
                pres.nombre         AS presentacion,
                pp.precio_costo,
                pp.precio_venta,
                pp.stock_actual,
                pp.stock_minimo,
                pp.es_principal,
                pp.estado,
                (SELECT ppf.url_foto FROM producto_presentacion_foto ppf
                 WHERE ppf.id_pp = pp.id AND ppf.es_principal = true AND ppf.estado = 1
                 LIMIT 1)           AS foto_url,
                CASE WHEN pp.precio_costo > 0
                    THEN ROUND((pp.precio_venta - pp.precio_costo) / pp.precio_costo * 100, 1)
                    ELSE NULL END   AS ganancia_pct
            FROM producto_presentacion pp
            JOIN presentacion pres ON pres.id_presentacion = pp.id_presentacion
            WHERE pp.id_producto = $1 AND pp.estado != 2
            ORDER BY pp.es_principal DESC, pres.nombre ASC
        `, [id]);

        producto.presentaciones = pres.rows;
        res.json(producto);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al obtener el producto' });
    }
};

// GET /api/productos/stats
export const getProductosStats = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                COUNT(*) FILTER (WHERE p.estado = 1)  AS activos,
                COUNT(*) FILTER (WHERE p.estado = 0)  AS inactivos,
                -- Stock bajo: stock_total < stock_minimo
                COUNT(*) FILTER (WHERE
                    p.estado = 1 AND
                    COALESCE((
                        SELECT SUM(pp.stock_actual)
                        FROM producto_presentacion pp
                        WHERE pp.id_producto = p.id_producto AND pp.estado = 1
                    ), 0) < p.stock_minimo
                )                                     AS stock_bajo
            FROM producto p
            WHERE p.estado != 2
        `);
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al obtener estadísticas' });
    }
};

// POST /api/productos
export const createProducto = async (req, res) => {
    const {
        id_categoria, nombre, descripcion,
        marca, modelo, sku, codigo_barras,
        porcentaje_oferta, peso_kg, dimensiones, garantia_meses,
        stock_minimo,
        presentaciones   // array: [{id_presentacion, precio_costo, precio_venta, stock_actual, stock_minimo, es_principal}]
    } = req.body;

    if (!id_categoria || !nombre)
        return res.status(400).json({ message: 'Categoría y nombre son requeridos' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const result = await client.query(
            `INSERT INTO producto
             (id_categoria, nombre, descripcion, marca, modelo, sku,
              codigo_barras, porcentaje_oferta, peso_kg, dimensiones,
              garantia_meses, stock_minimo, creado_por)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
             RETURNING *`,
            [
                id_categoria,
                nombre.trim(),
                descripcion   || null,
                marca         || null,
                modelo        || null,
                sku           || null,
                codigo_barras || null,
                Number(porcentaje_oferta ?? 0),
                peso_kg       ? Number(peso_kg)       : null,
                dimensiones   || null,
                Number(garantia_meses ?? 0),
                Number(stock_minimo ?? 3),
                req.usuario.id
            ]
        );

        const producto = result.rows[0];

        // Insertar presentaciones si vienen
        if (Array.isArray(presentaciones) && presentaciones.length > 0) {
            for (const pp of presentaciones) {
                if (!pp.id_presentacion || pp.precio_venta === undefined) continue;
                await client.query(
                    `INSERT INTO producto_presentacion
                     (id_producto, id_presentacion, precio_costo, precio_venta,
                      stock_actual, stock_minimo, es_principal, creado_por)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
                     ON CONFLICT DO NOTHING`,
                    [
                        producto.id_producto,
                        pp.id_presentacion,
                        Number(pp.precio_costo ?? 0),
                        Number(pp.precio_venta),
                        Number(pp.stock_actual ?? 0),
                        Number(pp.stock_minimo ?? 0),
                        pp.es_principal === true,
                        req.usuario.id
                    ]
                );
            }
        }

        await client.query('COMMIT');

        registrarAuditoria({
            id_usuario:   req.usuario.id,
            nombre_usuario: req.usuario.nombre || req.usuario.username,
            accion:       'CREAR',
            modulo:       'Productos',
            descripcion:  `Producto creado: "${req.body.nombre}"`,
            ip:           getIP(req),
            datos_nuevos: { nombre: nombre.trim(), id_categoria, marca: marca || null, porcentaje_oferta: Number(porcentaje_oferta ?? 0) },
        });

        res.status(201).json(producto);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ message: 'Error al crear producto' });
    } finally {
        client.release();
    }
};

// PUT /api/productos/:id
export const updateProducto = async (req, res) => {
    const { id } = req.params;
    const {
        id_categoria, nombre, descripcion,
        marca, modelo, sku, codigo_barras,
        porcentaje_oferta, peso_kg, dimensiones, garantia_meses,
        stock_minimo, estado
    } = req.body;

    if (!nombre)
        return res.status(400).json({ message: 'El nombre es requerido' });

    try {
        const prevRes = await pool.query(
            `SELECT p.nombre, p.estado, p.id_categoria, c.nombre AS cat_nombre,
                    p.marca, p.porcentaje_oferta, p.stock_minimo
             FROM producto p JOIN categoria_producto c ON c.id_categoria = p.id_categoria
             WHERE p.id_producto=$1 AND p.estado != 2`, [id]
        );
        if (!prevRes.rows.length)
            return res.status(404).json({ message: 'Producto no encontrado' });
        const old = prevRes.rows[0];

        const result = await pool.query(
            `UPDATE producto SET
                id_categoria            = $1,
                nombre                  = $2,
                descripcion             = $3,
                marca                   = $4,
                modelo                  = $5,
                sku                     = $6,
                codigo_barras           = COALESCE($7, codigo_barras),
                porcentaje_oferta       = $8,
                peso_kg                 = $9,
                dimensiones             = $10,
                garantia_meses          = $11,
                stock_minimo            = $12,
                estado                  = $13
             WHERE id_producto = $14 AND estado != 2
             RETURNING *`,
            [
                id_categoria,
                nombre.trim(),
                descripcion   || null,
                marca         || null,
                modelo        || null,
                sku           || null,
                codigo_barras || null,
                Number(porcentaje_oferta ?? 0),
                peso_kg       ? Number(peso_kg) : null,
                dimensiones   || null,
                Number(garantia_meses ?? 0),
                Number(stock_minimo ?? 3),
                estado ?? 1,
                id
            ]
        );
        if (result.rowCount === 0)
            return res.status(404).json({ message: 'Producto no encontrado' });

        const ESTADO_PROD = { 0: 'Inactivo', 1: 'Activo', 2: 'Eliminado' };
        const cambios = [];
        if (old.nombre !== nombre.trim())
            cambios.push(`nombre: "${old.nombre}" → "${nombre.trim()}"`);
        if (String(old.estado) !== String(estado ?? 1))
            cambios.push(`estado: ${ESTADO_PROD[old.estado] ?? old.estado} → ${ESTADO_PROD[String(estado ?? 1)] ?? estado}`);
        if (String(old.id_categoria) !== String(id_categoria))
            cambios.push(`categoría: "${old.cat_nombre}" → cat #${id_categoria}`);
        if ((old.marca || '') !== (marca || ''))
            cambios.push(`marca: "${old.marca || '—'}" → "${marca || '—'}"`);
        if (Number(old.porcentaje_oferta) !== Number(porcentaje_oferta ?? 0))
            cambios.push(`oferta: ${old.porcentaje_oferta}% → ${Number(porcentaje_oferta ?? 0)}%`);
        if (Number(old.stock_minimo) !== Number(stock_minimo ?? 3))
            cambios.push(`stock mín.: ${old.stock_minimo} → ${Number(stock_minimo ?? 3)}`);
        const diffStr = cambios.length ? cambios.join(' | ') : 'sin cambios';

        registrarAuditoria({
            id_usuario:       req.usuario.id,
            nombre_usuario:   req.usuario.nombre || req.usuario.username,
            accion:           'EDITAR',
            modulo:           'Productos',
            descripcion:      `Producto #${id} "${nombre.trim()}" — ${diffStr}`,
            ip:               getIP(req),
            datos_anteriores: { nombre: old.nombre, estado: old.estado, id_categoria: old.id_categoria, marca: old.marca || null, porcentaje_oferta: Number(old.porcentaje_oferta), stock_minimo: Number(old.stock_minimo) },
            datos_nuevos:     { nombre: nombre.trim(), estado: estado ?? 1, id_categoria: Number(id_categoria), marca: marca || null, porcentaje_oferta: Number(porcentaje_oferta ?? 0), stock_minimo: Number(stock_minimo ?? 3) },
        });

        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al actualizar producto' });
    }
};

// DELETE /api/productos/:id (soft delete)
export const deleteProducto = async (req, res) => {
    const { id } = req.params;
    try {
        const stockRes = await pool.query(
            `SELECT COALESCE(SUM(pp.stock_actual), 0) AS stock_total
             FROM producto_presentacion pp
             WHERE pp.id_producto = $1 AND pp.estado != 2`,
            [id]
        );
        if (Number(stockRes.rows[0].stock_total) > 0) {
            return res.status(400).json({
                message: 'No se puede eliminar el producto porque tiene stock asignado. Ajusta el stock a 0 antes de eliminarlo.'
            });
        }

        const result = await pool.query(
            `UPDATE producto SET estado=2, eliminado_por=$1
             WHERE id_producto=$2 AND estado != 2 RETURNING id_producto`,
            [req.usuario.id, id]
        );
        if (result.rowCount === 0)
            return res.status(404).json({ message: 'Producto no encontrado' });

        registrarAuditoria({
            id_usuario:       req.usuario.id,
            nombre_usuario:   req.usuario.nombre || req.usuario.username,
            accion:           'ELIMINAR',
            modulo:           'Productos',
            descripcion:      `Producto #${id} eliminado (soft-delete)`,
            ip:               getIP(req),
            datos_anteriores: { id_producto: Number(id), estado: 'activo' },
            datos_nuevos:     { estado: 'eliminado' },
        });

        res.json({ message: 'Producto eliminado' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al eliminar producto' });
    }
};
