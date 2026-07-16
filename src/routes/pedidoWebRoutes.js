import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { crearPedidoWeb } from '../controllers/pedidoWebController.js';

const router = Router();

// Único endpoint de escritura sin autenticación de todo el sistema — limitar
// abuso desde el catálogo público (5 solicitudes/min por IP).
const limitarPedidos = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: 'Demasiadas solicitudes, intenta de nuevo en un minuto' },
});

router.post('/', limitarPedidos, crearPedidoWeb);

export default router;
