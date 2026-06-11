import { Router } from 'express';
import { getBalanceIngresos } from '../controllers/reportesController.js';
import { verificarToken } from '../middlewares/verificarToken.js';

const router = Router();
router.use(verificarToken);

router.get('/balance', getBalanceIngresos);

export default router;
