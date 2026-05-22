import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import morgan from 'morgan';
import cors from 'cors';
import authRoutes            from './routes/authRoutes.js';
import perfilesRoutes        from './routes/perfilesRoutes.js';
import usuariosRoutes        from './routes/usuariosRoutes.js';
import clientesRoutes        from './routes/clientesRoutes.js';
import opcionesRoutes        from './routes/opcionesRoutes.js';
import permisosRoutes        from './routes/permisosRoutes.js';
import planesRoutes          from './routes/planesRoutes.js';
import membresiasRoutes      from './routes/membresiasRoutes.js';
import categoriasRoutes      from './routes/categoriasRoutes.js';
import productosRoutes       from './routes/productosRoutes.js';
import presentacionesRoutes  from './routes/presentacionesRoutes.js';
import asistenciasRoutes     from './routes/asistenciasRoutes.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.static(__dirname + '/public'));

// API
app.use('/api/auth',           authRoutes);
app.use('/api/perfiles',       perfilesRoutes);
app.use('/api/usuarios',       usuariosRoutes);
app.use('/api/clientes',       clientesRoutes);
app.use('/api/opciones',       opcionesRoutes);
app.use('/api/permisos',       permisosRoutes);
app.use('/api/planes',         planesRoutes);
app.use('/api/membresias',     membresiasRoutes);
app.use('/api/categorias',     categoriasRoutes);
app.use('/api/productos',      productosRoutes);
app.use('/api/presentaciones', presentacionesRoutes);
app.use('/api/asistencias',   asistenciasRoutes);

// Páginas
app.get('/',          (req, res) => res.sendFile(__dirname + '/public/login.html'));
app.get('/login',     (req, res) => res.sendFile(__dirname + '/public/login.html'));
app.use('/dashboard', (req, res) => res.sendFile(__dirname + '/public/dashboard.html'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor en http://localhost:${PORT}`));
