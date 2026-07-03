-- ════════════════════════════════════════════════════════════════════════════
--  Relaja chk_memb_fechas de (fecha_fin > fecha_inicio) a (fecha_fin >= fecha_inicio)
--  Motivo: los planes por DÍAS (ej. "Rutina Clásico" = 1 día) deben valer solo el
--  día de matrícula. Con columnas date y la regla 'fecha_fin < hoy => vencida',
--  un pase de 1 día requiere fecha_fin = fecha_inicio (activa hoy, vencida mañana).
--  El cálculo (calcFechaFin) resta 1 día solo para unidad 'dias'; meses/años siguen
--  en duración completa, por lo que igual cumplen fecha_fin > fecha_inicio.
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.membresia DROP CONSTRAINT IF EXISTS chk_memb_fechas;
ALTER TABLE public.membresia
    ADD CONSTRAINT chk_memb_fechas CHECK (fecha_fin >= fecha_inicio);
