import { Router } from 'express';
import { getPermisosByPerfil, setPermisosByPerfil, getMisOpciones } from '../controllers/permisosController.js';
import { verificarToken } from '../middlewares/verificarToken.js';

const router = Router();
router.use(verificarToken);

router.get('/mis-opciones',       getMisOpciones);
router.get('/perfil/:id',         getPermisosByPerfil);
router.put('/perfil/:id',         setPermisosByPerfil);

export default router;
