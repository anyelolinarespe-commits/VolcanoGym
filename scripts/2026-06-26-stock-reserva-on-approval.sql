-- ─────────────────────────────────────────────────────────────────────────────
-- Reserva de stock: descontar inventario SOLO al aprobar el pago (opción B)
--
-- Antes, el trigger fn_descontar_stock_venta descontaba stock automáticamente
-- al insertar en venta_detalle. Eso causaba:
--   1) DOBLE descuento (el controlador crearVenta también restaba stock).
--   2) Que las ventas digitales PENDIENTES de verificación ya descontaran stock
--      antes de confirmar el pago; si se rechazaban, el historial no reflejaba
--      bien la devolución.
--
-- Solución: eliminar el trigger y centralizar el control de stock en el
-- controlador (ventasController.js), que distingue entre venta 'registrada'
-- (descuenta al instante) y 'pendiente' (reserva lógica, no descuenta hasta
-- aprobar el pago).
-- ─────────────────────────────────────────────────────────────────────────────

DROP TRIGGER  IF EXISTS trg_descontar_stock_venta ON public.venta_detalle;
DROP FUNCTION IF EXISTS public.fn_descontar_stock_venta();
