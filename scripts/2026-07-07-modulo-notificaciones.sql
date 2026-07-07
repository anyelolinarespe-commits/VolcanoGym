-- ════════════════════════════════════════════════════════════════════════════
--  MÓDULO NOTIFICACIONES — catálogo de tipos + historial de alertas generadas.
--  El cron diario solo GENERA alertas pendientes (estado=1); el envío real
--  sigue siendo manual (botón WhatsApp), mismo patrón ya usado en Membresías.
--  Ver: plan aprobado en sesión — motor desacoplado del canal de envío.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Tabla 1: tipos_notificaciones ────────────────────────────────────────────
-- Catálogo de tipos con su plantilla de mensaje (variables {nombre}, {fecha_fin},
-- {monto} resueltas al generar la alerta).
CREATE TABLE IF NOT EXISTS public.tipos_notificaciones (
    id_tipo_notificacion  SERIAL PRIMARY KEY,
    codigo                VARCHAR(30)   NOT NULL UNIQUE,
    nombre                VARCHAR(50)   NOT NULL,
    plantilla_texto       TEXT          NOT NULL,
    activo                BOOLEAN       NOT NULL DEFAULT TRUE
);

-- ── Tabla 2: notificaciones_enviadas ─────────────────────────────────────────
-- Historial de alertas generadas por el cron o manualmente. estado=1 mientras
-- espera que el staff la despache por WhatsApp; pasa a 2 (enviado) o 0
-- (descartado) según la acción del usuario.
CREATE TABLE IF NOT EXISTS public.notificaciones_enviadas (
    id_notificacion       SERIAL PRIMARY KEY,
    id_cliente            INT           NOT NULL REFERENCES public.cliente(id_cliente),
    id_tipo_notificacion  INT           NOT NULL REFERENCES public.tipos_notificaciones(id_tipo_notificacion),
    canal                 VARCHAR(20)   NOT NULL DEFAULT 'whatsapp' CHECK (canal IN ('whatsapp','email','sistema')),
    mensaje               TEXT          NOT NULL,
    referencia_id         INT           NULL,
    estado                SMALLINT      NOT NULL DEFAULT 1, -- 1=Pendiente, 2=Enviado, 0=Descartado
    fecha_registro        TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_enviado         TIMESTAMP     NULL
);

CREATE INDEX IF NOT EXISTS idx_notif_cliente_tipo_fecha
    ON public.notificaciones_enviadas(id_cliente, id_tipo_notificacion, fecha_registro);

CREATE INDEX IF NOT EXISTS idx_notif_estado
    ON public.notificaciones_enviadas(estado);

-- ── Seed de tipos iniciales ───────────────────────────────────────────────────
INSERT INTO public.tipos_notificaciones (codigo, nombre, plantilla_texto) VALUES
    ('vencimiento_7d',  'Vencimiento en 7 días',  '¡Hola {nombre}! Tu membresía en Volcano Gym vence el {fecha_fin} (en 7 días). Renueva a tiempo para no perder tu racha 💪'),
    ('vencimiento_3d',  'Vencimiento en 3 días',  '¡Hola {nombre}! Tu membresía vence el {fecha_fin} (en 3 días). ¿Nos vemos para renovar? 🔥'),
    ('vencimiento_hoy', 'Vencimiento hoy',        '¡Hola {nombre}! Tu membresía vence HOY. Renueva ahora mismo para seguir entrenando sin pausas 🚨'),
    ('cumpleanos',      'Cumpleaños',             '¡Feliz cumpleaños, {nombre}! 🎂 Hoy en Volcano Gym celebramos tu día. Pasa por recepción por tu sorpresa.'),
    ('deuda',           'Alerta de deuda',        'Hola {nombre}, tienes un saldo pendiente de S/ {monto} en tu membresía. Te esperamos para regularizarlo 🙏')
ON CONFLICT (codigo) DO NOTHING;

-- ── Alta en el sidebar (tabla opciones ya existente) ─────────────────────────
INSERT INTO public.opciones (nombre, ruta, icono, orden, activo)
SELECT 'Notificaciones', 'notificaciones', 'bi-bell-fill',
       COALESCE(MAX(orden), 0) + 1, TRUE
FROM public.opciones
WHERE NOT EXISTS (SELECT 1 FROM public.opciones WHERE ruta = 'notificaciones');

-- ── Permisos: mismo criterio que Reportes (Administrador + superAdministrador) ─
INSERT INTO public.permisos (id_perfil, id_opcion)
SELECT p.id_perfil, o.id_opcion
FROM public.perfiles p
CROSS JOIN public.opciones o
WHERE p.nombre IN ('Administrador', 'superAdministrador')
  AND o.ruta = 'notificaciones'
  AND NOT EXISTS (
    SELECT 1 FROM public.permisos pe
    WHERE pe.id_perfil = p.id_perfil AND pe.id_opcion = o.id_opcion
  );
