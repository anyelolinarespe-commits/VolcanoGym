import { Router } from 'express';
import multer from 'multer';
import { verificarToken } from '../middlewares/verificarToken.js';
import { importarSocios, crearAsesor, getHistorial, getPendientes } from '../controllers/importarController.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB
  fileFilter: (_, file, cb) => {
    const ok = file.originalname.match(/\.(xlsx|xls|ods)$/i);
    cb(ok ? null : new Error('Solo se aceptan archivos .xlsx, .xls u .ods'), !!ok);
  },
});

const router = Router();
router.use(verificarToken);

router.post('/socios',       upload.single('archivo'), importarSocios);
router.post('/crear-asesor', crearAsesor);
router.get('/historial',     getHistorial);
router.get('/pendientes',    getPendientes);

export default router;
