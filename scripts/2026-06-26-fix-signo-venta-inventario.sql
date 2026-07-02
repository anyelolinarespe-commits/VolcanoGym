-- ─────────────────────────────────────────────────────────────────────────────
-- Fix: signo de los movimientos de VENTA en inventario_movimiento
--
-- El trigger fn_descontar_stock_venta guardaba `cantidad` en POSITIVO al vender,
-- por lo que el Historial de Movimientos mostraba "17 → 16 (+1)" en vez de (-1).
-- El stock_antes/stock_despues siempre fueron correctos; solo el delta tenía mal
-- el signo. Se corrige el trigger y se normalizan los datos históricos.
--
-- Convención unificada (igual que el ajuste manual y fn_descontar_stock_pp):
--   ingreso/devolucion → cantidad > 0
--   venta/salida       → cantidad < 0
-- ─────────────────────────────────────────────────────────────────────────────

-- 1) Trigger corregido: -NEW.cantidad
CREATE OR REPLACE FUNCTION public.fn_descontar_stock_venta()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
    BEGIN
        UPDATE public.producto_presentacion
        SET stock_actual = stock_actual - NEW.cantidad,
            updated_at   = now()
        WHERE id = NEW.id_pp;

        INSERT INTO public.inventario_movimiento(
            id_pp, tipo, cantidad,
            stock_antes, stock_despues,
            boleta_ref, observacion, id_usuario_reg, created_at
        )
        SELECT
            NEW.id_pp,
            'venta'::public.tipo_movimiento_enum,
            -NEW.cantidad,
            stock_actual + NEW.cantidad,
            stock_actual,
            (SELECT numero_venta FROM public.venta WHERE id = NEW.id_venta),
            'Venta automatica',
            (SELECT id_usuario_reg FROM public.venta WHERE id = NEW.id_venta),
            now()
        FROM public.producto_presentacion WHERE id = NEW.id_pp;

        RETURN NEW;
    END
    $function$;

-- 2) Normalizar los movimientos de venta históricos guardados con signo positivo
UPDATE public.inventario_movimiento
SET    cantidad = -ABS(cantidad)
WHERE  tipo = 'venta' AND cantidad > 0;
