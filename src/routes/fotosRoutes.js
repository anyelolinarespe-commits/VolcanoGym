import { Router }   from 'express';
import multer        from 'multer';
import path          from 'path';
import fs            from 'fs';
import { fileURLToPath } from 'url';
import {
    getFotosByProducto,
    uploadFoto,
    setFotoPrincipal,
    reordenarFotos,
    deleteFoto
} from '../controllers/fotosController.js';
import { verificarToken } from '../middlewares/verificarToken.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// ── DIRECTORIO DE SUBIDA ───────────────────────────────
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'public', 'uploads', 'productos');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// ── CONFIGURACIÓN MULTER ───────────────────────────────
const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (req, file, cb) => {
        // prod-{id_producto}-{timestamp}.{ext}
        const ext  = path.extname(file.originalname).toLowerCase();
        const name = `prod-${req.params.id}-${Date.now()}${ext}`;
        cb(null, name);
    }
});

const fileFilter = (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowed.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Solo se permiten imágenes (JPEG, PNG, WEBP, GIF)'), false);
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize:  5 * 1024 * 1024, // 5 MB máximo por foto
        files:     1                 // 1 archivo por request
    }
});

// ── MIDDLEWARE DE ERROR MULTER ─────────────────────────
const handleMulterError = (err, _req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE')
            return res.status(400).json({ message: 'La imagen no puede superar 5 MB' });
        return res.status(400).json({ message: err.message });
    }
    if (err) return res.status(400).json({ message: err.message });
    next();
};

// ── RUTAS ──────────────────────────────────────────────
const router = Router({ mergeParams: true }); // mergeParams para acceder a :id del padre
router.use(verificarToken);

// GET    /api/productos/:id/fotos
router.get('/',                        getFotosByProducto);

// POST   /api/productos/:id/fotos
router.post('/', upload.single('foto'), handleMulterError, uploadFoto);

// PUT    /api/productos/:id/fotos/:id_foto/principal
router.put('/:id_foto/principal',      setFotoPrincipal);

// PUT    /api/productos/:id/fotos/orden
router.put('/orden',                   reordenarFotos);

// DELETE /api/productos/:id/fotos/:id_foto
router.delete('/:id_foto',             deleteFoto);

export default router;
