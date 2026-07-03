import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import morgan from 'morgan';
import cors from 'cors';
import bcrypt from 'bcryptjs';
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
import reportesRoutes  from './routes/reportesRoutes.js';
import auditoriaRoutes from './routes/auditoriaRoutes.js';
import configuracionRoutes from './routes/configuracionRoutes.js';
import importarRoutes     from './routes/importarRoutes.js';
import clienteAuthRoutes  from './routes/clienteAuthRoutes.js';
import miCuentaRoutes     from './routes/miCuentaRoutes.js';

dotenv.config();

// ── Migraciones automáticas al iniciar ──────────────────────────────────────

pool.query(`ALTER TABLE membresia ADD COLUMN IF NOT EXISTS fecha_congelamiento DATE`)
  .catch(e => console.warn('Migration fecha_congelamiento:', e.message));

// Permitir fecha_fin = fecha_inicio (planes de 1 día) — re-aplicado desde main
pool.query(`ALTER TABLE membresia DROP CONSTRAINT IF EXISTS chk_memb_fechas`)
  .then(() => pool.query(`ALTER TABLE membresia ADD CONSTRAINT chk_memb_fechas CHECK (fecha_fin >= fecha_inicio)`))
  .catch(e => console.warn('Migration chk_memb_fechas:', e.message));

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
pool.query(`ALTER TABLE auditoria ADD COLUMN IF NOT EXISTS datos_anteriores JSONB`)
  .catch(e => console.warn('Migration auditoria.datos_anteriores:', e.message));
pool.query(`ALTER TABLE auditoria ADD COLUMN IF NOT EXISTS datos_nuevos JSONB`)
  .catch(e => console.warn('Migration auditoria.datos_nuevos:', e.message));

// ── Índices en claves foráneas / filtros calientes (rendimiento de listados) ──
[
  `CREATE INDEX IF NOT EXISTS idx_membresia_cliente   ON membresia(id_cliente)`,
  `CREATE INDEX IF NOT EXISTS idx_membresia_estado    ON membresia(estado)`,
  `CREATE INDEX IF NOT EXISTS idx_pago_membresia      ON pago(id_membresia)`,
  `CREATE INDEX IF NOT EXISTS idx_pago_estado_cuota   ON pago(estado_cuota)`,
  `CREATE INDEX IF NOT EXISTS idx_cliente_deleted     ON cliente(deleted_at)`,
  `CREATE INDEX IF NOT EXISTS idx_pp_producto         ON producto_presentacion(id_producto)`,
  `CREATE INDEX IF NOT EXISTS idx_venta_detalle_venta ON venta_detalle(id_venta)`,
  `CREATE INDEX IF NOT EXISTS idx_asistencia_cliente  ON asistencia(id_cliente)`,
  `CREATE INDEX IF NOT EXISTS idx_asistencia_fecha    ON asistencia(fecha_hora)`,
].forEach(sql =>
  pool.query(sql).catch(e => console.warn('Migration índice:', e.message)));

// Campos de auditoría faltantes en tablas existentes
pool.query(`ALTER TABLE venta            ADD COLUMN IF NOT EXISTS anulado_por    INTEGER REFERENCES usuarios(id_usuario)`)
  .catch(e => console.warn('Migration venta.anulado_por:', e.message));
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

// Galería de imágenes por presentación (variante de producto)
pool.query(`
  CREATE TABLE IF NOT EXISTS producto_presentacion_foto (
    id_foto      INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_pp        INTEGER NOT NULL REFERENCES producto_presentacion(id) ON DELETE CASCADE,
    url_foto     TEXT NOT NULL,
    es_principal BOOLEAN NOT NULL DEFAULT FALSE,
    orden        SMALLINT NOT NULL DEFAULT 0 CHECK (orden >= 0),
    creado_por   INTEGER,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`).catch(e => console.warn('Migration producto_presentacion_foto:', e.message));
pool.query(`CREATE INDEX IF NOT EXISTS idx_ppf_pp ON producto_presentacion_foto(id_pp)`)
  .catch(e => console.warn('Migration idx_ppf_pp:', e.message));
