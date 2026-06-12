import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../config/bd.js';
import { registrarAuditoria, getIP } from '../helpers/auditoria.js';

export const login = async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({
            message: 'Usuario y contraseña son requeridos'
        });
    }

    try {
        // ── 1. Buscar usuario (excluye solo los eliminados con soft-delete)
        const result = await pool.query(
            `SELECT u.*, p.nombre AS perfil, p.estado AS perfil_estado
             FROM usuarios u
             JOIN perfiles p ON u.id_perfil = p.id_perfil
             WHERE u.username = $1
               AND u.estado != 2
               AND u.deleted_at IS NULL`,
            [username]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                message: 'Usuario o contraseña incorrectos'
            });
        }

        const usuario = result.rows[0];

        // ── 2. Verificar contraseña ANTES de revelar cualquier estado
        const passwordValida = await bcrypt.compare(password, usuario.password_hash);
        if (!passwordValida) {
            return res.status(401).json({
                message: 'Usuario o contraseña incorrectos'
            });
        }

        // ── 3. Verificar que la cuenta del usuario esté activa
        if (usuario.estado !== 1) {
            return res.status(403).json({
                message: 'Tu cuenta está inactiva. Contacta al administrador.'
            });
        }

        // ── 4. Verificar que el perfil esté activo
        if (usuario.perfil_estado !== 1) {
            return res.status(403).json({
                message: 'Tu perfil de acceso está inactivo. Contacta al administrador.'
            });
        }

        // ── 4. Obtener opciones permitidas para este perfil ──
        const nombrePerfil = usuario.perfil?.toLowerCase() || '';
        let opcionesResult;

        if (nombrePerfil === 'superadministrador') {
            // SuperAdministrador siempre ve todos los módulos activos
            opcionesResult = await pool.query(`
                SELECT id_opcion, nombre, ruta, icono, orden
                FROM opciones
                WHERE activo = TRUE
                ORDER BY orden ASC, nombre ASC
            `);
        } else {
            // Todos los demás perfiles (incluido Administrador) respetan la tabla permisos
            opcionesResult = await pool.query(`
                SELECT o.id_opcion, o.nombre, o.ruta, o.icono, o.orden
                FROM opciones o
                JOIN permisos p ON p.id_opcion = o.id_opcion
                WHERE p.id_perfil = $1
                  AND o.activo = TRUE
                ORDER BY o.orden ASC, o.nombre ASC
            `, [usuario.id_perfil]);
        }

        const opciones = opcionesResult.rows;

        // ── 5. Generar JWT 
        const token = jwt.sign(
            {
                id:        usuario.id_usuario,
                username:  usuario.username,
                perfil:    usuario.perfil,
                nombre:    usuario.nombre,
                id_perfil: usuario.id_perfil
            },
            process.env.JWT_SECRET,
            { expiresIn: '8h' }
        );

        registrarAuditoria({
            id_usuario:     usuario.id_usuario,
            nombre_usuario: `${usuario.nombre} ${usuario.apellido}`.trim(),
            accion:         'LOGIN',
            modulo:         'Autenticación',
            descripcion:    `Inicio de sesión: ${usuario.username} (${usuario.perfil})`,
            ip:             getIP(req)
        });

        return res.status(200).json({
            token,
            usuario: {
                nombre:   usuario.nombre,
                apellido: usuario.apellido,
                username: usuario.username,
                perfil:   usuario.perfil
            },
            opciones // modulos a los que tiene acceso
        });

    } catch (error) {
        console.error('Error en login:', error);
        return res.status(500).json({ message: 'Error interno del servidor' });
    }
};

export const logout = async (req, res) => {
    const u = req.usuario;
    registrarAuditoria({
        id_usuario:     u.id,
        nombre_usuario: u.nombre || u.username,
        accion:         'LOGOUT',
        modulo:         'Autenticación',
        descripcion:    `Cierre de sesión: ${u.username}`,
        ip:             getIP(req)
    });
    return res.status(200).json({ message: 'Sesión cerrada' });
};
