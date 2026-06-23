-- ════════════════════════════════════════════════════════════════════════════
--  Migración: galería de imágenes por presentación (variante de producto)
--  Fecha: 2026-06-22
--
--  Crea la tabla producto_presentacion_foto, espejo de producto_foto pero atada
--  a una variante (producto_presentacion.id). Permite varias imágenes por
--  presentación, con una marcada como principal y un orden (drag-reorder).
--
--  Aplicar con:
--    psql -U <usuario> -d <basededatos> -f scripts/2026-06-22-presentacion-foto.sql
--
--  Es aditiva e idempotente: no toca datos existentes y puede correrse 2 veces.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.producto_presentacion_foto (
    id_foto      integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_pp        integer  NOT NULL
                 REFERENCES public.producto_presentacion (id) ON DELETE CASCADE,
    url_foto     text     NOT NULL,                       -- data URL base64 (igual que producto_foto)
    es_principal boolean  NOT NULL DEFAULT false,
    estado       smallint NOT NULL DEFAULT 1,             -- 1 = activa (se muestra), 0 = inactiva (se conserva pero oculta)
    orden        smallint NOT NULL DEFAULT 0 CHECK (orden >= 0),
    creado_por   integer,
    created_at   timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ppf_pp ON public.producto_presentacion_foto (id_pp);

-- Si la tabla ya existía sin la columna estado (versión previa de la migración)
ALTER TABLE public.producto_presentacion_foto ADD COLUMN IF NOT EXISTS estado smallint NOT NULL DEFAULT 1;

COMMENT ON TABLE  public.producto_presentacion_foto              IS 'Galería de imágenes por variante (producto_presentacion). Fallback: si una variante no tiene fotos, se usa la de la presentación principal del producto.';
COMMENT ON COLUMN public.producto_presentacion_foto.url_foto     IS 'Imagen en data URL base64. Ej: data:image/png;base64,...';
COMMENT ON COLUMN public.producto_presentacion_foto.es_principal IS 'Marca la foto que sale primera (portada) de la variante.';
COMMENT ON COLUMN public.producto_presentacion_foto.orden        IS 'Posición en la galería (0 = primera). Permite reordenar arrastrando.';
