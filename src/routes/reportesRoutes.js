import { Router } from 'express';
import {
  getClientesEnRiesgo, getRenovaciones,
  getBalancePeriodo, getInscritos, getAsistenciasSemana,
  getCajaPorCategoria, getCajaArqueos,
  getVentasResumen, getVentasTopProductos, getVentasSerieDiaria,
} from '../controllers/reportesController.js';
import { verificarToken } from '../middlewares/verificarToken.js';

const router = Router();
router.use(verificarToken);

router.get('/clientes-riesgo',    getClientesEnRiesgo);
router.get('/renovaciones',       getRenovaciones);
router.get('/balance',            getBalancePeriodo);
router.get('/inscritos',          getInscritos);
router.get('/asistencias-semana', getAsistenciasSemana);
router.get('/caja-categorias',      getCajaPorCategoria);
router.get('/caja-arqueos',         getCajaArqueos);
router.get('/ventas-resumen',       getVentasResumen);
router.get('/ventas-top-productos', getVentasTopProductos);
router.get('/ventas-serie-diaria',  getVentasSerieDiaria);

export default router;
