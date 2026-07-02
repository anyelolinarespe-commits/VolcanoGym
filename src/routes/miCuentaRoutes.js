import { Router } from 'express';
import { verificarClienteToken } from '../middlewares/verificarClienteToken.js';
import {
    getMiPerfil, updateMiPerfil,
    getMisMembresias, getMisAsistencias,
    getMisCompras, getMiComprobanteHTML, getMiPeso, addMiPeso, deleteMiPeso
} from '../controllers/miCuentaController.js';

const router = Router();

router.use(verificarClienteToken);

router.get('/perfil',       getMiPerfil);
router.put('/perfil',       updateMiPerfil);
router.get('/membresias',   getMisMembresias);
router.get('/asistencias',  getMisAsistencias);
router.get('/compras',          getMisCompras);
router.get('/compras/:id/recibo', getMiComprobanteHTML);
router.get('/peso',         getMiPeso);
router.post('/peso',        addMiPeso);
router.delete('/peso/:id',  deleteMiPeso);

export default router;
