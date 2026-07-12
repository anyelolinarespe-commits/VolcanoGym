-- ════════════════════════════════════════════════════════════════════════════
--  NOTIFICACIONES — motor de reglas data-driven.
--  Antes, las reglas de disparo (qué días antes del vencimiento, etc.) vivían
--  hardcodeadas en notificacionesJob.js. Ahora viven en la propia tabla
--  tipos_notificaciones, para que un tipo creado desde la UI pueda tener
--  disparo automático por cron sin tocar código.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE tipos_notificaciones
    ADD COLUMN IF NOT EXISTS regla_evento VARCHAR(30) NOT NULL DEFAULT 'manual'
        CHECK (regla_evento IN ('vencimiento_membresia','cumpleanos','deuda_pendiente','manual'));

ALTER TABLE tipos_notificaciones
    ADD COLUMN IF NOT EXISTS regla_dias_offset INT NULL;

ALTER TABLE tipos_notificaciones
    ADD CONSTRAINT chk_regla_offset CHECK (
        (regla_evento = 'vencimiento_membresia' AND regla_dias_offset IS NOT NULL)
        OR (regla_evento != 'vencimiento_membresia' AND regla_dias_offset IS NULL)
    );

-- Migra los 5 tipos de sistema (antes hardcodeados en notificacionesJob.js)
-- al nuevo modelo data-driven.
UPDATE tipos_notificaciones SET regla_evento='vencimiento_membresia', regla_dias_offset=7 WHERE codigo='vencimiento_7d';
UPDATE tipos_notificaciones SET regla_evento='vencimiento_membresia', regla_dias_offset=3 WHERE codigo='vencimiento_3d';
UPDATE tipos_notificaciones SET regla_evento='vencimiento_membresia', regla_dias_offset=0 WHERE codigo='vencimiento_hoy';
UPDATE tipos_notificaciones SET regla_evento='cumpleanos' WHERE codigo='cumpleanos';
UPDATE tipos_notificaciones SET regla_evento='deuda_pendiente' WHERE codigo='deuda';
