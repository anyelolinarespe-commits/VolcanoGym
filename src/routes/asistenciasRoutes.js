import { Router } from 'express';
import {
    getAsistencias,
    getAsistenciasStats,
    createAsistencia,
    deleteAsistencia,
    purgarAsistenciasInvalidas,
    seedAsistenciasTest
} from '../controllers/asistenciasController.js';
import { verificarToken } from '../middlewares/verificarToken.js';

const router = Router();
router.use(verificarToken);

router.get('/',              getAsistencias);
router.get('/stats',         getAsistenciasStats);
router.post('/',             createAsistencia);
router.post('/seed-test',    seedAsistenciasTest);
router.delete('/invalidas',  purgarAsistenciasInvalidas);
router.delete('/:id',        deleteAsistencia);

export default router;
