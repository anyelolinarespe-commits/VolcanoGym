import { Router } from 'express';
import { getQrs, getQrPorTipo, uploadQr, toggleQr } from '../controllers/qrController.js';
import { verificarToken } from '../middlewares/verificarToken.js';
import { uploadFoto } from '../middlewares/upload.js';

const router = Router();

router.use(verificarToken);

router.get('/',                getQrs);
router.get('/:tipo',           getQrPorTipo);
router.post('/:tipo/imagen',   uploadFoto.single('file'), uploadQr);
router.put('/:tipo',           toggleQr);

export default router;
