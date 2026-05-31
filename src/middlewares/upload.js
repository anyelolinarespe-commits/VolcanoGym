import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Fotos de clientes ────────────────────────────────────────────────────────
const uploadDir = path.join(__dirname, '../public/uploads/clientes');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `cliente-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`);
  }
});

// ─── Capturas de comprobantes de pago ────────────────────────────────────────
const comprobantesDir = path.join(__dirname, '../public/uploads/comprobantes');
if (!fs.existsSync(comprobantesDir)) fs.mkdirSync(comprobantesDir, { recursive: true });

const storageComprobante = multer.diskStorage({
  destination: (req, file, cb) => cb(null, comprobantesDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `comp-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`);
  }
});

// ─── Filtro compartido (solo imágenes) ───────────────────────────────────────
const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) cb(null, true);
  else cb(new Error('Solo se permiten imágenes'), false);
};

export const uploadFoto = multer({
  storage,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }
});

export const uploadComprobante = multer({
  storage: storageComprobante,
  fileFilter,
  limits: { fileSize: 5 * 1024 * 1024 }
});
