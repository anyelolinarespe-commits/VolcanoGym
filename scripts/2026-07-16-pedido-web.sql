-- ════════════════════════════════════════════════════════════════════════════
--  PEDIDO WEB — pre-registro de consultas del catálogo público (botón
--  "Consultar" → WhatsApp). Tabla separada de `venta`: una consulta que el
--  cliente nunca termina de pagar no debe ensuciar reportes/KPIs de ventas.
--  Solo se convierte en una venta real cuando el admin la completa y aprueba
--  desde "Verificación de Pagos" (ver pedidoWebController.js / completarPedidoWeb).
-- ════════════════════════════════════════════════════════════════════════════

CREATE SEQUENCE IF NOT EXISTS pedido_web_codigo_seq START 1;

CREATE TABLE IF NOT EXISTS public.pedido_web (
  id              SERIAL PRIMARY KEY,
  codigo_pedido   VARCHAR(20)   NOT NULL UNIQUE,
  id_pp           INT           NOT NULL REFERENCES producto_presentacion(id),
  nombre_snapshot VARCHAR(255)  NOT NULL,
  precio_snapshot NUMERIC(10,2) NOT NULL,
  cantidad        INT           NOT NULL DEFAULT 1 CHECK (cantidad > 0),
  nombre_cliente  VARCHAR(120)  NOT NULL,
  celular         VARCHAR(30)   NOT NULL,
  estado          VARCHAR(20)   NOT NULL DEFAULT 'pendiente'
                    CHECK (estado IN ('pendiente','convertido','cancelado')),
  id_venta        INT           NULL REFERENCES venta(id),
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pedido_web_pendientes ON pedido_web(estado, created_at DESC)
  WHERE estado = 'pendiente';
