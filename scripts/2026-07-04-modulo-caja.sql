-- ════════════════════════════════════════════════════════════════════════════
--  MÓDULO CAJA — control de apertura/cierre de turno, movimientos manuales
--  y arqueo de efectivo de recepción.
--  Ver: Prompts_y_Estructura_Modulo_Caja_Volcanogym.pdf
-- ════════════════════════════════════════════════════════════════════════════

-- ── Tabla 1: cajas_registradoras ───────────────────────────────────────────
-- Puntos de cobro físicos/lógicos del gimnasio. No se borra físicamente,
-- solo se desactiva (estado=0).
CREATE TABLE IF NOT EXISTS public.cajas_registradoras (
    id_caja                 SERIAL PRIMARY KEY,
    codigo                  VARCHAR(20)     NOT NULL UNIQUE,
    nombre                  VARCHAR(50)     NOT NULL,
    descripcion             TEXT            NULL,
    monto_apertura_default  NUMERIC(10,2)   NOT NULL DEFAULT 0.00,
    monto_maximo_efectivo   NUMERIC(10,2)   NULL,
    estado                  SMALLINT        NOT NULL DEFAULT 1, -- 1=Activo, 0=Inactivo
    creado_por              INT             NULL REFERENCES public.usuarios(id_usuario),
    creado_en               TIMESTAMP       NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ── Tabla 2: sesiones_caja ─────────────────────────────────────────────────
-- Un ciclo de apertura → operación → cierre de un cajero en una caja.
CREATE TABLE IF NOT EXISTS public.sesiones_caja (
    id_sesion                 SERIAL PRIMARY KEY,
    id_caja                   INT           NOT NULL REFERENCES public.cajas_registradoras(id_caja),
    id_usuario                INT           NOT NULL REFERENCES public.usuarios(id_usuario),
    codigo_sesion             VARCHAR(30)   NOT NULL UNIQUE,
    fecha_apertura            TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_cierre              TIMESTAMP     NULL,
    monto_apertura            NUMERIC(10,2) NOT NULL,
    monto_esperado_efectivo   NUMERIC(10,2) NOT NULL DEFAULT 0.00,
    monto_contado_efectivo    NUMERIC(10,2) NULL,
    diferencia_efectivo       NUMERIC(10,2) NULL,
    observaciones_arqueo      TEXT          NULL,
    observaciones_cierre      TEXT          NULL,
    observaciones_apertura    TEXT          NULL,
    estado                    SMALLINT      NOT NULL DEFAULT 1 -- 1=Abierta, 0=Cerrada
);

-- Solo puede haber UNA sesión abierta a la vez por caja y por usuario
-- (regla de negocio reforzada en BD, además de validarse en la API).
CREATE UNIQUE INDEX IF NOT EXISTS uq_sesion_caja_abierta
    ON public.sesiones_caja(id_caja) WHERE estado = 1;
CREATE UNIQUE INDEX IF NOT EXISTS uq_sesion_usuario_abierta
    ON public.sesiones_caja(id_usuario) WHERE estado = 1;

-- ── Tabla 3: movimientos_caja ──────────────────────────────────────────────
-- Transacciones individuales dentro de una sesión: ingresos/egresos manuales
-- de caja chica, y ventas automáticas (enganchadas desde ventasController).
CREATE TABLE IF NOT EXISTS public.movimientos_caja (
    id_movimiento     SERIAL PRIMARY KEY,
    id_sesion         INT           NOT NULL REFERENCES public.sesiones_caja(id_sesion),
    tipo_movimiento   VARCHAR(10)   NOT NULL CHECK (tipo_movimiento IN ('INGRESO','EGRESO','VENTA')),
    monto             NUMERIC(10,2) NOT NULL,
    metodo_pago       VARCHAR(20)   NOT NULL, -- efectivo, tarjeta, transferencia, yape, plin
    categoria         VARCHAR(40)   NOT NULL,
    concepto          TEXT          NOT NULL,
    nro_comprobante   VARCHAR(30)   NULL,
    fecha_registro    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    estado            SMALLINT      NOT NULL DEFAULT 1 -- 1=Válido, 0=Anulado
);

CREATE INDEX IF NOT EXISTS idx_movimientos_caja_sesion ON public.movimientos_caja(id_sesion);
CREATE INDEX IF NOT EXISTS idx_movimientos_caja_comprobante ON public.movimientos_caja(nro_comprobante);

-- ── Alta en el sidebar/permisos (tabla opciones ya existente) ─────────────
INSERT INTO public.opciones (nombre, ruta, icono, orden, activo)
SELECT v.nombre, v.ruta, v.icono, base.siguiente_orden + v.orden_offset, TRUE
FROM (VALUES
        ('Mi Sesión',           'caja-mi-sesion',          'bi-cash-coin',     0),
        ('Historial Sesiones',  'caja-historial-sesiones', 'bi-clock-history', 1),
        ('Cajas Registradoras', 'caja-registradoras',      'bi-cash-stack',    2)
     ) AS v(nombre, ruta, icono, orden_offset)
CROSS JOIN (SELECT COALESCE(MAX(orden), 0) + 1 AS siguiente_orden FROM public.opciones) AS base
WHERE NOT EXISTS (SELECT 1 FROM public.opciones o WHERE o.ruta = v.ruta);
