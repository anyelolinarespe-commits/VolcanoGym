import jwt from 'jsonwebtoken';
import { pool } from '../config/bd.js';

export const verificarClienteToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: 'Acceso denegado. Token requerido.' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        if (decoded.type !== 'cliente') {
            return res.status(403).json({ message: 'Token no válido para este recurso.' });
        }

        const { rows } = await pool.query(
            'SELECT activo FROM cliente WHERE id_cliente = $1 AND deleted_at IS NULL',
            [decoded.id_cliente]
        );

        if (!rows.length || !rows[0].activo) {
            return res.status(401).json({ message: 'Tu cuenta ha sido desactivada. Contacta al gimnasio.' });
        }

        req.cliente = decoded;
        next();
    } catch {
        return res.status(403).json({ message: 'Token inválido o expirado.' });
    }
};
