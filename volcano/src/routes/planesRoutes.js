import { Router } from 'express';
import { getPlanes, getPlanesActivos, createPlan, updatePlan, deletePlan } from '../controllers/planesController.js';
import { verificarToken } from '../middlewares/verificarToken.js';

const router = Router();
router.use(verificarToken);

router.get('/',        getPlanes);
router.get('/activos', getPlanesActivos);
router.post('/',       createPlan);
router.put('/:id',     updatePlan);
router.delete('/:id',  deletePlan);

export default router;
