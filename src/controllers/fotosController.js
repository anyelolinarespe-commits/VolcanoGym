import { pool } from '../config/bd.js';

// GET /api/productos/:id/fotos
export const getFotosByProducto = async (req, res) => {
    const { id } = req.params;
    try {
        const result = await pool.query(`
            SELECT
                id_foto,
                id_producto,
                url_foto,
                es_principal,
                orden,
                created_at
            FROM producto_foto
            WHERE id_producto = $1
            ORDER BY es_principal DESC, orden ASC, id_foto ASC
        `, [id]);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al obtener fotos' });
    }
};

// POST /api/productos/:id/fotos
export const uploadFoto = async (req, res) => {
    const { id } = req.params;

    if (!req.file) {
        return res.status(400).json({ message: 'No se recibió ninguna imagen' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const prod = await client.query(
            `SELECT id_producto FROM producto WHERE id_producto=$1 AND estado != 2`, [id]
        );
        if (prod.rowCount === 0) {
            return res.status(404).json({ message: 'Producto no encontrado' });
        }

        const url_foto = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;

        const count = await client.query(
            `SELECT COUNT(*) FROM producto_foto WHERE id_producto=$1`, [id]
        );
        const es_primera = parseInt(count.rows[0].count) === 0;

        const ordenMax = await client.query(
            `SELECT COALESCE(MAX(orden), -1) AS max_orden FROM producto_foto WHERE id_producto=$1`, [id]
        );
        const orden = parseInt(ordenMax.rows[0].max_orden) + 1;

        if (es_primera) {
            await client.query(
                `UPDATE producto_foto SET es_principal=false WHERE id_producto=$1`, [id]
            );
        }

        const result = await client.query(
            `INSERT INTO producto_foto
             (id_producto, url_foto, es_principal, orden, creado_por)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [id, url_foto, es_primera, orden, req.usuario.id]
        );

        await client.query('COMMIT');
        res.status(201).json(result.rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ message: 'Error al guardar la foto' });
    } finally {
        client.release();
    }
};

// PUT /api/productos/:id/fotos/:id_foto/principal
export const setFotoPrincipal = async (req, res) => {
    const { id, id_foto } = req.params;
    try {
        await pool.query(
            `SELECT fn_set_foto_principal($1, $2)`, [id_foto, id]
        );
        res.json({ message: 'Foto principal actualizada' });
    } catch (err) {
        console.error(err);
        res.status(400).json({ message: err.message?.split('\n')[0] || 'Error al actualizar foto principal' });
    }
};

// PUT /api/productos/:id/fotos/orden
export const reordenarFotos = async (req, res) => {
    const { id } = req.params;
    const { fotos } = req.body;

    if (!Array.isArray(fotos) || fotos.length === 0)
        return res.status(400).json({ message: 'fotos debe ser un array con al menos 1 elemento' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (const f of fotos) {
            await client.query(
                `UPDATE producto_foto SET orden=$1
                 WHERE id_foto=$2 AND id_producto=$3`,
                [f.orden, f.id_foto, id]
            );
        }
        await client.query('COMMIT');
        res.json({ message: 'Orden actualizado' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ message: 'Error al reordenar fotos' });
    } finally {
        client.release();
    }
};

// DELETE /api/productos/:id/fotos/:id_foto
export const deleteFoto = async (req, res) => {
    const { id, id_foto } = req.params;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const foto = await client.query(
            `SELECT es_principal FROM producto_foto
             WHERE id_foto=$1 AND id_producto=$2`,
            [id_foto, id]
        );
        if (foto.rowCount === 0)
            return res.status(404).json({ message: 'Foto no encontrada' });

        const { es_principal } = foto.rows[0];

        await client.query(
            `DELETE FROM producto_foto WHERE id_foto=$1`, [id_foto]
        );

        if (es_principal) {
            const siguiente = await client.query(
                `SELECT id_foto FROM producto_foto
                 WHERE id_producto=$1
                 ORDER BY orden ASC, id_foto ASC
                 LIMIT 1`,
                [id]
            );
            if (siguiente.rowCount > 0) {
                await client.query(
                    `UPDATE producto_foto SET es_principal=true
                     WHERE id_foto=$1`,
                    [siguiente.rows[0].id_foto]
                );
            }
        }

        await client.query('COMMIT');
        res.json({ message: 'Foto eliminada' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ message: 'Error al eliminar la foto' });
    } finally {
        client.release();
    }
};
