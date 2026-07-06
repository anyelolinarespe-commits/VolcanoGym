-- ════════════════════════════════════════════════════════════════════════════
--  FASE 2: Verificación de pagos para MEMBRESÍAS.
--  Cierra la brecha donde un pago digital (Yape/Plin/Transferencia) de
--  matrícula o cuota activaba el socio de inmediato sin revisión, a
--  diferencia de Ventas (que sí gatea por verificacion_pago).
-- ════════════════════════════════════════════════════════════════════════════

-- Nuevos estados de membresía: pago fundacional a la espera de revisión, y
-- pago rechazado (alerta de fraude) — nunca llegó a activarse.
ALTER TYPE estado_memb_enum ADD VALUE IF NOT EXISTS 'pendiente_validacion';
ALTER TYPE estado_memb_enum ADD VALUE IF NOT EXISTS 'rechazada';

-- Ampliar verificacion_pago para que también pueda originarse en un pago de
-- membresía (tabla `pago`), no solo en una venta. uq_vp_operacion_aprobada
-- (metodo_pago, numero_operacion) WHERE estado=2 no se toca: sigue aplicando
-- a ambos orígenes por igual (un código de Yape no debe respaldar una venta
-- Y una membresía al mismo tiempo).
ALTER TABLE verificacion_pago ALTER COLUMN id_venta DROP NOT NULL;
ALTER TABLE verificacion_pago ADD COLUMN IF NOT EXISTS id_pago INT NULL REFERENCES pago(id_pago);
ALTER TABLE verificacion_pago ADD CONSTRAINT chk_vp_origen
  CHECK ((id_venta IS NOT NULL AND id_pago IS NULL) OR (id_venta IS NULL AND id_pago IS NOT NULL));
CREATE INDEX IF NOT EXISTS idx_vp_pago ON verificacion_pago(id_pago);