pool.query(`ALTER TABLE producto_presentacion_foto ADD COLUMN IF NOT EXISTS estado SMALLINT NOT NULL DEFAULT 1`)
  .catch(e => console.warn('Migration ppf.estado:', e.message));

// ── Portal de clientes: credenciales + historial de peso ──────────────────────
pool.query(`ALTER TABLE cliente ADD COLUMN IF NOT EXISTS password_hash TEXT`)
  .catch(e => console.warn('Migration cliente.password_hash:', e.message));
pool.query(`ALTER TABLE cliente ADD COLUMN IF NOT EXISTS contrasena_cambiada BOOLEAN DEFAULT false`)
  .catch(e => console.warn('Migration cliente.contrasena_cambiada:', e.message));
pool.query(`ALTER TABLE cliente ADD COLUMN IF NOT EXISTS altura_cm DECIMAL(5,2)`)
  .catch(e => console.warn('Migration cliente.altura_cm:', e.message));
pool.query(`ALTER TABLE cliente ADD COLUMN IF NOT EXISTS email VARCHAR(150)`)
  .catch(e => console.warn('Migration cliente.email:', e.message));
pool.query(`
  CREATE TABLE IF NOT EXISTS cliente_peso (
    id          SERIAL PRIMARY KEY,
    id_cliente  INT NOT NULL REFERENCES cliente(id_cliente) ON DELETE CASCADE,
    fecha       DATE NOT NULL DEFAULT CURRENT_DATE,
    peso_kg     DECIMAL(5,2) NOT NULL,
    altura_cm   DECIMAL(5,2),
    imc         DECIMAL(5,2),
    notas       TEXT,
    fuente      VARCHAR(20) NOT NULL DEFAULT 'cliente',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`).catch(e => console.warn('Migration cliente_peso:', e.message));
pool.query(`CREATE INDEX IF NOT EXISTS idx_cpeso_cliente ON cliente_peso(id_cliente)`)
  .catch(e => console.warn('Migration idx_cpeso_cliente:', e.message));

// Código de barras POR PRESENTACIÓN (cada variante es un SKU vendible distinto)
pool.query(`ALTER TABLE producto_presentacion ADD COLUMN IF NOT EXISTS codigo_barras VARCHAR(60)`)
  .catch(e => console.warn('Migration pp.codigo_barras:', e.message));
pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS ux_pp_codigo_barras ON producto_presentacion(codigo_barras) WHERE codigo_barras IS NOT NULL`)
  .catch(e => console.warn('Migration ux_pp_codigo_barras:', e.message));

// Fix signo de movimientos de VENTA: el trigger guardaba la cantidad en positivo,
// haciendo que el historial mostrara (+1) al vender en vez de (-1). Se corrige el
// trigger y se normalizan los datos históricos (cantidad de ventas → negativa).
pool.query(`
  CREATE OR REPLACE FUNCTION public.fn_descontar_stock_venta()
   RETURNS trigger
   LANGUAGE plpgsql
  AS $function$
      BEGIN
          UPDATE public.producto_presentacion
          SET stock_actual = stock_actual - NEW.cantidad,
              updated_at   = now()
          WHERE id = NEW.id_pp;

          INSERT INTO public.inventario_movimiento(
              id_pp, tipo, cantidad,
              stock_antes, stock_despues,
              boleta_ref, observacion, id_usuario_reg, created_at
          )
          SELECT
              NEW.id_pp,
              'venta'::public.tipo_movimiento_enum,
              -NEW.cantidad,
              stock_actual + NEW.cantidad,
              stock_actual,
              (SELECT numero_venta FROM public.venta WHERE id = NEW.id_venta),
              'Venta automatica',
              (SELECT id_usuario_reg FROM public.venta WHERE id = NEW.id_venta),
              now()
          FROM public.producto_presentacion WHERE id = NEW.id_pp;

          RETURN NEW;
      END
      $function$
