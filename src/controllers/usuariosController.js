import bcrypt from 'bcryptjs';
import { pool } from '../config/bd.js';
import { registrarAuditoria, getIP } from '../helpers/auditoria.js';

// GET /api/usuarios
export const getUsuarios = async (req, res) => {
    try {
        const { q, id } = req.query;

        const ejecutorRes = await pool.query(
            `SELECT p.nombre AS perfil_nombre
             FROM usuarios u JOIN perfiles p ON p.id_perfil = u.id_perfil
             WHERE u.id_usuario = $1`, [req.usuario.id]
        );
        const ejecutorEsSuperAdmin =
            ejecutorRes.rows[0]?.perfil_nombre?.toLowerCase() === 'superadministrador';

        const where  = ['u.estado != 2', `($1::boolean = TRUE OR LOWER(p.nombre) != 'superadministrador')`];
        const params = [ejecutorEsSuperAdmin];
        let   i      = 2;

        if (id !== undefined) {
            const idNum = parseInt(id, 10);
            if (Number.isInteger(idNum) && idNum > 0) {
                where.push(`u.id_usuario = $${i++}`);
                params.push(idNum);
            }
        } else if (q) {
            where.push(`(LOWER(u.nombre || ' ' || u.apellido) LIKE $${i} OR LOWER(u.username) LIKE $${i})`);
            params.push(`%${q.toLowerCase()}%`);
            i++;
        }

        const result = await pool.query(`
            SELECT u.id_usuario, u.nombre, u.apellido, u.username, u.email,
                   u.alias_asesor, u.dni, u.celular, u.foto_perfil,
                   u.estado, u.created_at, u.id_perfil,
                   p.nombre AS perfil,
                   COALESCE((
                       SELECT json_agg(json_build_object(
                           'id_contacto', ce.id_contacto,
                           'nombre',      ce.nombre,
                           'parentesco',  ce.parentesco,
                           'telefono',    ce.telefono
                       ) ORDER BY ce.id_contacto)
                       FROM contacto_emergencia_usuario ce
                       WHERE ce.id_usuario = u.id_usuario
                   ), '[]') AS contactos_emergencia
            FROM usuarios u
            JOIN perfiles p ON p.id_perfil = u.id_perfil
            WHERE ${where.join(' AND ')}
            ORDER BY u.created_at DESC
        `, params);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al obtener usuarios' });
    }
};

