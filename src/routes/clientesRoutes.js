import { Router } from 'express';
import { getClientes, getClientesStats, getUsuariosRegistradores, getClienteById, createCliente, updateCliente, actualizarDniTemporal, deleteCliente, reactivarCliente, getHistorialCliente, cambiarEstadoCliente, uploadFotoCliente } from '../controllers/clientesController.js';
import { verificarToken } from '../middlewares/verificarToken.js';
import { uploadFoto } from '../middlewares/upload.js';

const router = Router();
router.use(verificarToken);

router.get('/',                     getClientes);
router.get('/stats',                getClientesStats);
router.get('/usuarios-registradores', getUsuariosRegistradores);
router.post('/upload-foto',         uploadFoto.single('foto'), uploadFotoCliente);
router.post('/',                    createCliente);
router.get('/:id',     getClienteById);
router.put('/:id',     updateCliente);
router.patch('/:id/dni', actualizarDniTemporal);
router.delete('/:id',  deleteCliente);
router.patch('/:id/reactivar', reactivarCliente);
router.patch('/:id/estado',    cambiarEstadoCliente);
router.get('/:id/historial', getHistorialCliente);

export default router;