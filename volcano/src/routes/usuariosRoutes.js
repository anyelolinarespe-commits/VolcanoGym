import { Router } from 'express';
import { getUsuarios, createUsuario, updateUsuario, deleteUsuario, reactivarUsuario } from '../controllers/usuariosController.js';
import { verificarToken } from '../middlewares/verificarToken.js';

const router = Router();
router.use(verificarToken);

router.get('/',        getUsuarios);
router.post('/',       createUsuario);
router.put('/:id',     updateUsuario);
router.delete('/:id',  deleteUsuario);
router.patch('/:id/reactivar', reactivarUsuario);

export default router;