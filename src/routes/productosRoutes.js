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

router.get('/',        getProductos);
router.get('/stats',   verificarToken, getProductosStats);
router.get('/:id',     getProductoById);
router.post('/',       verificarToken, createProducto);
router.put('/:id',     verificarToken, updateProducto);
router.delete('/:id',  verificarToken, deleteProducto);

export default router;
