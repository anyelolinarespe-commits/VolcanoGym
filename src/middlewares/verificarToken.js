import jwt from 'jsonwebtoken';
import { pool } from '../config/bd.js';

export const verificarToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ message: 'Acceso denegado. Token requerido.' });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Verificar que el usuario sigue activo en la BD
        const { rows } = await pool.query(
            'SELECT estado FROM usuarios WHERE id_usuario = $1',
            [decoded.id]
        );

        if (!rows.length || rows[0].estado !== 1) {
            return res.status(401).json({ message: 'Tu sesión ha sido desactivada.' });
        }

        req.usuario = decoded;
        next();
    } catch (error) {
        return res.status(403).json({ message: 'Token inválido o expirado.' });
    }
};