// POST /api/usuarios
export const createUsuario = async (req, res) => {
    const {
        nombre, apellido, username, email, password, id_perfil, alias_asesor,
        dni, celular, foto_perfil,
        contactos_emergencia   // array opcional: [{ nombre, parentesco, telefono }, ...]
    } = req.body;
    if (!nombre || !apellido || !username || !email || !password || !id_perfil)
        return res.status(400).json({ message: 'Faltan campos requeridos' });

    // Validar contactos de emergencia (opcional, máx 2, parentesco obligatorio si hay teléfono)
    if (contactos_emergencia) {
        if (!Array.isArray(contactos_emergencia) || contactos_emergencia.length > 2)
            return res.status(400).json({ message: 'Se permiten como máximo 2 contactos de emergencia' });
        for (const c of contactos_emergencia) {
            if (!c.telefono && !c.nombre) continue;
            if (!c.telefono) return res.status(400).json({ message: 'Cada contacto de emergencia debe tener teléfono' });
            if (!c.parentesco) return res.status(400).json({ message: 'El parentesco es obligatorio cuando se indica un número de emergencia' });
            if (!c.nombre) return res.status(400).json({ message: 'El nombre del contacto de emergencia es obligatorio' });
        }
    }
    try {
        // Obtener perfil del ejecutor
        const ejecutorRes = await pool.query(
            `SELECT p.nombre AS perfil_nombre
             FROM usuarios u JOIN perfiles p ON p.id_perfil = u.id_perfil
             WHERE u.id_usuario = $1`, [req.usuario.id]
        );
        const ejecutorPerfil       = ejecutorRes.rows[0]?.perfil_nombre?.toLowerCase();
        const ejecutorEsAdmin      = ejecutorPerfil === 'administrador';
        const ejecutorEsSuperAdmin = ejecutorPerfil === 'superadministrador';

        // Verificar perfil destino
        const perfilDestinoRes = await pool.query(
            `SELECT nombre FROM perfiles WHERE id_perfil = $1 AND estado != 2`, [id_perfil]
        );
        if (!perfilDestinoRes.rows.length)
            return res.status(404).json({ message: 'Perfil no encontrado' });

        const perfilDestinoNombre = perfilDestinoRes.rows[0].nombre.toLowerCase();

        // Nadie puede crear usuarios con perfil superAdministrador
        if (perfilDestinoNombre === 'superadministrador')
            return res.status(403).json({ message: 'No se puede asignar el perfil SuperAdministrador' });

        // Solo superAdmin puede crear usuarios con perfil Administrador
        if (perfilDestinoNombre === 'administrador' && !ejecutorEsSuperAdmin)
            return res.status(403).json({ message: 'Solo el SuperAdministrador puede asignar el perfil Administrador' });

        const existe = await pool.query(
            'SELECT id_usuario, estado FROM usuarios WHERE username=$1 OR email=$2',
            [username, email]
        );

        if (existe.rows.length > 0) {
            const usuarioExistente = existe.rows[0];

            // Si existe pero está eliminado (estado=2), lo reactivamos con los nuevos datos
            if (usuarioExistente.estado === 2) {
                const hash = await bcrypt.hash(password, 10);
                const result = await pool.query(
                    `UPDATE usuarios
                     SET nombre=$1, apellido=$2, username=$3, email=$4,
                         password_hash=$5, id_perfil=$6, alias_asesor=$7,
                         dni=$8, celular=$9, foto_perfil=$10,
                         estado=1, eliminado_por=NULL, deleted_at=NULL,
                         modificado_por=$11, updated_at=NOW()
                     WHERE id_usuario=$12
                     RETURNING id_usuario, nombre, apellido, username, email, estado`,
                    [nombre.trim(), apellido.trim(), username.trim(), email.trim(),
                     hash, id_perfil, alias_asesor || null,
                     dni || null, celular || null, foto_perfil || null,
                     req.usuario.id, usuarioExistente.id_usuario]
                );

                // Reemplazar contactos de emergencia si se enviaron
                if (contactos_emergencia?.length) {
                    await pool.query('DELETE FROM contacto_emergencia_usuario WHERE id_usuario=$1', [usuarioExistente.id_usuario]);
                    for (const c of contactos_emergencia.filter(c => c.telefono)) {
                        await pool.query(
                            `INSERT INTO contacto_emergencia_usuario (id_usuario, nombre, parentesco, telefono)
                             VALUES ($1,$2,$3,$4)`,
                            [usuarioExistente.id_usuario, c.nombre.trim(), c.parentesco.trim(), c.telefono.trim()]
                        );
                    }
                }

                return res.status(200).json({
                    ...result.rows[0],
                    _reactivado: true,
                    message: 'Usuario reactivado exitosamente'
                });
            }

            // Si existe y está activo o inactivo, es un conflicto real
            return res.status(409).json({ message: 'Username o email ya existe' });
        }

        const hash = await bcrypt.hash(password, 10);
        const result = await pool.query(
            `INSERT INTO usuarios
             (id_perfil, nombre, apellido, username, email, password_hash,
              alias_asesor, dni, celular, foto_perfil, creado_por)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
             RETURNING id_usuario, nombre, apellido, username, email, estado`,
            [id_perfil, nombre.trim(), apellido.trim(), username.trim(), email.trim(),
             hash, alias_asesor || null,
             dni || null, celular || null, foto_perfil || null,
             req.usuario.id]
        );

        // Insertar contactos de emergencia
        if (contactos_emergencia?.length) {
            for (const c of contactos_emergencia.filter(c => c.telefono)) {
                await pool.query(
                    `INSERT INTO contacto_emergencia_usuario (id_usuario, nombre, parentesco, telefono)
                     VALUES ($1,$2,$3,$4)`,
                    [result.rows[0].id_usuario, c.nombre.trim(), c.parentesco.trim(), c.telefono.trim()]
                );
            }
        }

        registrarAuditoria({
            id_usuario:     req.usuario.id,
            nombre_usuario: req.usuario.nombre || req.usuario.username,
            accion:         'CREAR',
            modulo:         'Usuarios',
            descripcion:    `Usuario creado: ${username} (${nombre} ${apellido})`,
            ip:             getIP(req),
            datos_nuevos:   { nombre: nombre.trim(), apellido: apellido.trim(), username: username.trim(), email: email.trim(), id_perfil },
        });

        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al crear usuario' });
    }
};

