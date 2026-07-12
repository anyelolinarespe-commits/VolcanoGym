import { Router } from 'express';
import multer from 'multer';
import {
    getFotosByProducto,
    uploadFoto,
    setFotoPrincipal,
    reordenarFotos,
    deleteFoto
} from '../controllers/fotosController.js';
import { verificarToken } from '../middlewares/verificarToken.js';

const fileFilter = (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Solo se permiten imágenes (JPEG, PNG, WEBP, GIF)'), false);
};

const upload = multer({
    storage: multer.memoryStorage(),
    fileFilter,
    limits: { fileSize: 5 * 1024 * 1024, files: 1 }
});

const handleMulterError = (err, _req, res, next) => {
    if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE')
            return res.status(400).json({ message: 'La imagen no puede superar 5 MB' });
        return res.status(400).json({ message: err.message });
    }
    if (err) return res.status(400).json({ message: err.message });
    next();
};

const router = Router({ mergeParams: true });

router.get('/',                                               getFotosByProducto);
router.post('/',  verificarToken, upload.single('foto'), handleMulterError, uploadFoto);
router.put('/:id_foto/principal', verificarToken,             setFotoPrincipal);
router.put('/orden',              verificarToken,             reordenarFotos);
router.delete('/:id_foto',        verificarToken,             deleteFoto);

export default router;
