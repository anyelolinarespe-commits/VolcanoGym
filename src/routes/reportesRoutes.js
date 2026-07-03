import { Router } from 'express';
import {
    getBalanceIngresos,
    getTurnoActual, abrirTurno, cerrarTurno, registrarEgreso, getHistorialTurnos,
    getReporteFinanciero, getReporteClientes, getReporteOperativo,
} from '../controllers/reportesController.js';
import { verificarToken } from '../middlewares/verificarToken.js';

const router = Router();
router.use(verificarToken);

router.get('/balance', getBalanceIngresos);

router.get('/caja/turno-actual', getTurnoActual);
router.post('/caja/abrir', abrirTurno);
router.post('/caja/:id/cerrar', cerrarTurno);
router.post('/caja/egresos', registrarEgreso);
router.get('/caja/historial', getHistorialTurnos);

router.get('/financiero', getReporteFinanciero);
router.get('/clientes', getReporteClientes);
router.get('/operativo', getReporteOperativo);

export default router;
