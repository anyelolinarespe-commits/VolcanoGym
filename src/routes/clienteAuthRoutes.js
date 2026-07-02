import { Router } from 'express';
import { loginCliente, cambiarPasswordCliente } from '../controllers/clienteAuthController.js';
import { verificarClienteToken } from '../middlewares/verificarClienteToken.js';

const router = Router();

router.post('/login',            loginCliente);
router.post('/cambiar-password', verificarClienteToken, cambiarPasswordCliente);

export default router;
