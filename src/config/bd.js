import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

export const pool = new pg.Pool({
    user:     process.env.DB_USER,
    host:     process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port:     Number(process.env.DB_PORT),
    max:                     20,      // conexiones máximas en el pool
    idleTimeoutMillis:       30000,   // cerrar conexiones ociosas tras 30s
    connectionTimeoutMillis: 5000,    // error si no hay conexión disponible en 5s
});