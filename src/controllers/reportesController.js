import { pool } from '../config/bd.js';

// GET /api/reportes/balance?meses=12
export const getBalanceIngresos = async (req, res) => {
    const meses = parseInt(req.query.meses) || 12;
    if (![3, 6, 12].includes(meses))
        return res.status(400).json({ message: 'meses debe ser 3, 6 o 12' });

    try {
        const mensualRes = await pool.query(`
            WITH meses AS (
                SELECT generate_series(
                    date_trunc('month', NOW()) - (($1 - 1) * INTERVAL '1 month'),
                    date_trunc('month', NOW()),
                    INTERVAL '1 month'
                ) AS mes
            ),
            memb AS (
                SELECT date_trunc('month', fecha_pago) AS mes,
                       SUM(monto) AS total
                FROM pago
                WHERE estado_cuota = 'pagado'
                  AND fecha_pago IS NOT NULL
                  AND fecha_pago >= date_trunc('month', NOW()) - (($1 - 1) * INTERVAL '1 month')
                GROUP BY 1
            ),
            ventas AS (
                SELECT date_trunc('month', created_at) AS mes,
                       SUM(total) AS total
                FROM venta
                WHERE estado_venta != 'anulada'
                  AND created_at >= date_trunc('month', NOW()) - (($1 - 1) * INTERVAL '1 month')
                GROUP BY 1
            )
            SELECT
                to_char(m.mes, 'YYYY-MM')      AS mes,
                to_char(m.mes, 'Mon')           AS etiqueta,
                to_char(m.mes, 'YYYY')          AS anio,
                COALESCE(mb.total, 0)::numeric  AS membresias,
                COALESCE(v.total,  0)::numeric  AS ventas,
                (COALESCE(mb.total, 0) + COALESCE(v.total, 0))::numeric AS total
            FROM meses m
            LEFT JOIN memb mb ON mb.mes = m.mes
            LEFT JOIN ventas  v ON  v.mes = m.mes
            ORDER BY m.mes
        `, [meses]);

        const kpiRes = await pool.query(`
            SELECT
                (SELECT COALESCE(SUM(monto), 0) FROM pago
                 WHERE estado_cuota = 'pagado'
                   AND fecha_pago >= date_trunc('month', NOW())
                   AND fecha_pago <  date_trunc('month', NOW()) + INTERVAL '1 month'
                ) AS memb_mes,

                (SELECT COALESCE(SUM(monto), 0) FROM pago
                 WHERE estado_cuota = 'pagado'
                   AND fecha_pago >= date_trunc('month', NOW()) - INTERVAL '1 month'
                   AND fecha_pago <  date_trunc('month', NOW())
                ) AS memb_mes_ant,

                (SELECT COALESCE(SUM(total), 0) FROM venta
                 WHERE estado_venta != 'anulada'
                   AND created_at >= date_trunc('month', NOW())
                   AND created_at <  date_trunc('month', NOW()) + INTERVAL '1 month'
                ) AS ventas_mes,

                (SELECT COALESCE(SUM(total), 0) FROM venta
                 WHERE estado_venta != 'anulada'
                   AND created_at >= date_trunc('month', NOW()) - INTERVAL '1 month'
                   AND created_at <  date_trunc('month', NOW())
                ) AS ventas_mes_ant,

                (SELECT COALESCE(SUM(saldo_pendiente), 0) FROM membresia
                 WHERE estado = 'activa' AND saldo_pendiente > 0
                ) AS deuda_memb,

                (SELECT COALESCE(SUM(saldo_pendiente), 0) FROM venta
                 WHERE estado_venta != 'anulada' AND saldo_pendiente > 0
                ) AS deuda_ventas
        `);

        const k = kpiRes.rows[0];
        const totalMes     = parseFloat(k.memb_mes)     + parseFloat(k.ventas_mes);
        const totalMesAnt  = parseFloat(k.memb_mes_ant) + parseFloat(k.ventas_mes_ant);
        const variacion    = totalMesAnt > 0
            ? ((totalMes - totalMesAnt) / totalMesAnt * 100)
            : null;

        res.json({
            mensual: mensualRes.rows.map(r => ({
                mes:        r.mes,
                etiqueta:   r.etiqueta,
                anio:       r.anio,
                membresias: parseFloat(r.membresias),
                ventas:     parseFloat(r.ventas),
                total:      parseFloat(r.total),
            })),
            kpis: {
                total_mes:         totalMes,
                total_mes_anterior: totalMesAnt,
                variacion_pct:     variacion,
                membresias_mes:    parseFloat(k.memb_mes),
                ventas_mes:        parseFloat(k.ventas_mes),
                deuda_total:       parseFloat(k.deuda_memb) + parseFloat(k.deuda_ventas),
            },
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al obtener balance de ingresos' });
    }
};
