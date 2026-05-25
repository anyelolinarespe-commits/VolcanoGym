import { Router } from 'express';
import {
    getPresentaciones,
    getPresentacionesActivas,
    getPresentacionesByCategoria,
    createPresentacion,
    updatePresentacion,
    deletePresentacion,
    getPresentacionesByProducto,
    addPresentacionToProducto,
    updatePresentacionProducto,
    deletePresentacionProducto,
    setPresentacionesByCategoria,
} from '../controllers/presentacionesController.js';
import { verificarToken } from '../middlewares/verificarToken.js';

const router = Router();
router.use(verificarToken);

// ── Catálogo de presentaciones ──────────────────────────────────────────────
router.get('/',                              getPresentaciones);
router.get('/activas',                       getPresentacionesActivas);
router.post('/',                             createPresentacion);
router.put('/:id',                           updatePresentacion);
router.delete('/:id',                        deletePresentacion);

// ── Presentaciones válidas por categoría ────────────────────────────────────
router.get('/por-categoria/:id_categoria',   getPresentacionesByCategoria);
router.put('/categoria/:id_categoria',       setPresentacionesByCategoria);

// ── Precios por presentación de un producto ─────────────────────────────────
router.get('/producto/:id_producto',         getPresentacionesByProducto);
router.post('/producto/:id_producto',        addPresentacionToProducto);
router.put('/producto-precio/:id',           updatePresentacionProducto);
router.delete('/producto-precio/:id',        deletePresentacionProducto);

export default router;
