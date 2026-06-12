import { Router } from 'express';
import {
    getInventarioResumen,
    getInventarioByProducto,
    getPresentacionStock,
    getPresentacionesStock,
    actualizarStock,
    getMovimientos
} from '../controllers/inventarioController.js';
import { verificarToken } from '../middlewares/verificarToken.js';

const router = Router();
router.use(verificarToken);

// Vista general del módulo Inventario
router.get('/',                                      getInventarioResumen);

// Rutas específicas ANTES del parámetro genérico /:id_producto
router.get('/movimientos',                           getMovimientos);
router.put('/actualizar-stock',                      actualizarStock);
router.get('/producto/:id_producto/presentaciones',  getPresentacionesStock);
router.get('/presentacion/:id_pp',                   getPresentacionStock);

// Detalle completo de un producto (va al final para no capturar las rutas de arriba)
router.get('/:id_producto',                          getInventarioByProducto);

export default router;
