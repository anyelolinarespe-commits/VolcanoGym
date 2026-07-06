-- ════════════════════════════════════════════════════════════════════════════
--  Renombra/recrea configuracion_sistema → configuracion_imagenes con los
--  nombres de columna que el controller realmente usa (modificado_por, no
--  actualizado_por). La tabla estaba vacía (0 filas) y solo la usaba
--  configuracionController.js — sin dependencias externas, sin datos que
--  perder. Antes, uploadImagen fallaba con 500 "Error al guardar la imagen"
--  porque intentaba insertar en columnas inexistentes (actualizado_por,
--  actualizado_at).
-- ════════════════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS configuracion_sistema;

CREATE TABLE configuracion_imagenes (
    id_config       SERIAL PRIMARY KEY,
    clave           VARCHAR(50)   NOT NULL UNIQUE,
    valor           TEXT          NULL,     -- data-URI base64 de la imagen
    descripcion     VARCHAR(120)  NULL,
    modificado_por  INT           NULL REFERENCES usuarios(id_usuario) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
