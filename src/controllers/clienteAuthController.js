import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../config/bd.js';

// POST /api/cliente-auth/login
export const loginCliente = async (req, res) => {
    const { dni, password } = req.body;
    if (!dni || !password)
        return res.status(400).json({ message: 'DNI y contraseña son requeridos.' });

    try {
        const { rows } = await pool.query(
            `SELECT id_cliente, dni, nombre, apellido, activo,
                    foto_perfil, qr_code, password_hash, contrasena_cambiada
             FROM cliente
             WHERE dni = $1 AND deleted_at IS NULL`,
            [dni.trim()]
        );

        if (!rows.length)
            return res.status(401).json({ message: 'DNI o contraseña incorrectos.' });

        const c = rows[0];

        if (!c.activo)
            return res.status(403).json({ message: 'Tu cuenta está inactiva. Contacta al gimnasio.' });

        // Primera vez: password_hash null → aceptar DNI como contraseña y hashearla
        if (!c.password_hash) {
            if (password.trim() !== c.dni)
                return res.status(401).json({ message: 'DNI o contraseña incorrectos.' });

            const hash = await bcrypt.hash(password.trim(), 10);
            await pool.query(
                'UPDATE cliente SET password_hash = $1 WHERE id_cliente = $2',
                [hash, c.id_cliente]
            );
        } else {
            const ok = await bcrypt.compare(password, c.password_hash);
            if (!ok)
                return res.status(401).json({ message: 'DNI o contraseña incorrectos.' });
        }

        const token = jwt.sign(
            { type: 'cliente', id_cliente: c.id_cliente, dni: c.dni,
              nombre: c.nombre, apellido: c.apellido },
            process.env.JWT_SECRET,
            { expiresIn: '12h' }
        );

        return res.json({
            token,
            cliente: {
                id_cliente:          c.id_cliente,
                nombre:              c.nombre,
                apellido:            c.apellido,
                dni:                 c.dni,
                foto_perfil:         c.foto_perfil,
                qr_code:             c.qr_code,
                contrasena_cambiada: !!c.contrasena_cambiada,
            }
        });
    } catch (e) {
        console.error('loginCliente:', e);
        return res.status(500).json({ message: 'Error interno del servidor.' });
    }
};

// POST /api/cliente-auth/cambiar-password
export const cambiarPasswordCliente = async (req, res) => {
    const { password_actual, password_nuevo } = req.body;
    const id = req.cliente.id_cliente;

    if (!password_actual || !password_nuevo)
        return res.status(400).json({ message: 'Todos los campos son requeridos.' });
    if (password_nuevo.length < 6)
        return res.status(400).json({ message: 'La nueva contraseña debe tener al menos 6 caracteres.' });

    try {
        const { rows } = await pool.query(
            'SELECT dni, password_hash FROM cliente WHERE id_cliente = $1',
            [id]
        );
        const c = rows[0];

        // Verificar contraseña actual (puede ser el hash guardado o DNI si aún no cambió)
        let valida = false;
        if (c.password_hash) {
            valida = await bcrypt.compare(password_actual, c.password_hash);
        } else {
            valida = password_actual === c.dni;
        }

        if (!valida)
            return res.status(401).json({ message: 'La contraseña actual no es correcta.' });

        const hash = await bcrypt.hash(password_nuevo, 10);
        await pool.query(
            'UPDATE cliente SET password_hash = $1, contrasena_cambiada = true WHERE id_cliente = $2',
            [hash, id]
        );

        return res.json({ message: 'Contraseña actualizada correctamente.' });
    } catch (e) {
        console.error('cambiarPasswordCliente:', e);
        return res.status(500).json({ message: 'Error interno del servidor.' });
    }
};
