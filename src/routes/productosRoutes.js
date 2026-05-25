import { Router } from 'express';
import {
    getProductos,
    getProductoById,
    getProductosStats,
    createProducto,
    updateProducto,
    deleteProducto
} from '../controllers/productosController.js';
import { verificarToken } from '../middlewares/verificarToken.js';

const router = Router();
router.use(verificarToken);

router.get('/',        getProductos);
router.get('/stats',   getProductosStats);
router.get('/:id',     getProductoById);
router.post('/',       createProducto);
router.put('/:id',     updateProducto);
router.delete('/:id',  deleteProducto);

export default router;
