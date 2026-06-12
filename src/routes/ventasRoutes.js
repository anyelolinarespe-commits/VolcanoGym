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
  enviarEmailVenta
} from '../controllers/ventasController.js';
import { verificarToken } from '../middlewares/verificarToken.js';

const router = Router();
router.use(verificarToken);

router.get('/tipos-comprobante',  getTiposComprobante);
router.get('/numero-siguiente',   getNumeroSiguiente);
router.get('/productos/buscar',   buscarProductosVenta);
router.get('/',                   getVentas);
router.get('/:id',                getVentaById);
router.post('/',                  createVenta);
router.post('/:id/emitir',        emitirComprobante);
router.post('/:id/enviar-sunat',  enviarSunat);
router.post('/:id/enviar-email',  enviarEmailVenta);
router.delete('/:id',             anularVenta);

export default router;