// PUT /api/usuarios/:id
export const updateUsuario = async (req, res) => {
    const { id } = req.params;
    const {
        nombre, apellido, username, email, id_perfil, alias_asesor, estado, password,
        dni, celular, foto_perfil,
        contactos_emergencia
    } = req.body;

    // Validar contactos de emergencia si vienen
    if (contactos_emergencia) {
        if (!Array.isArray(contactos_emergencia) || contactos_emergencia.length > 2)
            return res.status(400).json({ message: 'Se permiten como máximo 2 contactos de emergencia' });
        for (const c of contactos_emergencia) {
            if (!c.telefono && !c.nombre) continue;
            if (!c.telefono) return res.status(400).json({ message: 'Cada contacto de emergencia debe tener teléfono' });
            if (!c.parentesco) return res.status(400).json({ message: 'El parentesco es obligatorio cuando se indica un número de emergencia' });
            if (!c.nombre) return res.status(400).json({ message: 'El nombre del contacto de emergencia es obligatorio' });
        }
    }
    try {
        // Obtener perfil del TARGET y del EJECUTOR juntos, incluyendo datos previos para auditoría
        const info = await pool.query(
            `SELECT
                t.id_usuario        AS target_id,
                t.nombre            AS target_nombre,
                t.apellido          AS target_apellido,
                t.username          AS target_username,
                t.email             AS target_email,
                t.celular           AS target_celular,
                t.dni               AS target_dni,
                t.alias_asesor      AS target_alias,
                t.foto_perfil       AS target_foto_perfil,
                t.estado            AS target_estado,
                t.id_perfil         AS target_perfil_id,
                pt.nombre           AS target_perfil_nombre,
                e.id_perfil         AS ejecutor_perfil_id,
                pe.nombre           AS ejecutor_perfil_nombre
             FROM usuarios t
             JOIN perfiles pt ON pt.id_perfil = t.id_perfil
             JOIN usuarios e  ON e.id_usuario = $2
             JOIN perfiles pe ON pe.id_perfil = e.id_perfil
             WHERE t.id_usuario = $1`,
            [id, req.usuario.id]
        );
        if (!info.rows.length) return res.status(404).json({ message: 'Usuario no encontrado' });

        const {
            target_nombre, target_apellido, target_username, target_email,
            target_celular, target_dni, target_alias, target_foto_perfil,
            target_estado, target_perfil_id, target_perfil_nombre,
            ejecutor_perfil_id, ejecutor_perfil_nombre
        } = info.rows[0];

        const targetEsAdmin      = target_perfil_nombre?.toLowerCase() === 'administrador';
        const targetEsSuperAdmin = target_perfil_nombre?.toLowerCase() === 'superadministrador';
        const ejecutorEsAdmin    = ejecutor_perfil_nombre?.toLowerCase() === 'administrador';
        const ejecutorEsSuperAdmin = ejecutor_perfil_nombre?.toLowerCase() === 'superadministrador';
        const mismosPerfil       = target_perfil_id === ejecutor_perfil_id;
        const esSelf             = Number(id) === req.usuario.id;

        // Solo admin o superAdmin pueden editar otros usuarios
        if (!ejecutorEsAdmin && !ejecutorEsSuperAdmin && !esSelf) {
            return res.status(403).json({
                message: 'No tienes permisos para editar otros usuarios'
            });
        }

        // SuperAdmin solo puede ser editado por otro superAdmin (o por sí mismo)
        if (targetEsSuperAdmin && !ejecutorEsSuperAdmin) {
            return res.status(403).json({
                message: 'No tienes permisos para editar a un SuperAdministrador'
            });
        }

        // Admin solo puede ser editado por sí mismo o por el superAdmin
        if (targetEsAdmin && !ejecutorEsSuperAdmin && !esSelf) {
            return res.status(403).json({
                message: 'No tienes permisos para editar a un usuario Administrador'
            });
        }

        // Usuarios del mismo perfil no pueden editarse entre sí (excepto a sí mismos)
        if (mismosPerfil && !esSelf) {
            return res.status(403).json({
                message: `Los usuarios con perfil "${target_perfil_nombre}" no pueden editarse entre sí`
            });
        }

        // SuperAdmin nunca puede desactivarse (ni él mismo ni nadie)
        if (targetEsSuperAdmin && estado != null && Number(estado) !== 1) {
            return res.status(403).json({
                message: 'El SuperAdministrador no puede desactivarse'
            });
        }

        // SuperAdmin no puede cambiar de perfil
        if (targetEsSuperAdmin && id_perfil && Number(id_perfil) !== target_perfil_id) {
            return res.status(403).json({
                message: 'No se puede cambiar el perfil de un SuperAdministrador'
            });
        }

        // Administrador no puede desactivarse (solo el superAdmin puede hacerlo)
        if (targetEsAdmin && !ejecutorEsSuperAdmin && estado != null && Number(estado) !== 1) {
            return res.status(403).json({
                message: 'Los usuarios Administrador no pueden desactivarse'
            });
        }

        // Administrador no puede cambiar de perfil (solo el superAdmin puede hacerlo)
        if (targetEsAdmin && !ejecutorEsSuperAdmin && id_perfil && Number(id_perfil) !== target_perfil_id) {
            return res.status(403).json({
                message: 'No se puede cambiar el perfil de un usuario Administrador'
            });
        }

        // Protección al asignar perfiles elevados
        let nuevoPerfil = target_perfil_nombre;
        if (id_perfil) {
            const perfilDestinoRes = await pool.query(
                `SELECT nombre FROM perfiles WHERE id_perfil = $1`, [id_perfil]
            );
            const perfilDestinoNombre = perfilDestinoRes.rows[0]?.nombre?.toLowerCase();
            const perfilCambia = Number(id_perfil) !== target_perfil_id;
            if (perfilCambia) nuevoPerfil = perfilDestinoRes.rows[0]?.nombre ?? `Perfil #${id_perfil}`;
            // Nadie puede asignar superAdministrador (solo aplica si el perfil cambia)
            if (perfilDestinoNombre === 'superadministrador' && perfilCambia) {
                return res.status(403).json({
                    message: 'No se puede asignar el perfil SuperAdministrador'
                });
            }
            // Solo superAdmin puede asignar Administrador
            if (perfilDestinoNombre === 'administrador' && !ejecutorEsSuperAdmin && perfilCambia) {
                return res.status(403).json({
                    message: 'Solo el SuperAdministrador puede asignar el perfil Administrador'
                });
            }
        }

        // Verificar que el nuevo username no esté en uso por otro usuario activo
        if (username) {
            const colision = await pool.query(
                `SELECT id_usuario FROM usuarios
                 WHERE username = $1 AND id_usuario != $2 AND estado != 2`,
                [username.trim(), id]
            );
            if (colision.rows.length > 0)
                return res.status(409).json({ message: 'El nombre de usuario ya está en uso' });
        }

        if (password) {
            const hash = await bcrypt.hash(password, 10);
            await pool.query(
                `UPDATE usuarios
                 SET nombre=$1, apellido=$2, username=$3, email=$4, id_perfil=$5,
                     alias_asesor=$6, estado=$7, password_hash=$8,
                     dni=$9, celular=$10, foto_perfil=$11, updated_at=NOW()
                 WHERE id_usuario=$12`,
                [nombre, apellido, username?.trim(), email, id_perfil, alias_asesor || null,
                 estado ?? 1, hash,
                 dni || null, celular || null, foto_perfil || null, id]
            );
        } else {
            await pool.query(
                `UPDATE usuarios
                 SET nombre=$1, apellido=$2, username=$3, email=$4, id_perfil=$5,
                     alias_asesor=$6, estado=$7,
                     dni=$8, celular=$9, foto_perfil=$10, updated_at=NOW()
                 WHERE id_usuario=$11`,
                [nombre, apellido, username?.trim(), email, id_perfil, alias_asesor || null,
                 estado ?? 1,
                 dni || null, celular || null, foto_perfil || null, id]
            );
        }

        // Actualizar contactos de emergencia si se enviaron
        if (contactos_emergencia !== undefined) {
            await pool.query('DELETE FROM contacto_emergencia_usuario WHERE id_usuario=$1', [id]);
            for (const c of (contactos_emergencia || []).filter(c => c.telefono)) {
                await pool.query(
                    `INSERT INTO contacto_emergencia_usuario (id_usuario, nombre, parentesco, telefono)
                     VALUES ($1,$2,$3,$4)`,
                    [id, c.nombre.trim(), c.parentesco.trim(), c.telefono.trim()]
                );
            }
        }

        const ESTADO_USR = { 0: 'Inactivo', 1: 'Activo', 2: 'Eliminado' };
        const cambios = [];
        if (`${target_nombre} ${target_apellido}` !== `${nombre} ${apellido}`)
            cambios.push(`nombre: "${target_nombre} ${target_apellido}" → "${nombre} ${apellido}"`);
        if (String(target_estado) !== String(estado ?? 1))
            cambios.push(`estado: ${ESTADO_USR[target_estado] ?? target_estado} → ${ESTADO_USR[String(estado ?? 1)] ?? estado}`);
        if (target_perfil_nombre !== nuevoPerfil)
            cambios.push(`perfil: "${target_perfil_nombre}" → "${nuevoPerfil}"`);
        if ((target_username || '') !== (username?.trim() || ''))
            cambios.push(`usuario: "${target_username}" → "${username?.trim()}"`);
        if (password) cambios.push('contraseña actualizada');
        if ((target_email || '') !== (email || ''))
            cambios.push(`email: "${target_email || '—'}" → "${email || '—'}"`);
        if ((target_celular || '') !== (celular || ''))
            cambios.push(`celular: ${target_celular || '—'} → ${celular || '—'}`);
        if ((target_dni || '') !== (dni || ''))
            cambios.push(`DNI: ${target_dni || '—'} → ${dni || '—'}`);
        if ((target_alias || '') !== (alias_asesor || ''))
            cambios.push(`alias: "${target_alias || '—'}" → "${alias_asesor || '—'}"`);
        const fotoVieja = target_foto_perfil || null;
        const fotoNueva = foto_perfil || null;
        if (fotoVieja !== fotoNueva) {
            if (!fotoVieja && fotoNueva)       cambios.push('foto de perfil: agregada');
            else if (fotoVieja && !fotoNueva)  cambios.push('foto de perfil: eliminada');
            else                               cambios.push('foto de perfil: actualizada');
        }
        const diffStr = cambios.length ? cambios.join(' | ') : 'sin cambios';

        registrarAuditoria({
            id_usuario:       req.usuario.id,
            nombre_usuario:   req.usuario.nombre || req.usuario.username,
            accion:           'EDITAR',
            modulo:           'Usuarios',
            descripcion:      `Usuario #${id} "${target_username}" (${nombre} ${apellido}) — ${diffStr}`,
            ip:               getIP(req),
            datos_anteriores: { nombre: target_nombre, apellido: target_apellido, estado: target_estado, id_perfil: target_perfil_id, username: target_username, email: target_email, celular: target_celular || null },
            datos_nuevos:     { nombre, apellido, estado: estado ?? 1, id_perfil: id_perfil ? Number(id_perfil) : target_perfil_id, username: username?.trim(), email, celular: celular || null },
        });

        res.json({ message: 'Usuario actualizado' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al actualizar usuario' });
    }
};

// PATCH /api/usuarios/:id/reactivar
export const reactivarUsuario = async (req, res) => {
    const { id } = req.params;
    try {
        // Verificar que el usuario existe (incluyendo eliminados, estado=2)
        const usuarioRes = await pool.query(
            `SELECT u.id_usuario, u.nombre, u.apellido, u.estado,
                    p.nombre AS perfil_nombre
             FROM usuarios u
             JOIN perfiles p ON p.id_perfil = u.id_perfil
             WHERE u.id_usuario = $1`,
            [id]
        );
        if (!usuarioRes.rows.length)
            return res.status(404).json({ message: 'Usuario no encontrado' });

        const { nombre, apellido, estado, perfil_nombre } = usuarioRes.rows[0];

        if (estado !== 2)
            return res.status(400).json({ message: 'El usuario no está eliminado' });

        // Verificar permisos: obtener perfil del ejecutor
        const ejecutorRes = await pool.query(
            `SELECT p.nombre AS perfil_nombre
             FROM usuarios u JOIN perfiles p ON p.id_perfil = u.id_perfil
             WHERE u.id_usuario = $1`, [req.usuario.id]
        );
        const ejecutorPerfil       = ejecutorRes.rows[0]?.perfil_nombre?.toLowerCase();
        const ejecutorEsAdmin      = ejecutorPerfil === 'administrador';
        const ejecutorEsSuperAdmin = ejecutorPerfil === 'superadministrador';

        if (!ejecutorEsAdmin && !ejecutorEsSuperAdmin) {
            return res.status(403).json({
                message: 'Solo los administradores pueden reactivar usuarios'
            });
        }

        // Admin no puede reactivar a un superAdmin
        if (perfil_nombre?.toLowerCase() === 'superadministrador' && !ejecutorEsSuperAdmin) {
            return res.status(403).json({
                message: 'No tienes permisos para reactivar a un SuperAdministrador'
            });
        }

        // Verificar que el username/email no colisione con otro usuario activo
        const usuarioCompleto = await pool.query(
            'SELECT username, email FROM usuarios WHERE id_usuario=$1', [id]
        );
        const { username, email } = usuarioCompleto.rows[0];
        const colision = await pool.query(
            `SELECT id_usuario FROM usuarios
             WHERE (username=$1 OR email=$2) AND id_usuario != $3 AND estado != 2`,
            [username, email, id]
        );
        if (colision.rows.length > 0)
            return res.status(409).json({
                message: 'No se puede reactivar: el username o email ya está en uso por otro usuario activo'
            });

        const result = await pool.query(
            `UPDATE usuarios
             SET estado=1, eliminado_por=NULL, deleted_at=NULL,
                 modificado_por=$1, updated_at=NOW()
             WHERE id_usuario=$2 RETURNING id_usuario, nombre, apellido, username, email, estado`,
            [req.usuario.id, id]
        );

        registrarAuditoria({
            id_usuario:       req.usuario.id,
            nombre_usuario:   req.usuario.nombre || req.usuario.username,
            accion:           'EDITAR',
            modulo:           'Usuarios',
            descripcion:      `Usuario #${id} reactivado: ${nombre} ${apellido} (Perfil: ${perfil_nombre})`,
            ip:               getIP(req),
            datos_anteriores: { id_usuario: Number(id), estado: 2 },
            datos_nuevos:     { estado: 1 },
        });

        res.json({
            ...result.rows[0],
            message: `Usuario ${nombre} ${apellido} reactivado exitosamente`
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al reactivar usuario' });
    }
};

// DELETE /api/usuarios/:id (soft delete)
export const deleteUsuario = async (req, res) => {
    const { id } = req.params;

    // No puede eliminarse a sí mismo
    if (Number(id) === req.usuario.id)
        return res.status(400).json({ message: 'No puedes eliminarte a ti mismo' });

    try {
        // Obtener perfil del TARGET y del EJECUTOR en una sola consulta
        const resultado = await pool.query(
            `SELECT
                t.id_perfil      AS target_perfil_id,
                pt.nombre        AS target_perfil_nombre,
                e.id_perfil      AS ejecutor_perfil_id,
                pe.nombre        AS ejecutor_perfil_nombre
             FROM usuarios t
             JOIN perfiles pt ON pt.id_perfil = t.id_perfil
             JOIN usuarios e  ON e.id_usuario = $2
             JOIN perfiles pe ON pe.id_perfil = e.id_perfil
             WHERE t.id_usuario = $1`, [id, req.usuario.id]
        );
        if (!resultado.rows.length) return res.status(404).json({ message: 'Usuario no encontrado' });

        const { target_perfil_id, target_perfil_nombre,
                ejecutor_perfil_id, ejecutor_perfil_nombre } = resultado.rows[0];

        const targetEsAdmin      = target_perfil_nombre?.toLowerCase() === 'administrador';
        const targetEsSuperAdmin = target_perfil_nombre?.toLowerCase() === 'superadministrador';
        const ejecutorEsAdmin    = ejecutor_perfil_nombre?.toLowerCase() === 'administrador';
        const ejecutorEsSuperAdmin = ejecutor_perfil_nombre?.toLowerCase() === 'superadministrador';

        // Solo admin o superAdmin pueden eliminar usuarios
        if (!ejecutorEsAdmin && !ejecutorEsSuperAdmin) {
            return res.status(403).json({
                message: 'No tienes permisos para eliminar usuarios'
            });
        }

        // SuperAdmin no puede ser eliminado por nadie
        if (targetEsSuperAdmin) {
            return res.status(403).json({
                message: 'No tienes permisos para eliminar a un SuperAdministrador'
            });
        }

        // Administrador solo puede ser eliminado por el superAdmin
        if (targetEsAdmin && !ejecutorEsSuperAdmin) {
            return res.status(403).json({
                message: 'No tienes permisos para eliminar a un Administrador'
            });
        }

        // Mismos perfiles no pueden eliminarse entre sí
        if (target_perfil_id === ejecutor_perfil_id) {
            return res.status(403).json({
                message: `Los usuarios con perfil "${target_perfil_nombre}" no pueden eliminarse entre sí`
            });
        }

        const result = await pool.query(
            `UPDATE usuarios SET estado=2, eliminado_por=$1 WHERE id_usuario=$2 RETURNING id_usuario`,
            [req.usuario.id, id]
        );
        if (result.rowCount === 0) return res.status(404).json({ message: 'Usuario no encontrado' });

        registrarAuditoria({
            id_usuario:       req.usuario.id,
            nombre_usuario:   req.usuario.nombre || req.usuario.username,
            accion:           'ELIMINAR',
            modulo:           'Usuarios',
            descripcion:      `Usuario #${id} eliminado (soft-delete)`,
            ip:               getIP(req),
            datos_anteriores: { id_usuario: Number(id), estado: 1 },
            datos_nuevos:     { estado: 2 },
        });

        res.json({ message: 'Usuario eliminado' });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al eliminar usuario' });
    }
};