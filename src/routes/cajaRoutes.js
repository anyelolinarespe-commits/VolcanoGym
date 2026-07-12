import { Router } from 'express';
import {
  getCajas, createCaja, updateCaja,
  getSesiones, getSesionById,
  getMiSesion, abrirSesion, registrarMovimiento, cerrarSesion,
} from '../controllers/cajaController.js';
import { verificarToken } from '../middlewares/verificarToken.js';

const router = Router();
router.use(verificarToken);

router.get('/registradoras',        getCajas);
router.post('/registradoras',       createCaja);
router.put('/registradoras/:id',    updateCaja);

router.get('/sesiones',             getSesiones);
router.get('/sesiones/:id',         getSesionById);

router.get('/mi-sesion',            getMiSesion);
router.post('/mi-sesion/abrir',     abrirSesion);
router.post('/mi-sesion/movimiento', registrarMovimiento);
router.post('/mi-sesion/cerrar',    cerrarSesion);

export default router;
