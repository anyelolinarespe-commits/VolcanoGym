import { Router } from 'express';
import { getAuditoria, getUsuariosAuditoria, getModulosAuditoria } from '../controllers/auditoriaController.js';
import { verificarToken } from '../middlewares/verificarToken.js';

const router = Router();
router.use(verificarToken);

router.get('/',              getAuditoria);
router.get('/modulos-lista',  getModulosAuditoria);
router.get('/usuarios-lista', getUsuariosAuditoria);

export default router;
