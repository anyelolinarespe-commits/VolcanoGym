import { pool } from '../config/bd.js';

// ══════════════════════════════════════════════════════════════════════════════
//  CONTROLLER: PRESENTACIONES
//  Tabla: presentacion  (catálogo de tipos de envase/formato)
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/presentaciones
export const getPresentaciones = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT p.id_presentacion, p.nombre, p.descripcion, p.estado, p.created_at,
                   COUNT(cp.id_categoria) AS total_categorias
            FROM presentacion p
            LEFT JOIN categoria_presentacion cp ON cp.id_presentacion = p.id_presentacion
            WHERE p.estado != 2
            GROUP BY p.id_presentacion
            ORDER BY p.created_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al obtener presentaciones' });
    }
};

// GET /api/presentaciones/activas  — solo activas (para selects)
export const getPresentacionesActivas = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id_presentacion, nombre, descripcion
            FROM presentacion
            WHERE estado = 1
            ORDER BY nombre ASC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al obtener presentaciones activas' });
    }
};

// GET /api/presentaciones/por-categoria/:id_categoria
// Devuelve solo las presentaciones válidas para una categoría específica
export const getPresentacionesByCategoria = async (req, res) => {
    const { id_categoria } = req.params;
    try {
        const result = await pool.query(`
            SELECT p.id_presentacion, p.nombre, p.descripcion
            FROM presentacion p
            JOIN categoria_presentacion cp ON cp.id_presentacion = p.id_presentacion
            WHERE cp.id_categoria = $1
              AND p.estado = 1
            ORDER BY p.nombre ASC
        `, [id_categoria]);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al obtener presentaciones de la categoría' });
    }
};

