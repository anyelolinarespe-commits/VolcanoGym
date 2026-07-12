import { pool } from '../config/bd.js';
import { registrarAuditoria, getIP } from '../helpers/auditoria.js';

// ══════════════════════════════════════════════════════════════════════════════
//  CONTROLLER: FOTOS POR PRESENTACIÓN (variante de producto)
//  Espejo de fotosController.js pero atado a producto_presentacion (id_pp).
//  Tabla: producto_presentacion_foto
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/presentaciones/producto-precio/:id_pp/fotos
export const getFotosByPP = async (req, res) => {
    const { id_pp } = req.params;
    try {
        const result = await pool.query(`
            SELECT
                id_foto,
                id_pp,
                url_foto,
                es_principal,
                estado,
                orden,
                created_at
            FROM producto_presentacion_foto
            WHERE id_pp = $1
            ORDER BY es_principal DESC, orden ASC, id_foto ASC
        `, [id_pp]);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al obtener fotos de la presentación' });
    }
};

// POST /api/presentaciones/producto-precio/:id_pp/fotos
export const uploadFotoPP = async (req, res) => {
    const { id_pp } = req.params;

    if (!req.file) {
        return res.status(400).json({ message: 'No se recibió ninguna imagen' });
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const pp = await client.query(
            `SELECT id FROM producto_presentacion WHERE id=$1 AND estado != 2`, [id_pp]
        );
        if (pp.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Presentación no encontrada' });
        }

        const url_foto = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;

        const count = await client.query(
            `SELECT COUNT(*) FROM producto_presentacion_foto WHERE id_pp=$1`, [id_pp]
        );
        const es_primera = parseInt(count.rows[0].count) === 0;

        const ordenMax = await client.query(
            `SELECT COALESCE(MAX(orden), -1) AS max_orden FROM producto_presentacion_foto WHERE id_pp=$1`, [id_pp]
        );
        const orden = parseInt(ordenMax.rows[0].max_orden) + 1;

        // La primera foto que se sube pasa a ser la principal
        if (es_primera) {
            await client.query(
                `UPDATE producto_presentacion_foto SET es_principal=false WHERE id_pp=$1`, [id_pp]
            );
        }

        const result = await client.query(
            `INSERT INTO producto_presentacion_foto
             (id_pp, url_foto, es_principal, orden, creado_por)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [id_pp, url_foto, es_primera, orden, req.usuario.id]
        );

        await client.query('COMMIT');

        registrarAuditoria({
            id_usuario:     req.usuario.id,
            nombre_usuario: req.usuario.nombre || req.usuario.username,
            accion:         'CREAR',
            modulo:         'Productos',
            descripcion:    `Foto subida para presentación-producto #${id_pp} (es_principal: ${es_primera})`,
            ip:             getIP(req),
            datos_nuevos:   { id_pp: Number(id_pp), id_foto: result.rows[0].id_foto, es_principal: es_primera, orden },
        });

        res.status(201).json(result.rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ message: 'Error al guardar la foto de la presentación' });
    } finally {
        client.release();
    }
};

