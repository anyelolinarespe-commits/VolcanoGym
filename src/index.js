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
import ventasRoutes    from './routes/ventasRoutes.js';
import reportesRoutes  from './routes/reportesRoutes.js';
import auditoriaRoutes from './routes/auditoriaRoutes.js';

dotenv.config();

// ── Migraciones automáticas al iniciar ──────────────────────────────────────
<<<<<<< HEAD

pool.query(`ALTER TABLE membresia ADD COLUMN IF NOT EXISTS fecha_congelamiento DATE`)
  .catch(e => console.warn('Migration fecha_congelamiento:', e.message));

=======
pool.query(`ALTER TABLE membresia ADD COLUMN IF NOT EXISTS fecha_congelamiento DATE`)
  .catch(e => console.warn('Migration fecha_congelamiento:', e.message));

// Permitir fecha_fin = fecha_inicio (planes de 1 día)
pool.query(`ALTER TABLE membresia DROP CONSTRAINT IF EXISTS chk_memb_fechas`)
  .then(() => pool.query(`ALTER TABLE membresia ADD CONSTRAINT chk_memb_fechas CHECK (fecha_fin >= fecha_inicio)`))
  .catch(e => console.warn('Migration chk_memb_fechas:', e.message));

>>>>>>> origin/main
// Tabla central de auditoría
pool.query(`
  CREATE TABLE IF NOT EXISTS auditoria (
    id             BIGSERIAL PRIMARY KEY,
    id_usuario     INTEGER REFERENCES usuarios(id_usuario) ON DELETE SET NULL,
    nombre_usuario VARCHAR(200),
    accion         VARCHAR(20) NOT NULL
                     CHECK (accion IN ('CREAR','EDITAR','ELIMINAR','LOGIN','LOGOUT')),
    modulo         VARCHAR(100) NOT NULL,
    descripcion    TEXT,
    ip_usuario     VARCHAR(45),
    created_at     TIMESTAMPTZ DEFAULT NOW()
  )
`).catch(e => console.warn('Migration auditoria:', e.message));

pool.query(`CREATE INDEX IF NOT EXISTS idx_auditoria_created  ON auditoria(created_at DESC)`)
  .catch(e => console.warn('Migration idx auditoria created:', e.message));
pool.query(`CREATE INDEX IF NOT EXISTS idx_auditoria_usuario  ON auditoria(id_usuario)`)
  .catch(e => console.warn('Migration idx auditoria usuario:', e.message));
pool.query(`CREATE INDEX IF NOT EXISTS idx_auditoria_accion   ON auditoria(accion)`)
  .catch(e => console.warn('Migration idx auditoria accion:', e.message));

// Campos de auditoría faltantes en tablas existentes
pool.query(`ALTER TABLE venta            ADD COLUMN IF NOT EXISTS anulado_por    INTEGER REFERENCES usuarios(id_usuario)`)
  .catch(e => console.warn('Migration venta.anulado_por:', e.message));
<<<<<<< HEAD
pool.query(`ALTER TABLE venta            ADD COLUMN IF NOT EXISTS pago_codigo_operacion VARCHAR(60)`)
  .catch(e => console.warn('Migration venta.pago_codigo_operacion:', e.message));
pool.query(`ALTER TABLE venta            ADD COLUMN IF NOT EXISTS pago_referencia VARCHAR(150)`)
  .catch(e => console.warn('Migration venta.pago_referencia:', e.message));
pool.query(`ALTER TABLE venta            ADD COLUMN IF NOT EXISTS pago_url_comprobante TEXT`)
  .catch(e => console.warn('Migration venta.pago_url_comprobante:', e.message));
pool.query(`ALTER TABLE verificacion_pago ALTER COLUMN ruta_imagen TYPE TEXT`)
  .catch(e => console.warn('Migration verificacion_pago.ruta_imagen:', e.message));
pool.query(`ALTER TABLE venta            ADD COLUMN IF NOT EXISTS verificado_por INTEGER REFERENCES usuarios(id_usuario)`)
  .catch(e => console.warn('Migration venta.verificado_por:', e.message));
pool.query(`ALTER TABLE venta            ADD COLUMN IF NOT EXISTS verificado_at TIMESTAMPTZ`)
  .catch(e => console.warn('Migration venta.verificado_at:', e.message));
=======
>>>>>>> origin/main
pool.query(`ALTER TABLE membresia        ADD COLUMN IF NOT EXISTS eliminado_por  INTEGER REFERENCES usuarios(id_usuario)`)
  .catch(e => console.warn('Migration membresia.eliminado_por:', e.message));
pool.query(`ALTER TABLE plan_membresia   ADD COLUMN IF NOT EXISTS creado_por     INTEGER REFERENCES usuarios(id_usuario)`)
  .catch(e => console.warn('Migration plan_membresia.creado_por:', e.message));
pool.query(`ALTER TABLE plan_membresia   ADD COLUMN IF NOT EXISTS modificado_por INTEGER REFERENCES usuarios(id_usuario)`)
  .catch(e => console.warn('Migration plan_membresia.modificado_por:', e.message));
pool.query(`ALTER TABLE plan_membresia   ADD COLUMN IF NOT EXISTS created_at     TIMESTAMPTZ DEFAULT NOW()`)
  .catch(e => console.warn('Migration plan_membresia.created_at:', e.message));
pool.query(`ALTER TABLE producto         ADD COLUMN IF NOT EXISTS modificado_por INTEGER REFERENCES usuarios(id_usuario)`)
  .catch(e => console.warn('Migration producto.modificado_por:', e.message));
pool.query(`ALTER TABLE categoria_producto ADD COLUMN IF NOT EXISTS modificado_por INTEGER REFERENCES usuarios(id_usuario)`)
  .catch(e => console.warn('Migration categoria_producto.modificado_por:', e.message));
pool.query(`ALTER TABLE perfiles         ADD COLUMN IF NOT EXISTS modificado_por INTEGER REFERENCES usuarios(id_usuario)`)
  .catch(e => console.warn('Migration perfiles.modificado_por:', e.message));

// Opción de menú para el módulo de auditoría (solo si no existe)
pool.query(`
  INSERT INTO opciones (nombre, ruta, icono, orden, activo)
  SELECT 'Auditoría', 'auditoria', 'bi-shield-check', 99, TRUE
  WHERE NOT EXISTS (SELECT 1 FROM opciones WHERE ruta = 'auditoria')
`).catch(e => console.warn('Migration opcion auditoria:', e.message));

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(cors());
app.use(morgan('dev'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
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
app.use('/api/inventario', inventarioRoutes);
app.use('/api/productos/:id/fotos', fotosRoutes);
app.use('/api/ventas',    ventasRoutes);
app.use('/api/reportes', reportesRoutes);
app.use('/api/auditoria', auditoriaRoutes);

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
app.get('/',          (req, res) => res.sendFile(__dirname + '/public/login.html'));
app.get('/login',     (req, res) => res.sendFile(__dirname + '/public/login.html'));
app.use('/dashboard', (req, res) => res.sendFile(__dirname + '/public/dashboard.html'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Servidor en http://localhost:${PORT}`));
