import { pool } from '../config/bd.js';

// ══════════════════════════════════════════════════════════════════════════════
//  CONTROLLER: PRODUCTOS
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/productos
export const getProductos = async (req, res) => {
    try {
        const { id_categoria, estado } = req.query;
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

        const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';

        const result = await pool.query(`
            SELECT
                p.id_producto, p.nombre, p.descripcion,
                p.precio_venta, p.precio_costo,
                p.stock_actual, p.stock_minimo, p.unidad,
                p.estado, p.created_at,
                c.id_categoria, c.nombre AS categoria,
                pr.id_presentacion, pr.nombre AS presentacion_nombre,
                -- Resumen de presentaciones con precios
                (
                    SELECT json_agg(
                        json_build_object(
                            'id',            pp.id,
                            'id_presentacion', pp.id_presentacion,
                            'presentacion',  pres.nombre,
                            'precio_costo',  pp.precio_costo,
                            'precio_venta',  pp.precio_venta,
                            'ganancia_pct',
                                CASE WHEN pp.precio_costo > 0
                                THEN ROUND((pp.precio_venta - pp.precio_costo) / pp.precio_costo * 100, 1)
                                ELSE NULL END
                        ) ORDER BY pres.nombre
                    )
                    FROM producto_presentacion pp
                    JOIN presentacion pres ON pres.id_presentacion = pp.id_presentacion
                    WHERE pp.id_producto = p.id_producto
                ) AS presentaciones
            FROM producto p
            JOIN categoria_producto c ON c.id_categoria = p.id_categoria
            LEFT JOIN presentacion pr ON pr.id_presentacion = p.id_presentacion
            ${whereClause}
            ORDER BY p.created_at DESC
        `, params);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al obtener productos' });
    }
};

// GET /api/productos/:id  — detalle completo de un producto
export const getProductoById = async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(`
            SELECT
                p.*,
                c.nombre AS categoria,
                pr.nombre AS presentacion_nombre
            FROM producto p
            JOIN categoria_producto c ON c.id_categoria = p.id_categoria
            LEFT JOIN presentacion pr ON pr.id_presentacion = p.id_presentacion
            WHERE p.id_producto = $1 AND p.estado != 2
        `, [id]);

        if (result.rowCount === 0)
            return res.status(404).json({ message: 'Producto no encontrado' });

        const producto = result.rows[0];

        // Traer presentaciones con precios
        const pres = await pool.query(`
            SELECT
                pp.id, pp.id_presentacion,
                pres.nombre AS presentacion,
                pp.precio_costo, pp.precio_venta,
                CASE WHEN pp.precio_costo > 0
                    THEN ROUND((pp.precio_venta - pp.precio_costo) / pp.precio_costo * 100, 1)
                    ELSE NULL END AS ganancia_pct
            FROM producto_presentacion pp
            JOIN presentacion pres ON pres.id_presentacion = pp.id_presentacion
            WHERE pp.id_producto = $1
            ORDER BY pres.nombre ASC
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
                COUNT(*) FILTER (WHERE estado = 1)                            AS activos,
                COUNT(*) FILTER (WHERE estado = 0)                            AS inactivos,
                COUNT(*) FILTER (WHERE stock_actual <= stock_minimo AND estado = 1) AS stock_bajo
            FROM producto
            WHERE estado != 2
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
        precio_venta, precio_costo,
        stock_actual, stock_minimo, unidad,
        id_presentacion,        // presentación principal (FK directa en producto)
        presentaciones          // array opcional: [{id_presentacion, precio_costo, precio_venta}]
    } = req.body;

    if (!id_categoria || !nombre || !precio_venta)
        return res.status(400).json({ message: 'Categoría, nombre y precio de venta son requeridos' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const result = await client.query(
            `INSERT INTO producto
             (id_categoria, nombre, descripcion, precio_venta, precio_costo,
              stock_actual, stock_minimo, unidad, id_presentacion, creado_por)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
            [
                id_categoria, nombre.trim(), descripcion || null,
                Number(precio_venta), precio_costo ? Number(precio_costo) : null,
                Number(stock_actual ?? 0), Number(stock_minimo ?? 3),
                unidad?.trim() || 'unidad',
                id_presentacion || null,
                req.usuario.id
            ]
        );

        const producto = result.rows[0];

        // Insertar presentaciones con precios si vienen en el body
        if (Array.isArray(presentaciones) && presentaciones.length > 0) {
            for (const pp of presentaciones) {
                if (!pp.id_presentacion || !pp.precio_venta) continue;
                await client.query(
                    `INSERT INTO producto_presentacion
                     (id_producto, id_presentacion, precio_costo, precio_venta, creado_por)
                     VALUES ($1,$2,$3,$4,$5)
                     ON CONFLICT (id_producto, id_presentacion) DO NOTHING`,
                    [producto.id_producto, pp.id_presentacion,
                     Number(pp.precio_costo ?? 0), Number(pp.precio_venta),
                     req.usuario.id]
                );
            }
        }

        await client.query('COMMIT');
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
        precio_venta, precio_costo,
        stock_actual, stock_minimo, unidad, estado,
        id_presentacion
    } = req.body;

    if (!nombre || !precio_venta)
        return res.status(400).json({ message: 'Nombre y precio de venta son requeridos' });

    try {
        const result = await pool.query(
            `UPDATE producto SET
             id_categoria=$1, nombre=$2, descripcion=$3,
             precio_venta=$4, precio_costo=$5,
             stock_actual=$6, stock_minimo=$7, unidad=$8,
             estado=$9, id_presentacion=$10
             WHERE id_producto=$11 AND estado != 2 RETURNING *`,
            [
                id_categoria, nombre.trim(), descripcion || null,
                Number(precio_venta), precio_costo ? Number(precio_costo) : null,
                Number(stock_actual ?? 0), Number(stock_minimo ?? 3),
                unidad?.trim() || 'unidad',
                estado ?? 1,
                id_presentacion || null,
                id
            ]
        );
        if (result.rowCount === 0)
            return res.status(404).json({ message: 'Producto no encontrado' });
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al actualizar producto' });
    }
};

// DELETE /api/productos/:id (soft delete: estado=2)
export const deleteProducto = async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(
            `UPDATE producto SET estado=2, eliminado_por=$1
             WHERE id_producto=$2 AND estado != 2 RETURNING id_producto`,
            [req.usuario.id, id]
        );
        if (result.rowCount === 0)
            return res.status(404).json({ message: 'Producto no encontrado' });
        res.json({ message: 'Producto eliminado' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al eliminar producto' });
    }
};