// PUT /api/presentaciones/producto-precio/:id_pp/fotos/:id_foto/principal
export const setFotoPPPrincipal = async (req, res) => {
    const { id_pp, id_foto } = req.params;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const foto = await client.query(
            `SELECT id_foto FROM producto_presentacion_foto WHERE id_foto=$1 AND id_pp=$2`,
            [id_foto, id_pp]
        );
        if (foto.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Foto no encontrada' });
        }

        const prevPrincipal = await client.query(
            `SELECT id_foto FROM producto_presentacion_foto WHERE id_pp=$1 AND es_principal=true LIMIT 1`, [id_pp]
        );

        // Desmarcar la anterior y marcar la nueva
        await client.query(
            `UPDATE producto_presentacion_foto SET es_principal=false WHERE id_pp=$1`, [id_pp]
        );
        await client.query(
            `UPDATE producto_presentacion_foto SET es_principal=true WHERE id_foto=$1 AND id_pp=$2`,
            [id_foto, id_pp]
        );

        await client.query('COMMIT');

        registrarAuditoria({
            id_usuario:       req.usuario.id,
            nombre_usuario:   req.usuario.nombre || req.usuario.username,
            accion:           'EDITAR',
            modulo:           'Productos',
            descripcion:      `Foto principal de presentación-producto #${id_pp} cambiada a foto #${id_foto}`,
            ip:               getIP(req),
            datos_anteriores: { foto_principal_id_anterior: prevPrincipal.rows[0]?.id_foto ?? null },
            datos_nuevos:     { foto_principal_id_nueva: Number(id_foto) },
        });

        res.json({ message: 'Foto principal actualizada' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(400).json({ message: 'Error al actualizar foto principal' });
    } finally {
        client.release();
    }
};

// PUT /api/presentaciones/producto-precio/:id_pp/fotos/:id_foto/estado
// Activa (1) / inactiva (0) una imagen sin eliminarla
export const setFotoPPEstado = async (req, res) => {
    const { id_pp, id_foto } = req.params;
    const { estado } = req.body;
    const nuevoEstado = Number(estado) === 0 ? 0 : 1;
    try {
        const result = await pool.query(
            `UPDATE producto_presentacion_foto SET estado=$1
             WHERE id_foto=$2 AND id_pp=$3 RETURNING id_foto, estado`,
            [nuevoEstado, id_foto, id_pp]
        );
        if (result.rowCount === 0)
            return res.status(404).json({ message: 'Foto no encontrada' });

        registrarAuditoria({
            id_usuario:     req.usuario.id,
            nombre_usuario: req.usuario.nombre || req.usuario.username,
            accion:         'EDITAR',
            modulo:         'Productos',
            descripcion:    `Foto #${id_foto} de presentación-producto #${id_pp} ${nuevoEstado === 1 ? 'activada' : 'desactivada'}`,
            ip:             getIP(req),
            datos_nuevos:   { id_foto: Number(id_foto), estado: nuevoEstado },
        });

        res.json({ message: nuevoEstado === 1 ? 'Imagen activada' : 'Imagen desactivada', estado: nuevoEstado });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al cambiar el estado de la imagen' });
    }
};

// PUT /api/presentaciones/producto-precio/:id_pp/fotos/orden
export const reordenarFotosPP = async (req, res) => {
    const { id_pp } = req.params;
    const { fotos } = req.body;

    if (!Array.isArray(fotos) || fotos.length === 0)
        return res.status(400).json({ message: 'fotos debe ser un array con al menos 1 elemento' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        for (const f of fotos) {
            await client.query(
                `UPDATE producto_presentacion_foto SET orden=$1
                 WHERE id_foto=$2 AND id_pp=$3`,
                [f.orden, f.id_foto, id_pp]
            );
        }
        await client.query('COMMIT');

        registrarAuditoria({
            id_usuario:     req.usuario.id,
            nombre_usuario: req.usuario.nombre || req.usuario.username,
            accion:         'EDITAR',
            modulo:         'Productos',
            descripcion:    `Fotos de presentación-producto #${id_pp} reordenadas (${fotos.length} fotos)`,
            ip:             getIP(req),
            datos_nuevos:   { nuevo_orden: fotos.map(f => f.id_foto) },
        });

        res.json({ message: 'Orden actualizado' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ message: 'Error al reordenar fotos' });
    } finally {
        client.release();
    }
};

// DELETE /api/presentaciones/producto-precio/:id_pp/fotos/:id_foto
export const deleteFotoPP = async (req, res) => {
    const { id_pp, id_foto } = req.params;
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const foto = await client.query(
            `SELECT es_principal FROM producto_presentacion_foto
             WHERE id_foto=$1 AND id_pp=$2`,
            [id_foto, id_pp]
        );
        if (foto.rowCount === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: 'Foto no encontrada' });
        }

        const { es_principal } = foto.rows[0];

        await client.query(
            `DELETE FROM producto_presentacion_foto WHERE id_foto=$1`, [id_foto]
        );

        // Si era la principal, promover la siguiente por orden
        if (es_principal) {
            const siguiente = await client.query(
                `SELECT id_foto FROM producto_presentacion_foto
                 WHERE id_pp=$1
                 ORDER BY orden ASC, id_foto ASC
                 LIMIT 1`,
                [id_pp]
            );
            if (siguiente.rowCount > 0) {
                await client.query(
                    `UPDATE producto_presentacion_foto SET es_principal=true
                     WHERE id_foto=$1`,
                    [siguiente.rows[0].id_foto]
                );
            }
        }

        await client.query('COMMIT');

        registrarAuditoria({
            id_usuario:       req.usuario.id,
            nombre_usuario:   req.usuario.nombre || req.usuario.username,
            accion:           'ELIMINAR',
            modulo:           'Productos',
            descripcion:      `Foto #${id_foto} eliminada de presentación-producto #${id_pp}`,
            ip:               getIP(req),
            datos_anteriores: { id_foto: Number(id_foto), id_pp: Number(id_pp), es_principal },
        });

        res.json({ message: 'Foto eliminada' });
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ message: 'Error al eliminar la foto' });
    } finally {
        client.release();
    }
};
