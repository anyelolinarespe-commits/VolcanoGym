import { Router } from 'express';
import { getPerfiles, createPerfil, updatePerfil, deletePerfil } from '../controllers/perfilesController.js';
import { verificarToken } from '../middlewares/verificarToken.js';

const router = Router();
router.use(verificarToken);

router.get('/',        getPerfiles);
router.post('/',       createPerfil);
router.put('/:id',     updatePerfil);
router.delete('/:id',  deletePerfil);

export default router;
