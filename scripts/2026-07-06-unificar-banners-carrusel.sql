-- ════════════════════════════════════════════════════════════════════════════
--  Unifica "Banners" y "Carrusel Hero" en un solo sistema sobre banners_config.
--  Antes: Banners vivía en BD pero no se mostraba en ningún sitio; Carrusel
--  Hero sí se mostraba en volcano_web pero vivía en localStorage del admin
--  (no sincronizaba con los visitantes reales del sitio).
--  Ahora: banners_config es la única fuente, con `url` (destino al hacer
--  clic) y `activo` (ocultar sin borrar) agregados a lo que ya tenía.
--  También elimina el slot "Portada del Gimnasio" (huérfano, sin uso).
-- ════════════════════════════════════════════════════════════════════════════

-- Se recrea desde cero (en vez de ALTER) para tener el diseño final en una
-- sola definición limpia. El sistema de Banners nunca se conectó a ningún
-- sitio visible, así que no hay pérdida funcional real.
DROP TABLE IF EXISTS banners_config;

CREATE TABLE banners_config (
    id         SERIAL PRIMARY KEY,
    imagen     TEXT          NOT NULL, -- data-URI base64, o nombre de archivo estático de volcano_web/
    url        TEXT          NULL,     -- destino al hacer clic: '#ancla' o URL externa
    fecha_fin  TIMESTAMP     NULL,     -- NULL = indefinido
    principal  BOOLEAN       NOT NULL DEFAULT FALSE, -- fijo primero en el carrusel
    activo     BOOLEAN       NOT NULL DEFAULT TRUE,  -- oculta el slide sin borrarlo
    orden      INT           NOT NULL DEFAULT 0
);

-- Seed de los 3 slides que hoy viven hardcodeados en HERO_DEFAULTS/CR_DEFAULTS,
-- para que el sitio no quede sin hero tras el deploy. `imagen` guarda el
-- nombre de archivo estático de volcano_web/ (no base64) — el backend/
-- frontend deben resolverlo como ruta relativa plana cuando no empieza con
-- 'data:'.
INSERT INTO banners_config (imagen, url, principal, activo, orden) VALUES
    ('hero_trex.png',     '#planes', TRUE,  TRUE, 1),
    ('hero_animales.png', '#animal', FALSE, TRUE, 2),
    ('hero_mundial.png',  '#planes', FALSE, TRUE, 3);

-- Eliminar "Portada del Gimnasio" (huérfana, sin uso en volcano_web).
DELETE FROM configuracion_sistema WHERE clave = 'portada_base64';
