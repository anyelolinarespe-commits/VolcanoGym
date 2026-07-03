import { Router } from 'express';
import {
  getVentas, getVentaById,
  getTiposComprobante,
  buscarProductosVenta,
  buscarPorCodigoBarras,
  getNumeroSiguiente,
  createVenta,
  emitirComprobante,
  enviarSunat,
  anularVenta,
  aprobarVenta,
  aprobarVerificacion,
  enviarEmailVenta,
  getVerificacionPagos,
  verificarOperacion,
  getResumenVentasHoy
} from '../controllers/ventasController.js';
import { verificarToken } from '../middlewares/verificarToken.js';

const router = Router();
router.use(verificarToken);

router.get('/verificacion/pagos',              getVerificacionPagos);
router.post('/verificacion/:id_vp/aprobar',   aprobarVerificacion);
router.get('/tipos-comprobante',  getTiposComprobante);
router.get('/numero-siguiente',   getNumeroSiguiente);
router.get('/verificar-operacion', verificarOperacion);
router.get('/resumen-hoy',        getResumenVentasHoy);
router.get('/productos/buscar',   buscarProductosVenta);
router.get('/productos/por-codigo/:codigo', buscarPorCodigoBarras);
router.get('/',                   getVentas);
router.get('/:id',                getVentaById);
router.post('/',                  createVenta);
router.post('/:id/emitir',        emitirComprobante);
router.post('/:id/aprobar',       aprobarVenta);
router.post('/:id/enviar-sunat',  enviarSunat);
router.post('/:id/enviar-email',  enviarEmailVenta);
router.delete('/:id',             anularVenta);

export default router;
