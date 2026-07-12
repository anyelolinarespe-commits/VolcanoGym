import { Router } from 'express';
import { getUsuarios, createUsuario, updateUsuario, deleteUsuario, reactivarUsuario, uploadFotoUsuario } from '../controllers/usuariosController.js';
import { verificarToken } from '../middlewares/verificarToken.js';
import { uploadFoto } from '../middlewares/upload.js';

const router = Router();
router.use(verificarToken);

router.get('/',        getUsuarios);
router.post('/upload-foto', uploadFoto.single('foto'), uploadFotoUsuario);
router.post('/',       createUsuario);
router.put('/:id',     updateUsuario);
router.delete('/:id',  deleteUsuario);
router.patch('/:id/reactivar', reactivarUsuario);

export default router;