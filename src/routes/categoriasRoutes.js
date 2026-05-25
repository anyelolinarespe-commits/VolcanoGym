// ─── src/routes/categoriasRoutes.js ───────────────────────────────────────────
import { Router } from 'express';
import { getCategorias, createCategoria, updateCategoria, deleteCategoria } from '../controllers/categoriasController.js';
import { verificarToken } from '../middlewares/verificarToken.js';

const router = Router();
router.use(verificarToken);

router.get('/',        getCategorias);
router.post('/',       createCategoria);
router.put('/:id',     updateCategoria);
router.delete('/:id',  deleteCategoria);

export default router;


// ─── src/routes/productosRoutes.js ────────────────────────────────────────────
// (copiar en archivo separado)
/*
import { Router } from 'express';
import { getProductos, getProductosStats, createProducto, updateProducto, deleteProducto } from '../controllers/productosController.js';
import { verificarToken } from '../middlewares/verificarToken.js';

const router = Router();
router.use(verificarToken);

router.get('/',        getProductos);
router.get('/stats',   getProductosStats);
router.post('/',       createProducto);
router.put('/:id',     updateProducto);
router.delete('/:id',  deleteProducto);

export default router;
*/
