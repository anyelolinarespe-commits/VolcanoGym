import { pool } from '../config/bd.js';

// GET /api/categorias
export const getCategorias = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id_categoria, nombre, descripcion, estado, created_at
            FROM categoria_producto
            WHERE estado != 2
            ORDER BY created_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al obtener categorías' });
    }
};

// POST /api/categorias
export const createCategoria = async (req, res) => {
    const { nombre, descripcion } = req.body;
    if (!nombre) return res.status(400).json({ message: 'El nombre es requerido' });
    try {
        const existe = await pool.query(
            `SELECT id_categoria FROM categoria_producto WHERE LOWER(nombre)=LOWER($1) AND estado != 2`,
            [nombre.trim()]
        );
        if (existe.rows.length > 0)
            return res.status(409).json({ message: 'Ya existe una categoría con ese nombre' });

        const result = await pool.query(
            `INSERT INTO categoria_producto (nombre, descripcion, creado_por)
             VALUES ($1, $2, $3) RETURNING *`,
            [nombre.trim(), descripcion || null, req.usuario.id]
        );
        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al crear categoría' });
    }
};

// PUT /api/categorias/:id
export const updateCategoria = async (req, res) => {
    const { id } = req.params;
    const { nombre, descripcion, estado } = req.body;
    if (!nombre) return res.status(400).json({ message: 'El nombre es requerido' });
    try {
        const result = await pool.query(
            `UPDATE categoria_producto
             SET nombre=$1, descripcion=$2, estado=$3
             WHERE id_categoria=$4 AND estado != 2 RETURNING *`,
            [nombre.trim(), descripcion || null, estado ?? 1, id]
        );
        if (result.rowCount === 0) return res.status(404).json({ message: 'Categoría no encontrada' });
        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al actualizar categoría' });
    }
};

// DELETE /api/categorias/:id (soft delete: estado=2)
export const deleteCategoria = async (req, res) => {
    const { id } = req.params;
    try {
        // Verificar si tiene productos activos
        const check = await pool.query(
            `SELECT COUNT(*) FROM producto WHERE id_categoria=$1 AND estado != 2`, [id]
        );
        if (parseInt(check.rows[0].count) > 0)
            return res.status(409).json({
                message: `No se puede eliminar: hay ${check.rows[0].count} producto(s) en esta categoría`
            });

        const result = await pool.query(
            `UPDATE categoria_producto SET estado=2, eliminado_por=$1
             WHERE id_categoria=$2 AND estado != 2 RETURNING id_categoria`,
            [req.usuario.id, id]
        );
        if (result.rowCount === 0) return res.status(404).json({ message: 'Categoría no encontrada' });
        res.json({ message: 'Categoría eliminada correctamente' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al eliminar categoría' });
    }
};
