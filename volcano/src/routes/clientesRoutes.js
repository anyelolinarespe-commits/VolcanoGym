import { Router } from 'express';
import { getClientes, getClientesStats, createCliente, updateCliente, deleteCliente, reactivarCliente, getHistorialCliente, cambiarEstadoCliente, uploadFotoCliente } from '../controllers/clientesController.js';
import { verificarToken } from '../middlewares/verificarToken.js';
import { uploadFoto } from '../middlewares/upload.js';

const router = Router();
router.use(verificarToken);

router.get('/',                     getClientes);
router.get('/stats',                getClientesStats);
router.post('/upload-foto',         uploadFoto.single('foto'), uploadFotoCliente);
router.post('/',                    createCliente);
router.put('/:id',     updateCliente);
router.delete('/:id',  deleteCliente);
router.patch('/:id/reactivar', reactivarCliente);
router.patch('/:id/estado',    cambiarEstadoCliente);
router.get('/:id/historial', getHistorialCliente);

export default router;