// POST /api/presentaciones
export const createPresentacion = async (req, res) => {
    const { nombre, descripcion } = req.body;
    if (!nombre) return res.status(400).json({ message: 'El nombre es requerido' });
    try {
        const existe = await pool.query(
            `SELECT id_presentacion FROM presentacion WHERE LOWER(nombre)=LOWER($1) AND estado != 2`,
            [nombre.trim()]
        );
        if (existe.rows.length > 0)
            return res.status(409).json({ message: 'Ya existe una presentación con ese nombre' });

        const result = await pool.query(
            `INSERT INTO presentacion (nombre, descripcion, creado_por)
             VALUES ($1, $2, $3) RETURNING *`,
            [nombre.trim(), descripcion || null, req.usuario.id]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al crear presentación' });
    }
};

// PUT /api/presentaciones/:id
export const updatePresentacion = async (req, res) => {
    const { id } = req.params;
    const { nombre, descripcion, estado } = req.body;
    if (!nombre) return res.status(400).json({ message: 'El nombre es requerido' });
    try {
        const result = await pool.query(
            `UPDATE presentacion
             SET nombre=$1, descripcion=$2, estado=$3
             WHERE id_presentacion=$4 AND estado != 2 RETURNING *`,
            [nombre.trim(), descripcion || null, estado ?? 1, id]
        );
        if (result.rowCount === 0)
            return res.status(404).json({ message: 'Presentación no encontrada' });
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al actualizar presentación' });
    }
};

// DELETE /api/presentaciones/:id  (soft delete: estado=2)
export const deletePresentacion = async (req, res) => {
    const { id } = req.params;
    try {
        // Verificar si está en uso por algún producto
        const check = await pool.query(
            `SELECT COUNT(*) FROM producto_presentacion WHERE id_presentacion=$1`, [id]
        );
        if (parseInt(check.rows[0].count) > 0)
            return res.status(409).json({
                message: `No se puede eliminar: hay ${check.rows[0].count} producto(s) usando esta presentación`
            });

        const result = await pool.query(
            `UPDATE presentacion SET estado=2, eliminado_por=$1
             WHERE id_presentacion=$2 AND estado != 2 RETURNING id_presentacion`,
            [req.usuario.id, id]
        );
        if (result.rowCount === 0)
            return res.status(404).json({ message: 'Presentación no encontrada' });
        res.json({ message: 'Presentación eliminada correctamente' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al eliminar presentación' });
    }
};

// ──────────────────────────────────────────────────────────────────────────────
//  PRECIOS POR PRESENTACIÓN DE UN PRODUCTO  (tabla producto_presentacion)
// ──────────────────────────────────────────────────────────────────────────────

// GET /api/presentaciones/producto/:id_producto
export const getPresentacionesByProducto = async (req, res) => {
    const { id_producto } = req.params;
    try {
        const result = await pool.query(`
            SELECT
                pp.id,
                pp.id_producto,
                pp.id_presentacion,
                p.nombre  AS presentacion,
                pp.precio_costo,
                pp.precio_venta,
                pp.estado,
                CASE
                    WHEN pp.precio_costo > 0
                    THEN ROUND((pp.precio_venta - pp.precio_costo) / pp.precio_costo * 100, 1)
                    ELSE NULL
                END AS ganancia_pct
            FROM producto_presentacion pp
            JOIN presentacion p ON p.id_presentacion = pp.id_presentacion
            WHERE pp.id_producto = $1
            ORDER BY p.nombre ASC
        `, [id_producto]);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al obtener presentaciones del producto' });
    }
};

// POST /api/presentaciones/producto/:id_producto
export const addPresentacionToProducto = async (req, res) => {
    const { id_producto } = req.params;
    const { id_presentacion, precio_costo, precio_venta } = req.body;

    if (!id_presentacion || precio_venta === undefined || precio_venta === null)
        return res.status(400).json({ message: 'Presentación y precio de venta son requeridos' });

    if (Number(precio_venta) <= 0)
        return res.status(400).json({ message: 'El precio de venta debe ser mayor a 0' });

    try {
        const existe = await pool.query(
            `SELECT id FROM producto_presentacion
             WHERE id_producto=$1 AND id_presentacion=$2`,
            [id_producto, id_presentacion]
        );
        if (existe.rows.length > 0)
            return res.status(409).json({ message: 'Esta presentación ya está registrada para el producto' });

        const result = await pool.query(
            `INSERT INTO producto_presentacion
             (id_producto, id_presentacion, precio_costo, precio_venta, creado_por)
             VALUES ($1, $2, $3, $4, $5) RETURNING *`,
            [id_producto, id_presentacion,
                Number(precio_costo ?? 0), Number(precio_venta),
                req.usuario.id]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al agregar presentación al producto' });
    }
};

// PUT /api/presentaciones/producto-precio/:id
export const updatePresentacionProducto = async (req, res) => {
    const { id } = req.params;
    const { precio_costo, precio_venta, estado } = req.body;

    if (precio_venta !== undefined && Number(precio_venta) <= 0)
        return res.status(400).json({ message: 'El precio de venta debe ser mayor a 0' });

    try {
        const result = await pool.query(
            `UPDATE producto_presentacion
             SET precio_costo=$1, precio_venta=$2, estado=$3
             WHERE id=$4 RETURNING *`,
            [Number(precio_costo ?? 0), Number(precio_venta), estado ?? 1, id]
        );
        if (result.rowCount === 0)
            return res.status(404).json({ message: 'Registro no encontrado' });
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al actualizar precios' });
    }
};

// DELETE /api/presentaciones/producto-precio/:id
export const deletePresentacionProducto = async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(
            `DELETE FROM producto_presentacion WHERE id=$1 RETURNING id`,
            [id]
        );
        if (result.rowCount === 0)
            return res.status(404).json({ message: 'Registro no encontrado' });
        res.json({ message: 'Presentación eliminada del producto' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al eliminar presentación del producto' });
    }
};

// ──────────────────────────────────────────────────────────────────────────────
//  ASIGNACIÓN DE PRESENTACIONES A CATEGORÍAS (tabla categoria_presentacion)
// ──────────────────────────────────────────────────────────────────────────────

// GET /api/presentaciones/categoria/:id_categoria  — ya cubierto arriba
// PUT /api/presentaciones/categoria/:id_categoria  — reemplaza asignaciones
export const setPresentacionesByCategoria = async (req, res) => {
    const { id_categoria } = req.params;
    const { presentaciones } = req.body; // array de id_presentacion

    if (!Array.isArray(presentaciones))
        return res.status(400).json({ message: 'presentaciones debe ser un array' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        await client.query(
            'DELETE FROM categoria_presentacion WHERE id_categoria=$1', [id_categoria]
        );
        if (presentaciones.length > 0) {
            const values = presentaciones
                .map((_, i) => `($1, $${i + 2})`)
                .join(', ');
            await client.query(
                `INSERT INTO categoria_presentacion (id_categoria, id_presentacion) VALUES ${values}
                 ON CONFLICT DO NOTHING`,
                [id_categoria, ...presentaciones]
            );
        }
        await client.query('COMMIT');
        res.json({ message: 'Presentaciones de categoría actualizadas' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ message: 'Error al actualizar presentaciones de categoría' });
    } finally {
        client.release();
    }
};
