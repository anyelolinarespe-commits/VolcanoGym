import { pool } from '../config/bd.js';
import { registrarAuditoria, getIP } from '../helpers/auditoria.js';

// ══════════════════════════════════════════════════════════════════════════════
//  CONTROLLER: PRESENTACIONES
// ══════════════════════════════════════════════════════════════════════════════

// GET /api/presentaciones
export const getPresentaciones = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT
                p.id_presentacion, p.nombre, p.descripcion, p.estado, p.created_at,
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

// GET /api/presentaciones/activas
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
// Devuelve solo las presentaciones válidas para una categoría (Opción B)
export const getPresentacionesByCategoria = async (req, res) => {
    const { id_categoria } = req.params;
    try {
        const result = await pool.query(`
            SELECT p.id_presentacion, p.nombre, p.descripcion
            FROM presentacion p
            JOIN categoria_presentacion cp ON cp.id_presentacion = p.id_presentacion
            WHERE cp.id_categoria = $1 AND p.estado = 1
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
        registrarAuditoria({
            id_usuario:     req.usuario.id,
            nombre_usuario: req.usuario.nombre || req.usuario.username,
            accion:         'CREAR',
            modulo:         'Presentaciones',
            descripcion:    `Presentación #${result.rows[0].id_presentacion} creada: "${nombre.trim()}"`,
            ip:             getIP(req),
            datos_nuevos:   { nombre: nombre.trim() },
        });
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
        const prevRes = await pool.query(
            `SELECT nombre, descripcion, estado FROM presentacion WHERE id_presentacion=$1 AND estado != 2`, [id]
        );
        if (!prevRes.rows.length)
            return res.status(404).json({ message: 'Presentación no encontrada' });
        const old = prevRes.rows[0];

        const result = await pool.query(
            `UPDATE presentacion
             SET nombre=$1, descripcion=$2, estado=$3
             WHERE id_presentacion=$4 AND estado != 2 RETURNING *`,
            [nombre.trim(), descripcion || null, estado ?? 1, id]
        );
        if (result.rowCount === 0)
            return res.status(404).json({ message: 'Presentación no encontrada' });

        const ESTADO_P = { 0: 'Inactivo', 1: 'Activo', 2: 'Eliminado' };
        const cambios = [];
        if (old.nombre !== nombre.trim())
            cambios.push(`nombre: "${old.nombre}" → "${nombre.trim()}"`);
        if (String(old.estado) !== String(estado ?? 1))
            cambios.push(`estado: ${ESTADO_P[old.estado] ?? old.estado} → ${ESTADO_P[String(estado ?? 1)] ?? estado}`);
        if ((old.descripcion || '') !== (descripcion || ''))
            cambios.push('descripción actualizada');
        const diffStr = cambios.length ? cambios.join(' | ') : 'sin cambios';

        registrarAuditoria({
            id_usuario:     req.usuario.id,
            nombre_usuario: req.usuario.nombre || req.usuario.username,
            accion:         'EDITAR',
            modulo:         'Presentaciones',
            descripcion:    `Presentación #${id} "${nombre.trim()}" — ${diffStr}`,
            ip:             getIP(req)
        });

        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al actualizar presentación' });
    }
};

