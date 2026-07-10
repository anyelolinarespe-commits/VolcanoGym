import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import morgan from 'morgan';
import cors from 'cors';
import { verificarToken } from './middlewares/verificarToken.js';
import { uploadComprobante } from './middlewares/upload.js';
import { pool } from './config/bd.js';
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
import inventarioRoutes from './routes/inventarioRoutes.js';
import fotosRoutes from './routes/fotosRoutes.js';
import presentacionFotosRoutes from './routes/presentacionFotosRoutes.js';
import ventasRoutes    from './routes/ventasRoutes.js';
import auditoriaRoutes from './routes/auditoriaRoutes.js';
import configuracionRoutes from './routes/configuracionRoutes.js';
import importarRoutes     from './routes/importarRoutes.js';
import clienteAuthRoutes  from './routes/clienteAuthRoutes.js';
import miCuentaRoutes     from './routes/miCuentaRoutes.js';
import cajaRoutes         from './routes/cajaRoutes.js';
import reportesRoutes     from './routes/reportesRoutes.js';
import notificacionesRoutes from './routes/notificacionesRoutes.js';
import cron from 'node-cron';
import { ejecutarGeneracionDiaria, purgarNotificacionesViejas } from './jobs/notificacionesJob.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
// Estáticos: 'no-cache' obliga a revalidar (304 si no cambió, 200 si sí).
// Evita que el navegador sirva JS/HTML viejos cacheados sin tener que forzar recarga.
app.use(express.static(__dirname + '/public', {
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache'),
}));

// Sitio web público (landing) servido en /volcano desde la carpeta volcano_web
app.get('/volcano',          (req, res) => res.sendFile(path.join(__dirname, '../volcano_web/index.html')));
app.get('/volcano/planes',   (req, res) => res.sendFile(path.join(__dirname, '../volcano_web/planes.html')));
app.get('/volcano/catalogo', (req, res) => res.sendFile(path.join(__dirname, '../volcano_web/catalogo.html')));
app.use('/volcano', express.static(path.join(__dirname, '../volcano_web'), {
  setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache'),
}));

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
app.use('/api/inventario', inventarioRoutes);
app.use('/api/productos/:id/fotos', fotosRoutes);
app.use('/api/presentaciones/producto-precio/:id_pp/fotos', presentacionFotosRoutes);
app.use('/api/ventas',    ventasRoutes);
app.use('/api/auditoria', auditoriaRoutes);
app.use('/api/configuracion', configuracionRoutes);
app.use('/api/importar',     importarRoutes);
app.use('/api/cliente-auth', clienteAuthRoutes);
app.use('/api/mi-cuenta',    miCuentaRoutes);
app.use('/api/caja',         cajaRoutes);
app.use('/api/reportes',     reportesRoutes);
app.use('/api/notificaciones', notificacionesRoutes);

// Upload de capturas de comprobantes de pago
app.post('/api/uploads/comprobante',
  verificarToken,
  uploadComprobante.single('file'),
  (req, res) => {
    if (!req.file) return res.status(400).json({ message: 'No se recibió ningún archivo' });
    const url = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    res.json({ url });
  }
);

// Páginas
app.get('/',               (req, res) => res.sendFile(__dirname + '/public/login.html'));
app.get('/login',          (req, res) => res.sendFile(__dirname + '/public/login.html'));
app.get('/mi-cuenta.html', (req, res) => res.redirect('/cliente/mi-cuenta.html'));
app.get('/mi-cuenta',      (req, res) => res.redirect('/cliente/mi-cuenta.html'));
app.get('/cliente',        (req, res) => res.sendFile(path.join(__dirname, '../volcano_web/cliente/login.html')));
app.use('/cliente',        express.static(path.join(__dirname, '../volcano_web/cliente'), { setHeaders: r => r.setHeader('Cache-Control','no-cache') }));
app.use('/dashboard', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(__dirname + '/public/dashboard.html');
});

// Cron: genera alertas pendientes de Notificaciones todos los días a las 7am
// (hora de Lima). Solo genera filas — el envío sigue siendo manual (botón
// WhatsApp en el dashboard).
cron.schedule('0 7 * * *', () => {
  ejecutarGeneracionDiaria().catch(err => console.error('Error en job de notificaciones:', err));
}, { timezone: 'America/Lima' });

// Purga mensual (día 1 a las 3am) de notificaciones ya resueltas con más de 6 meses.
cron.schedule('0 3 1 * *', () => {
  purgarNotificacionesViejas().catch(err => console.error('Error en purga de notificaciones:', err));
}, { timezone: 'America/Lima' });

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  const base = `http://localhost:${PORT}`;
  console.log('\n  🌋  VOLCANO GYM — Servidor activo\n');
  console.log(`  🔐  Login Dashboard :  ${base}/login`);
  console.log(`  🌐  Página Web      :  ${base}/volcano`);
  console.log(`  👤  Login Cliente   :  ${base}/cliente\n`);
});
