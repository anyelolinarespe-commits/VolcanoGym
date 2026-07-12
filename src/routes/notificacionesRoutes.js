import { Router } from 'express';
import {
  getPendientes, marcarEnviada, descartarNotificacion,
  generarAhora, getHistorialCliente,
  getTipos, createTipo, updateTipo, deleteTipo,
  enviarManual, getHistorial, restaurarNotificacion,
} from '../controllers/notificacionesController.js';
import { verificarToken } from '../middlewares/verificarToken.js';

const router = Router();
router.use(verificarToken);

// Rutas literales primero, para que Express no las confunda con /:id
router.get('/pendientes',        getPendientes);
router.get('/historial',         getHistorial);
router.post('/generar-ahora',    generarAhora);
router.post('/enviar-manual',    enviarManual);
router.get('/cliente/:id',       getHistorialCliente);

router.get('/tipos',             getTipos);
router.post('/tipos',            createTipo);
router.put('/tipos/:id',         updateTipo);
router.delete('/tipos/:id',      deleteTipo);

router.put('/:id/enviar',        marcarEnviada);
router.put('/:id/descartar',     descartarNotificacion);
router.put('/:id/restaurar',     restaurarNotificacion);

export default router;