// DELETE /api/presentaciones/:id (soft delete)
export const deletePresentacion = async (req, res) => {
    const { id } = req.params;
    try {
        const check = await pool.query(
            `SELECT COUNT(*) FROM producto_presentacion
             WHERE id_presentacion=$1 AND estado != 2`, [id]
        );
        if (parseInt(check.rows[0].count) > 0)
            return res.status(409).json({
                message: `No se puede eliminar: ${check.rows[0].count} producto(s) usan esta presentación`
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
//  PRESENTACIONES POR PRODUCTO (tabla producto_presentacion)
//  Ahora incluye: stock_actual, stock_minimo, es_principal
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
                p.nombre            AS presentacion,
                pp.precio_costo,
                pp.precio_venta,
                pp.stock_actual,
                pp.stock_minimo,
                pp.es_principal,
                pp.estado,
                CASE WHEN pp.precio_costo > 0
                    THEN ROUND((pp.precio_venta - pp.precio_costo) / pp.precio_costo * 100, 1)
                    ELSE NULL END   AS ganancia_pct
            FROM producto_presentacion pp
            JOIN presentacion p ON p.id_presentacion = pp.id_presentacion
            WHERE pp.id_producto = $1 AND pp.estado != 2
            ORDER BY pp.es_principal DESC, p.nombre ASC
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
    const {
        id_presentacion, precio_costo, precio_venta,
        stock_actual, stock_minimo, es_principal
    } = req.body;

    if (!id_presentacion || precio_venta === undefined || precio_venta === null)
        return res.status(400).json({ message: 'Presentación y precio de venta son requeridos' });

    if (Number(precio_venta) <= 0)
        return res.status(400).json({ message: 'El precio de venta debe ser mayor a 0' });

    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Verificar que la presentación sea válida para la categoría del producto
        const catCheck = await client.query(`
            SELECT cp.id_categoria
            FROM categoria_presentacion cp
            JOIN producto p ON p.id_categoria = cp.id_categoria
            WHERE p.id_producto = $1 AND cp.id_presentacion = $2
        `, [id_producto, id_presentacion]);

        if (catCheck.rowCount === 0)
            return res.status(409).json({
                message: 'Esta presentación no está permitida para la categoría del producto'
            });

        // Verificar duplicado
        const existe = await client.query(
            `SELECT id FROM producto_presentacion
             WHERE id_producto=$1 AND id_presentacion=$2 AND estado != 2`,
            [id_producto, id_presentacion]
        );
        if (existe.rows.length > 0)
            return res.status(409).json({ message: 'Esta presentación ya está registrada para el producto' });

        // Si es_principal=true, desmarcar la anterior
        if (es_principal === true) {
            await client.query(
                `UPDATE producto_presentacion SET es_principal=false
                 WHERE id_producto=$1 AND es_principal=true`,
                [id_producto]
            );
        }

        const result = await client.query(
            `INSERT INTO producto_presentacion
             (id_producto, id_presentacion, precio_costo, precio_venta,
              stock_actual, stock_minimo, es_principal, creado_por)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
            [
                id_producto, id_presentacion,
                Number(precio_costo ?? 0), Number(precio_venta),
                Number(stock_actual ?? 0), Number(stock_minimo ?? 0),
                es_principal === true,
                req.usuario.id
            ]
        );

        await client.query('COMMIT');
        res.status(201).json(result.rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ message: 'Error al agregar presentación al producto' });
    } finally {
        client.release();
    }
};

// PUT /api/presentaciones/producto-precio/:id
export const updatePresentacionProducto = async (req, res) => {
    const { id } = req.params;
    const { precio_costo, precio_venta, stock_minimo, es_principal, estado } = req.body;

    if (precio_venta !== undefined && Number(precio_venta) <= 0)
        return res.status(400).json({ message: 'El precio de venta debe ser mayor a 0' });

    const client = await pool.connect();
    try {
        const prevRes = await client.query(`
            SELECT pp.precio_costo, pp.precio_venta, pp.stock_minimo, pp.es_principal, pp.estado,
                   p.nombre AS nombre_producto, pr.nombre AS nombre_presentacion
            FROM producto_presentacion pp
            JOIN producto p      ON p.id_producto       = pp.id_producto
            JOIN presentacion pr ON pr.id_presentacion  = pp.id_presentacion
            WHERE pp.id = $1
        `, [id]);
        if (!prevRes.rows.length) return res.status(404).json({ message: 'Registro no encontrado' });
        const old = prevRes.rows[0];

        await client.query('BEGIN');

        // Si se marca como principal, desmarcar la anterior del mismo producto
        if (es_principal === true) {
            const pp = await client.query(
                `SELECT id_producto FROM producto_presentacion WHERE id=$1`, [id]
            );
            if (pp.rows.length > 0) {
                await client.query(
                    `UPDATE producto_presentacion SET es_principal=false
                     WHERE id_producto=$1 AND es_principal=true AND id != $2`,
                    [pp.rows[0].id_producto, id]
                );
            }
        }

        const result = await client.query(
            `UPDATE producto_presentacion
             SET precio_costo=$1, precio_venta=$2, stock_minimo=$3,
                 es_principal=$4, estado=$5
             WHERE id=$6 RETURNING *`,
            [
                Number(precio_costo ?? 0),
                Number(precio_venta),
                Number(stock_minimo ?? 0),
                es_principal ?? false,
                estado ?? 1,
                id
            ]
        );
        if (result.rowCount === 0)
            return res.status(404).json({ message: 'Registro no encontrado' });

        await client.query('COMMIT');

        const ESTADO_PP = { 0: 'Inactivo', 1: 'Activo', 2: 'Eliminado' };
        const cambios = [];
        if (Number(old.precio_costo) !== Number(precio_costo ?? 0))
            cambios.push(`costo: S/${Number(old.precio_costo).toFixed(2)} → S/${Number(precio_costo ?? 0).toFixed(2)}`);
        if (Number(old.precio_venta) !== Number(precio_venta))
            cambios.push(`precio venta: S/${Number(old.precio_venta).toFixed(2)} → S/${Number(precio_venta).toFixed(2)}`);
        if (Number(old.stock_minimo) !== Number(stock_minimo ?? 0))
            cambios.push(`stock mín.: ${old.stock_minimo} → ${Number(stock_minimo ?? 0)}`);
        if (old.es_principal !== (es_principal ?? false))
            cambios.push(`principal: ${old.es_principal ? 'Sí' : 'No'} → ${(es_principal ?? false) ? 'Sí' : 'No'}`);
        if (String(old.estado) !== String(estado ?? 1))
            cambios.push(`estado: ${ESTADO_PP[old.estado] ?? old.estado} → ${ESTADO_PP[String(estado ?? 1)] ?? estado}`);
        const diffStr = cambios.length ? cambios.join(' | ') : 'sin cambios';

        registrarAuditoria({
            id_usuario:       req.usuario.id,
            nombre_usuario:   req.usuario.nombre || req.usuario.username,
            accion:           'EDITAR',
            modulo:           'Productos',
            descripcion:      `Producto "${old.nombre_producto}" (${old.nombre_presentacion}) — ${diffStr}`,
            ip:               getIP(req),
            datos_anteriores: { precio_costo: Number(old.precio_costo), precio_venta: Number(old.precio_venta), stock_minimo: Number(old.stock_minimo) },
            datos_nuevos:     { precio_costo: Number(precio_costo ?? 0), precio_venta: Number(precio_venta), stock_minimo: Number(stock_minimo ?? 0) },
        });

        res.json(result.rows[0]);
    } catch (err) {
        await client.query('ROLLBACK');
        console.error(err);
        res.status(500).json({ message: 'Error al actualizar presentación' });
    } finally {
        client.release();
    }
};

// DELETE /api/presentaciones/producto-precio/:id (soft delete)
export const deletePresentacionProducto = async (req, res) => {
    const { id } = req.params;
    try {
        // No permitir eliminar si tiene stock
        const check = await pool.query(
            `SELECT stock_actual, es_principal, precio_costo, precio_venta FROM producto_presentacion WHERE id=$1`, [id]
        );
        if (check.rowCount === 0)
            return res.status(404).json({ message: 'Registro no encontrado' });

        if (check.rows[0].stock_actual > 0)
            return res.status(409).json({
                message: `No se puede eliminar: esta presentación tiene ${check.rows[0].stock_actual} unidades en stock`
            });

        if (check.rows[0].es_principal)
            return res.status(409).json({
                message: 'No se puede eliminar la presentación principal. Asigna otra como principal primero.'
            });

        const result = await pool.query(
            `UPDATE producto_presentacion SET estado=2, eliminado_por=$1
             WHERE id=$2 RETURNING id`,
            [req.usuario.id, id]
        );
        registrarAuditoria({
            id_usuario:       req.usuario.id,
            nombre_usuario:   req.usuario.nombre || req.usuario.username,
            accion:           'ELIMINAR',
            modulo:           'Productos',
            descripcion:      `Presentación-producto #${id} eliminada (soft-delete)`,
            ip:               getIP(req),
            datos_anteriores: { id_pp: Number(id), precio_costo: Number(check.rows[0].precio_costo), precio_venta: Number(check.rows[0].precio_venta), stock_actual: check.rows[0].stock_actual },
        });
        res.json({ message: 'Presentación eliminada del producto' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al eliminar presentación del producto' });
    }
};

// ──────────────────────────────────────────────────────────────────────────────
//  ASIGNACIÓN DE PRESENTACIONES A CATEGORÍAS
// ──────────────────────────────────────────────────────────────────────────────

// GET /api/presentaciones/categoria/:id_categoria — cubierto en getPresentacionesByCategoria
// PUT /api/presentaciones/categoria/:id_categoria — reemplaza asignaciones
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
                .map((_, i) => `($1, $${i + 2}, $${presentaciones.length + 2})`)
                .join(', ');
            await client.query(
                `INSERT INTO categoria_presentacion (id_categoria, id_presentacion, creado_por)
                 VALUES ${values} ON CONFLICT DO NOTHING`,
                [id_categoria, ...presentaciones, req.usuario.id]
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
