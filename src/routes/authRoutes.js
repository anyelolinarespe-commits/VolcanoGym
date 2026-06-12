import { Router } from 'express';
import { login, logout } from '../controllers/authController.js';
import { verificarToken } from '../middlewares/verificarToken.js';

const router = Router();

router.post('/login',  login);
router.post('/logout', verificarToken, logout);

export default router;