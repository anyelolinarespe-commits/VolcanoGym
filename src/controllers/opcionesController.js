import { pool } from '../config/bd.js';

// GET /api/opciones — todas las opciones activas
export const getOpciones = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id_opcion, nombre, ruta, icono, orden, activo
            FROM opciones
            WHERE activo = TRUE
            ORDER BY orden ASC, nombre ASC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al obtener opciones' });
    }
};

// GET /api/opciones/todas — incluyendo inactivas (solo admin)
export const getTodasOpciones = async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT id_opcion, nombre, ruta, icono, orden, activo
            FROM opciones
            ORDER BY orden ASC, nombre ASC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al obtener opciones' });
    }
};
