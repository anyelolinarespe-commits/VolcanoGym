-- ════════════════════════════════════════════════════════════════════════════
--  ORDEN MANUAL de las presentaciones de un producto (drag-reorder en la tabla)
--  Igual que producto_presentacion_foto.orden, pero a nivel de variante.
--  La principal siempre se muestra primera (es_principal DESC); 'orden' decide
--  la posición del resto. Una presentación nueva toma MAX(orden)+1 (va al final).
-- ════════════════════════════════════════════════════════════════════════════
ALTER TABLE public.producto_presentacion
    ADD COLUMN IF NOT EXISTS orden smallint NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.producto_presentacion.orden
    IS 'Posición en la tabla de presentaciones del producto (0 = primera tras la principal). Permite reordenar arrastrando.';

-- Inicializar 'orden' por producto según el orden actual (creación) para que las
-- existentes no queden todas en 0 y conserven una secuencia estable.
WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (PARTITION BY id_producto
                              ORDER BY es_principal DESC, id ASC) - 1 AS rn
    FROM public.producto_presentacion
    WHERE estado != 2
)
UPDATE public.producto_presentacion pp
SET orden = ranked.rn
FROM ranked
WHERE ranked.id = pp.id;
