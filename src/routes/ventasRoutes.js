import { Router } from 'express';
import {
  getVentas, getVentaById,
  getTiposComprobante,
  buscarProductosVenta,
  getNumeroSiguiente,
  createVenta,
  emitirComprobante,
  enviarSunat,
  anularVenta,
<<<<<<< HEAD
  aprobarVenta,
  aprobarVerificacion,
=======
>>>>>>> origin/main
  enviarEmailVenta,
  getVerificacionPagos
} from '../controllers/ventasController.js';
import { verificarToken } from '../middlewares/verificarToken.js';

const router = Router();
router.use(verificarToken);

<<<<<<< HEAD
router.get('/verificacion/pagos',              getVerificacionPagos);
router.post('/verificacion/:id_vp/aprobar',   aprobarVerificacion);
=======
router.get('/verificacion/pagos', getVerificacionPagos);
>>>>>>> origin/main
router.get('/tipos-comprobante',  getTiposComprobante);
router.get('/numero-siguiente',   getNumeroSiguiente);
router.get('/productos/buscar',   buscarProductosVenta);
router.get('/',                   getVentas);
router.get('/:id',                getVentaById);
router.post('/',                  createVenta);
router.post('/:id/emitir',        emitirComprobante);
<<<<<<< HEAD
router.post('/:id/aprobar',       aprobarVenta);
=======
>>>>>>> origin/main
router.post('/:id/enviar-sunat',  enviarSunat);
router.post('/:id/enviar-email',  enviarEmailVenta);
router.delete('/:id',             anularVenta);

export default router;
