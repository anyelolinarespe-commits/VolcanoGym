-- ════════════════════════════════════════════════════════════════════════════
--  CANAL DE VENTA — distingue el ORIGEN de una venta o pago de membresía
--  (Presencial / Vía Web-WhatsApp) del método de pago (efectivo/yape/plin).
--  Es un atributo por transacción (no por cada split de un pago mixto),
--  igual de granular que venta.metodo_pago / pago.metodo_pago hoy.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE venta ADD COLUMN IF NOT EXISTS canal_venta VARCHAR(20) NOT NULL DEFAULT 'presencial';
ALTER TABLE pago  ADD COLUMN IF NOT EXISTS canal_venta VARCHAR(20) NOT NULL DEFAULT 'presencial';

ALTER TABLE venta ADD CONSTRAINT chk_venta_canal CHECK (canal_venta IN ('presencial','whatsapp'));
ALTER TABLE pago  ADD CONSTRAINT chk_pago_canal  CHECK (canal_venta IN ('presencial','whatsapp'));
