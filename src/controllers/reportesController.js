import { pool } from '../config/bd.js';

// ══════════════════════════════════════════════════════════════════════════════
//  CONTROLLER: REPORTES
//  Combina datos de clientes, membresías, asistencias y caja para el módulo
//  de Reportes. Los KPIs básicos (activos, vencidas, etc.) se sirven desde
//  los endpoints /stats ya existentes de cada módulo; aquí solo lo que cruza
//  varias tablas o necesita período parametrizable.
// ══════════════════════════════════════════════════════════════════════════════

const PERIODOS_VALIDOS = { semana: 'week', mes: 'month' };

function truncPeriodo(periodo) {
    return PERIODOS_VALIDOS[periodo] || 'week';
}

// GET /api/reportes/clientes-riesgo?umbral=14
// Clientes con membresía activa que no asisten hace >= umbral días (o que
// nunca asistieron, usando la fecha de inicio de su membresía como referencia).
export const getClientesEnRiesgo = async (req, res) => {
    const umbral = Math.max(1, parseInt(req.query.umbral) || 14);
    try {
        const result = await pool.query(`
            SELECT
                c.id_cliente,
                c.nombre || ' ' || c.apellido AS nombre_cliente,
                c.dni, c.celular,
                m.id_membresia, m.fecha_fin,
                MAX(a.fecha_hora) AS ultima_asistencia,
                COALESCE(
                    DATE_PART('day', NOW() - MAX(a.fecha_hora)),
                    DATE_PART('day', NOW() - m.fecha_inicio)
                )::int AS dias_sin_asistir,
                CASE
                    WHEN MAX(a.fecha_hora) IS NULL AND m.fecha_inicio <= NOW() - INTERVAL '30 days' THEN 'alta'
                    WHEN COALESCE(DATE_PART('day', NOW() - MAX(a.fecha_hora)), 999) >= 30 THEN 'alta'
                    ELSE 'media'
                END AS severidad
            FROM cliente c
            JOIN membresia m ON m.id_cliente = c.id_cliente AND m.estado = 'activa'
            LEFT JOIN asistencia a ON a.id_cliente = c.id_cliente
            WHERE c.deleted_at IS NULL
            GROUP BY c.id_cliente, c.nombre, c.apellido, c.dni, c.celular, m.id_membresia, m.fecha_fin, m.fecha_inicio
            HAVING COALESCE(DATE_PART('day', NOW() - MAX(a.fecha_hora)), DATE_PART('day', NOW() - m.fecha_inicio)) >= $1
            ORDER BY dias_sin_asistir DESC
        `, [umbral]);

        res.json({ total: result.rows.length, umbral, data: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al obtener clientes en riesgo' });
    }
};

// GET /api/reportes/renovaciones?periodo=semana|mes
export const getRenovaciones = async (req, res) => {
    const periodo = truncPeriodo(req.query.periodo);
    try {
        const result = await pool.query(`
            SELECT h.id_historial, h.id_membresia, h.id_cliente,
                   c.nombre || ' ' || c.apellido AS nombre_cliente,
                   h.nombre_plan, h.renovado_at, h.monto_total
            FROM historial_membresia h
            JOIN cliente c ON c.id_cliente = h.id_cliente
            WHERE h.renovado_at >= DATE_TRUNC($1, NOW())
            ORDER BY h.renovado_at DESC
        `, [periodo]);

        res.json({ total: result.rows.length, periodo: req.query.periodo || 'semana', data: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al obtener renovaciones' });
    }
};

// GET /api/reportes/balance?periodo=semana|mes
export const getBalancePeriodo = async (req, res) => {
    const periodo = truncPeriodo(req.query.periodo);
    try {
        const result = await pool.query(`
            SELECT
                COALESCE(SUM(monto) FILTER (WHERE tipo_movimiento IN ('VENTA','INGRESO')), 0) AS ingresos,
                COALESCE(SUM(monto) FILTER (WHERE tipo_movimiento = 'EGRESO'), 0) AS gastos
            FROM movimientos_caja
            WHERE fecha_registro >= DATE_TRUNC($1, NOW()) AND estado = 1
        `, [periodo]);

        const ingresos = Number(result.rows[0].ingresos);
        const gastos   = Number(result.rows[0].gastos);
        res.json({ periodo: req.query.periodo || 'semana', ingresos, gastos, ganancia_neta: ingresos - gastos });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al obtener balance del período' });
    }
};

// GET /api/reportes/inscritos?periodo=semana|mes
export const getInscritos = async (req, res) => {
    const periodo = truncPeriodo(req.query.periodo);
    try {
        const result = await pool.query(`
            SELECT COUNT(*) AS total
            FROM cliente
            WHERE deleted_at IS NULL AND fecha_registro >= DATE_TRUNC($1, NOW())
        `, [periodo]);

        res.json({ periodo: req.query.periodo || 'semana', total: parseInt(result.rows[0].total) });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al obtener inscritos del período' });
    }
};

// GET /api/reportes/asistencias-semana
// Serie diaria de los últimos 7 días (incluyendo días sin asistencias, en 0).
export const getAsistenciasSemana = async (req, res) => {
    try {
        const result = await pool.query(`
            WITH dias AS (
                SELECT generate_series(
                    (NOW() AT TIME ZONE 'America/Lima')::date - INTERVAL '6 days',
                    (NOW() AT TIME ZONE 'America/Lima')::date,
                    INTERVAL '1 day'
                )::date AS dia
            )
            SELECT
                TO_CHAR(d.dia, 'DD/MM') AS etiqueta,
                d.dia,
                COALESCE(COUNT(DISTINCT a.id_cliente), 0) AS total
            FROM dias d
            LEFT JOIN asistencia a
                ON (a.fecha_hora AT TIME ZONE 'America/Lima')::date = d.dia
            GROUP BY d.dia
            ORDER BY d.dia
        `);

        res.json({ data: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al obtener asistencias de la semana' });
    }
};

// GET /api/reportes/caja-categorias?periodo=semana|mes
// Desglose de movimientos de caja por categoría/tipo y por método de pago.
export const getCajaPorCategoria = async (req, res) => {
    const periodo = truncPeriodo(req.query.periodo);
    try {
        const [porCategoria, porMetodo] = await Promise.all([
            pool.query(`
                SELECT categoria, tipo_movimiento,
                       COUNT(*)::int AS cantidad,
                       COALESCE(SUM(monto), 0) AS total
                FROM movimientos_caja
                WHERE fecha_registro >= DATE_TRUNC($1, NOW()) AND estado = 1
                GROUP BY categoria, tipo_movimiento
                ORDER BY total DESC
            `, [periodo]),
            pool.query(`
                SELECT metodo_pago,
                       COUNT(*)::int AS cantidad,
                       COALESCE(SUM(monto), 0) AS total
                FROM movimientos_caja
                WHERE fecha_registro >= DATE_TRUNC($1, NOW()) AND estado = 1
                GROUP BY metodo_pago
                ORDER BY total DESC
            `, [periodo]),
        ]);

        res.json({
            periodo: req.query.periodo || 'semana',
            categorias: porCategoria.rows,
            metodos_pago: porMetodo.rows,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al obtener desglose de caja por categoría' });
    }
};

// GET /api/reportes/caja-arqueos?periodo=semana|mes
// Resumen de diferencias de arqueo (sobrante/faltante) al cierre de sesiones
// de caja en el período — señal de control interno.
export const getCajaArqueos = async (req, res) => {
    const periodo = truncPeriodo(req.query.periodo);
    try {
        const [resumen, detalle] = await Promise.all([
            pool.query(`
                SELECT
                    COUNT(*)::int AS total_sesiones,
                    COUNT(*) FILTER (WHERE diferencia_efectivo IS NOT NULL AND diferencia_efectivo <> 0)::int AS sesiones_con_diferencia,
                    COALESCE(SUM(diferencia_efectivo) FILTER (WHERE diferencia_efectivo > 0), 0) AS total_sobrante,
                    COALESCE(SUM(diferencia_efectivo) FILTER (WHERE diferencia_efectivo < 0), 0) AS total_faltante
                FROM sesiones_caja
                WHERE estado = 0 AND fecha_cierre >= DATE_TRUNC($1, NOW())
            `, [periodo]),
            pool.query(`
                SELECT id_sesion, codigo_sesion, fecha_apertura, fecha_cierre,
                       monto_esperado_efectivo, monto_contado_efectivo, diferencia_efectivo, observaciones_arqueo
                FROM sesiones_caja
                WHERE estado = 0 AND fecha_cierre >= DATE_TRUNC($1, NOW())
                  AND diferencia_efectivo IS NOT NULL AND diferencia_efectivo <> 0
                ORDER BY fecha_cierre DESC
            `, [periodo]),
        ]);

        const row = resumen.rows[0];
        res.json({
            periodo: req.query.periodo || 'semana',
            total_sesiones: row.total_sesiones,
            sesiones_con_diferencia: row.sesiones_con_diferencia,
            total_sobrante: Number(row.total_sobrante),
            total_faltante: Number(row.total_faltante),
            detalle: detalle.rows,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al obtener arqueos del período' });
    }
};

// GET /api/reportes/ventas-resumen?periodo=semana|mes
// Solo ventas 'registrada' (fuente de verdad; excluye pendientes y anuladas).
export const getVentasResumen = async (req, res) => {
    const periodo = truncPeriodo(req.query.periodo);
    try {
        const [resumen, porMetodo, porCanal] = await Promise.all([
            pool.query(`
                SELECT COUNT(*)::int AS total_transacciones,
                       COALESCE(SUM(total), 0) AS total_vendido,
                       COALESCE(AVG(total), 0) AS ticket_promedio
                FROM venta
                WHERE estado_venta = 'registrada' AND created_at >= DATE_TRUNC($1, NOW())
            `, [periodo]),
            pool.query(`
                SELECT metodo_pago,
                       COUNT(*)::int AS cantidad,
                       COALESCE(SUM(total), 0) AS total
                FROM venta
                WHERE estado_venta = 'registrada' AND created_at >= DATE_TRUNC($1, NOW())
                GROUP BY metodo_pago
                ORDER BY total DESC
            `, [periodo]),
            pool.query(`
                SELECT canal_venta,
                       COUNT(*)::int AS cantidad,
                       COALESCE(SUM(total), 0) AS total
                FROM venta
                WHERE estado_venta = 'registrada' AND created_at >= DATE_TRUNC($1, NOW())
                GROUP BY canal_venta
                ORDER BY total DESC
            `, [periodo]),
        ]);

        const row = resumen.rows[0];
        res.json({
            periodo: req.query.periodo || 'semana',
            total_transacciones: row.total_transacciones,
            total_vendido: Number(row.total_vendido),
            ticket_promedio: Number(row.ticket_promedio),
            por_metodo_pago: porMetodo.rows,
            por_canal_venta: porCanal.rows,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al obtener resumen de ventas' });
    }
};

// GET /api/reportes/ventas-top-productos?periodo=semana|mes&limite=10
// Usa nombre_snapshot (nombre del producto al momento de la venta), evita
// depender de que el producto siga existiendo/con el mismo nombre hoy.
export const getVentasTopProductos = async (req, res) => {
    const periodo = truncPeriodo(req.query.periodo);
    const limite = Math.min(50, Math.max(1, parseInt(req.query.limite) || 10));
    try {
        const result = await pool.query(`
            SELECT
                vd.nombre_snapshot AS producto,
                SUM(vd.cantidad)::int AS cantidad_vendida,
                COALESCE(SUM(vd.subtotal), 0) AS total_vendido
            FROM venta_detalle vd
            JOIN venta v ON v.id = vd.id_venta
            WHERE v.estado_venta = 'registrada' AND v.created_at >= DATE_TRUNC($1, NOW())
            GROUP BY vd.nombre_snapshot
            ORDER BY total_vendido DESC
            LIMIT $2
        `, [periodo, limite]);

        res.json({ periodo: req.query.periodo || 'semana', data: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al obtener top de productos vendidos' });
    }
};

// GET /api/reportes/home-kpis
// Resumen para las 8 tarjetas KPI del dashboard principal, en una sola llamada.
// Ingresos (día/semana/mes) sobre movimientos_caja (VENTA+INGRESO, estado=1) en
// zona America/Lima. El resto reutiliza la lógica de los /stats de cada módulo.
export const getHomeKpis = async (req, res) => {
    try {
        const [caja, membresias, asistencias, clientes] = await Promise.all([
            pool.query(`
                SELECT
                    COALESCE(SUM(monto) FILTER (
                        WHERE (fecha_registro AT TIME ZONE 'America/Lima')::date = (NOW() AT TIME ZONE 'America/Lima')::date
                    ), 0) AS ingresos_dia,
                    COALESCE(SUM(monto) FILTER (
                        WHERE fecha_registro >= date_trunc('week',  NOW() AT TIME ZONE 'America/Lima') AT TIME ZONE 'America/Lima'
                    ), 0) AS ingresos_semana,
                    COALESCE(SUM(monto) FILTER (
                        WHERE fecha_registro >= date_trunc('month', NOW() AT TIME ZONE 'America/Lima') AT TIME ZONE 'America/Lima'
                    ), 0) AS ingresos_mes
                FROM movimientos_caja
                WHERE estado = 1 AND tipo_movimiento IN ('VENTA','INGRESO')
            `),
            pool.query(`
                SELECT
                    COUNT(*) FILTER (WHERE m.estado = 'activa') AS matriculas_activas,
                    COALESCE(SUM(m.saldo_pendiente) FILTER (WHERE m.saldo_pendiente > 0 AND m.estado IN ('activa','vencida')), 0) AS pagos_pendientes
                FROM membresia m
                JOIN cliente c ON c.id_cliente = m.id_cliente
                WHERE c.deleted_at IS NULL
            `),
            pool.query(`
                SELECT COUNT(DISTINCT id_cliente) FILTER (
                    WHERE (fecha_hora AT TIME ZONE 'America/Lima')::date = (NOW() AT TIME ZONE 'America/Lima')::date
                ) AS asistencias_hoy
                FROM asistencia
            `),
            pool.query(`
                SELECT
                    COUNT(*) FILTER (WHERE activo = true) AS total_clientes,
                    COUNT(*) FILTER (
                        WHERE fecha_registro >= (NOW() AT TIME ZONE 'America/Lima')::date - INTERVAL '30 days'
                    ) AS nuevos_clientes_mes
                FROM cliente
                WHERE deleted_at IS NULL
            `),
        ]);

        res.json({
            ingresos_dia:        Number(caja.rows[0].ingresos_dia),
            ingresos_semana:     Number(caja.rows[0].ingresos_semana),
            ingresos_mes:        Number(caja.rows[0].ingresos_mes),
            pagos_pendientes:    Number(membresias.rows[0].pagos_pendientes),
            matriculas_activas:  parseInt(membresias.rows[0].matriculas_activas),
            asistencias_hoy:     parseInt(asistencias.rows[0].asistencias_hoy),
            nuevos_clientes_mes: parseInt(clientes.rows[0].nuevos_clientes_mes),
            total_clientes:      parseInt(clientes.rows[0].total_clientes),
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al obtener KPIs del dashboard' });
    }
};

// GET /api/reportes/ingresos-mensuales
// Serie de los últimos 6 meses (incluyendo meses sin ingresos, en 0), sobre
// movimientos_caja (VENTA+INGRESO, estado=1) en zona America/Lima.
export const getIngresosMensuales = async (req, res) => {
    try {
        const result = await pool.query(`
            WITH meses AS (
                SELECT generate_series(
                    date_trunc('month', (NOW() AT TIME ZONE 'America/Lima')) - INTERVAL '5 months',
                    date_trunc('month', (NOW() AT TIME ZONE 'America/Lima')),
                    INTERVAL '1 month'
                )::date AS mes
            )
            SELECT
                TO_CHAR(m.mes, 'Mon YYYY') AS etiqueta,
                EXTRACT(YEAR  FROM m.mes)::int AS anio,
                EXTRACT(MONTH FROM m.mes)::int AS mes,
                COALESCE(SUM(mc.monto), 0) AS total
            FROM meses m
            LEFT JOIN movimientos_caja mc
                ON date_trunc('month', (mc.fecha_registro AT TIME ZONE 'America/Lima')) = m.mes
                AND mc.estado = 1
                AND mc.tipo_movimiento IN ('VENTA','INGRESO')
            GROUP BY m.mes
            ORDER BY m.mes
        `);

        res.json({ data: result.rows.map(r => ({ ...r, total: Number(r.total) })) });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al obtener ingresos mensuales' });
    }
};

// GET /api/reportes/ventas-serie-diaria
// Serie diaria de los últimos 7 días (incluyendo días sin ventas, en 0).
export const getVentasSerieDiaria = async (req, res) => {
    try {
        const result = await pool.query(`
            WITH dias AS (
                SELECT generate_series(
                    (NOW() AT TIME ZONE 'America/Lima')::date - INTERVAL '6 days',
                    (NOW() AT TIME ZONE 'America/Lima')::date,
                    INTERVAL '1 day'
                )::date AS dia
            )
            SELECT
                TO_CHAR(d.dia, 'DD/MM') AS etiqueta,
                d.dia,
                COALESCE(SUM(v.total) FILTER (WHERE v.estado_venta = 'registrada'), 0) AS total
            FROM dias d
            LEFT JOIN venta v
                ON (v.created_at AT TIME ZONE 'America/Lima')::date = d.dia
            GROUP BY d.dia
            ORDER BY d.dia
        `);

        res.json({ data: result.rows });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al obtener serie diaria de ventas' });
    }
};