`).catch(e => console.warn('Migration fix fn_descontar_stock_venta:', e.message));
pool.query(`UPDATE inventario_movimiento SET cantidad = -ABS(cantidad) WHERE tipo = 'venta' AND cantidad > 0`)
  .catch(e => console.warn('Migration normaliza signo ventas:', e.message));

// Reserva de stock (opción B): el control de stock se centraliza en el controlador.
// Se elimina el trigger que descontaba stock al insertar venta_detalle, porque
// causaba doble descuento y descontaba ventas pendientes antes de aprobar el pago.
pool.query(`DROP TRIGGER IF EXISTS trg_descontar_stock_venta ON venta_detalle`)
  .then(() => pool.query(`DROP FUNCTION IF EXISTS fn_descontar_stock_venta()`))
  .catch(e => console.warn('Migration drop trigger/función descuento venta:', e.message));

// Límite semanal de asistencias por plan
pool.query(`ALTER TABLE plan_membresia ADD COLUMN IF NOT EXISTS max_asistencias_semana INTEGER DEFAULT NULL`)
  .catch(e => console.warn('Migration max_asistencias_semana:', e.message));

// Plan Interdiario (3 visitas/semana, 1 mes)
pool.query(`
  INSERT INTO plan_membresia (nombre, tipo_cliente, duracion_meses, duracion_unidad, precio, max_asistencias_semana, activo)
  SELECT 'Interdiario', 'interdiario', 1, 'meses', 60, 3, TRUE
  WHERE NOT EXISTS (SELECT 1 FROM plan_membresia WHERE LOWER(nombre) = 'interdiario')
`).catch(e => console.warn('Migration plan interdiario:', e.message));

// Opción de menú para el módulo de auditoría (solo si no existe)
pool.query(`
  INSERT INTO opciones (nombre, ruta, icono, orden, activo)
  SELECT 'Auditoría', 'auditoria', 'bi-shield-check', 99, TRUE
  WHERE NOT EXISTS (SELECT 1 FROM opciones WHERE ruta = 'auditoria')
`).catch(e => console.warn('Migration opcion auditoria:', e.message));

// Opción de menú para importar socios
pool.query(`
  INSERT INTO opciones (nombre, ruta, icono, orden, activo)
  SELECT 'Importar Socios', 'importar-socios', 'bi-file-earmark-arrow-up', 98, TRUE
  WHERE NOT EXISTS (SELECT 1 FROM opciones WHERE ruta = 'importar-socios')
`).catch(e => console.warn('Migration opcion importar-socios:', e.message));

// Usuarios asesores iniciales (BEST, MARLE, DANI) — contraseña temporal: volcano123
(async () => {
  const ASESORES = [
    { nombre: 'Best',  apellido: '', alias: 'BEST',  username: 'best'  },
    { nombre: 'Marle', apellido: '', alias: 'MARLE', username: 'marle' },
    { nombre: 'Dani',  apellido: '', alias: 'DANI',  username: 'dani'  },
  ];
  const hash = await bcrypt.hash('volcano123', 10);
  for (const a of ASESORES) {
    pool.query(`
      INSERT INTO usuarios (id_perfil, nombre, apellido, username, email, password_hash, alias_asesor, estado, creado_por)
      SELECT 2, $1, $2, $3, $4, $5, $6, 1, 1
      WHERE NOT EXISTS (SELECT 1 FROM usuarios WHERE LOWER(username)=LOWER($7))
    `, [a.nombre, a.apellido, a.username, `${a.username}@volcanogym.pe`, hash, a.alias, a.username])
    .catch(e => console.warn(`Migration asesor ${a.alias}:`, e.message));
  }
})();

// Módulo Reportes: caja (apertura/cierre de turno) y egresos manuales.
// caja_egreso referencia caja_turno, así que se encadena tras su creación
// (las migraciones sueltas de arriba corren en paralelo sin orden garantizado).
pool.query(`
  CREATE TABLE IF NOT EXISTS caja_turno (
    id_turno                SERIAL PRIMARY KEY,
    id_usuario_apertura     INTEGER REFERENCES usuarios(id_usuario),
    id_usuario_cierre       INTEGER REFERENCES usuarios(id_usuario),
    monto_apertura          NUMERIC(10,2) NOT NULL,
    monto_cierre_declarado  NUMERIC(10,2),
    monto_cierre_esperado   NUMERIC(10,2),
    diferencia              NUMERIC(10,2),
    estado                  VARCHAR(20) NOT NULL DEFAULT 'abierto',
    observaciones           TEXT,
    abierto_at              TIMESTAMPTZ DEFAULT NOW(),
    cerrado_at              TIMESTAMPTZ
  )
