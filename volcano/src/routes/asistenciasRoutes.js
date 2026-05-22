import { Router } from 'express';
import {
    getAsistencias,
    getAsistenciasStats,
    createAsistencia,
    deleteAsistencia
} from '../controllers/asistenciasController.js';
import { verificarToken } from '../middlewares/verificarToken.js';

const router = Router();
router.use(verificarToken);

router.get('/',       getAsistencias);
router.get('/stats',  getAsistenciasStats);
router.post('/',      createAsistencia);
router.delete('/:id', deleteAsistencia);

export default router;
