import { Router } from 'express';
import { getPlanes, getPlanesActivos, createPlan, updatePlan, deletePlan } from '../controllers/planesController.js';
import { verificarToken } from '../middlewares/verificarToken.js';

const router = Router();

// Pública — declarada ANTES de verificarToken: la usa volcano_web/planes.html (sin login)
router.get('/activos', getPlanesActivos);

router.use(verificarToken);

router.get('/',        getPlanes);
router.post('/',       createPlan);
router.put('/:id',     updatePlan);
router.delete('/:id',  deletePlan);

export default router;