`).then(() => pool.query(`
  CREATE TABLE IF NOT EXISTS caja_egreso (
    id_egreso      SERIAL PRIMARY KEY,
    id_turno       INTEGER REFERENCES caja_turno(id_turno),
    motivo         VARCHAR(200) NOT NULL,
    monto          NUMERIC(10,2) NOT NULL,
    id_usuario_reg INTEGER REFERENCES usuarios(id_usuario),
    created_at     TIMESTAMPTZ DEFAULT NOW()
  )
`)).catch(e => console.warn('Migration caja_turno/caja_egreso:', e.message));

// Opción de menú para el módulo de reportes
pool.query(`
  INSERT INTO opciones (nombre, ruta, icono, orden, activo)
  SELECT 'Reportes', 'reportes', 'bi-graph-up-arrow', 97, TRUE
  WHERE NOT EXISTS (SELECT 1 FROM opciones WHERE ruta = 'reportes')
`).catch(e => console.warn('Migration opcion reportes:', e.message));

// Tabla de configuración del sistema
pool.query(`
  CREATE TABLE IF NOT EXISTS configuracion_sistema (
    clave          VARCHAR(100) PRIMARY KEY,
    valor          TEXT,
    actualizado_at TIMESTAMPTZ DEFAULT NOW(),
    actualizado_por INTEGER REFERENCES usuarios(id_usuario) ON DELETE SET NULL
  )
`).catch(e => console.warn('Migration configuracion_sistema:', e.message));

// Tabla de redes sociales gestionables
pool.query(`
  CREATE TABLE IF NOT EXISTS redes_sociales_config (
    id         SERIAL PRIMARY KEY,
    nombre     VARCHAR(100) NOT NULL,
    tipo       VARCHAR(50)  NOT NULL,
    url        TEXT,
    activo     BOOLEAN      DEFAULT TRUE,
    orden      INTEGER      DEFAULT 0,
    created_at TIMESTAMPTZ  DEFAULT NOW()
  )
`).catch(e => console.warn('Migration redes_sociales_config:', e.message));

// Tabla de banners para la web pública
pool.query(`
  CREATE TABLE IF NOT EXISTS banners_config (
    id         SERIAL PRIMARY KEY,
    imagen     TEXT NOT NULL,
    fecha_fin  TIMESTAMPTZ,
    principal  BOOLEAN     DEFAULT FALSE,
    orden      INTEGER     DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )
`).catch(e => console.warn('Migration banners_config:', e.message));

// Columna principal para instalaciones previas
pool.query(`ALTER TABLE banners_config ADD COLUMN IF NOT EXISTS principal BOOLEAN DEFAULT FALSE`)
  .catch(e => console.warn('Migration banners_config.principal:', e.message));

// Opción de menú para configuración (solo si no existe)
pool.query(`
  INSERT INTO opciones (nombre, ruta, icono, orden, activo)
  SELECT 'Configuración', 'configuracion', 'bi-gear', 100, TRUE
  WHERE NOT EXISTS (SELECT 1 FROM opciones WHERE ruta = 'configuracion')
`).catch(e => console.warn('Migration opcion configuracion:', e.message));

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
app.use('/api/reportes', reportesRoutes);
app.use('/api/auditoria', auditoriaRoutes);
app.use('/api/configuracion', configuracionRoutes);
app.use('/api/importar',     importarRoutes);
app.use('/api/cliente-auth', clienteAuthRoutes);
app.use('/api/mi-cuenta',    miCuentaRoutes);

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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  const base = `http://localhost:${PORT}`;
  console.log('\n  🌋  VOLCANO GYM — Servidor activo\n');
  console.log(`  🔐  Login Dashboard :  ${base}/login`);
  console.log(`  🌐  Página Web      :  ${base}/volcano`);
  console.log(`  👤  Login Cliente   :  ${base}/cliente\n`);
});
