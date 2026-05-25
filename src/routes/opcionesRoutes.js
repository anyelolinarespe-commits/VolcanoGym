import { Router } from 'express';
import { getOpciones, getTodasOpciones } from '../controllers/opcionesController.js';
import { verificarToken } from '../middlewares/verificarToken.js';

const router = Router();
router.use(verificarToken);

router.get('/',      getOpciones);
router.get('/todas', getTodasOpciones);

export default router;
