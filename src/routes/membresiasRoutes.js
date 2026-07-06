// src/routes/membresiasRoutes.js

import express from 'express';
import { verificarToken } from '../middlewares/verificarToken.js';
import {
    // ── Endpoints existentes ──────────────────────────────────────────────────
    getMembresias,
    getMembresiasStats,
    getMembresiasByCliente,
    getCuotasByMembresia,
    createMembresia,
    pagarCuota,
    getHistorialByMembresia,
    updateMembresia,
    deleteMembresia,
    consultarDNI,
    crearMembresia,
    listarMembresias,
    detalleMembresia,
    enviarBoletaEmail,
    getVerificacionPagosMembresia,
    aprobarVerificacionMembresia,
    rechazarVerificacionMembresia
} from '../controllers/membresiasController.js';

const router = express.Router();

router.use(verificarToken);

// ── Rutas específicas (deben ir antes de /:id) ────────────────────────────────

// GET /api/membresias/stats
router.get('/stats', getMembresiasStats);

// POST /api/membresias/enviar-boleta
router.post('/enviar-boleta', enviarBoletaEmail);

// GET /api/membresias/dni/:dni  → consulta RENIEC / BD
router.get('/dni/:dni', consultarDNI);

// GET /api/membresias/cliente/:id
router.get('/cliente/:id', getMembresiasByCliente);

// ── Verificación de pagos de membresías ───────────────────────────────────────
router.get('/verificacion/pagos',            getVerificacionPagosMembresia);
router.post('/verificacion/:id_vp/aprobar',  aprobarVerificacionMembresia);
router.post('/verificacion/:id_vp/rechazar', rechazarVerificacionMembresia);

// ── Raíz ─────────────────────────────────────────────────────────────────────

// GET /api/membresias
//   · Con ?pagina= → listarMembresias (paginado, responde { ok, datos, total })
//   · Sin ?pagina= → getMembresias   (array completo, formato legacy)
router.get('/', (req, res) => {
    if (req.query.pagina !== undefined) return listarMembresias(req, res);
    return getMembresias(req, res);
});

// POST /api/membresias
//   · Con id_cliente en body → createMembresia (flujo cuotas existente)
//   · Con dni / cliente_existente_id  → crearMembresia (flujo DNI integrado)
router.post('/', (req, res) => {
    if (req.body.id_cliente !== undefined) return createMembresia(req, res);
    return crearMembresia(req, res);
});

// ── Rutas parametrizadas (/:id/... antes de /:id) ─────────────────────────────

// GET  /api/membresias/:id/cuotas
router.get('/:id/cuotas', getCuotasByMembresia);

// GET  /api/membresias/:id/historial
router.get('/:id/historial', getHistorialByMembresia);

// POST /api/membresias/:id/pagar-cuota
router.post('/:id/pagar-cuota', pagarCuota);

// GET  /api/membresias/:id
router.get('/:id', detalleMembresia);

// PUT  /api/membresias/:id
router.put('/:id', updateMembresia);

// DELETE /api/membresias/:id
router.delete('/:id', deleteMembresia);

export default router;
