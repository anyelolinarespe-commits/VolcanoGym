-- ════════════════════════════════════════════════════════════════════════════
--  MÓDULO REPORTES — alta en sidebar (tabla opciones ya existente).
--  La sección visual ("Gestión") se resuelve en el frontend vía MODULOS_CONFIG,
--  no en esta tabla (opciones no tiene columna 'seccion').
--
--  Nota: ya existía una fila con ruta='reportes' (id_opcion=16, creada
--  2026-07-03) del módulo de reportes anterior que fue eliminado — solo se
--  removió el código, no esta fila. Este script la reutiliza (UPDATE en vez
--  de INSERT) para no duplicarla.
--
--  Permisos: se asigna a 'Administrador' y 'superAdministrador' (mismo
--  criterio ya usado para 'auditoria', el módulo existente más parecido en
--  sensibilidad de datos). Perfiles operativos (Recepcionista, Vendedor) no
--  lo ven por defecto; se puede habilitar después desde Perfiles → Permisos.
-- ════════════════════════════════════════════════════════════════════════════

-- Si la fila ya existe (id_opcion=16, heredada del módulo viejo), reactivarla;
-- si no existe en absoluto, crearla.
UPDATE public.opciones
SET nombre = 'Reportes', icono = 'bi-bar-chart-line', activo = TRUE
WHERE ruta = 'reportes';

INSERT INTO public.opciones (nombre, ruta, icono, orden, activo)
SELECT 'Reportes', 'reportes', 'bi-bar-chart-line',
       COALESCE(MAX(orden), 0) + 1, TRUE
FROM public.opciones
WHERE NOT EXISTS (SELECT 1 FROM public.opciones WHERE ruta = 'reportes');

INSERT INTO public.permisos (id_perfil, id_opcion)
SELECT p.id_perfil, o.id_opcion
FROM public.perfiles p
CROSS JOIN public.opciones o
WHERE p.nombre IN ('Administrador', 'superAdministrador')
  AND o.ruta = 'reportes'
  AND NOT EXISTS (
    SELECT 1 FROM public.permisos pe
    WHERE pe.id_perfil = p.id_perfil AND pe.id_opcion = o.id_opcion
  );
