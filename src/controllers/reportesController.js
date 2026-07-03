import { pool } from '../config/bd.js';
import { registrarAuditoria, getIP } from '../helpers/auditoria.js';

const METODOS_PAGO = ['efectivo', 'yape', 'plin', 'transferencia', 'tarjeta'];

// Ingresos (membresías + ventas) agrupados por método de pago, en un rango de tiempo.
async function _ingresosPorMetodo(desde, hasta) {
    const memb = await pool.query(`
        SELECT metodo_pago, COALESCE(SUM(monto), 0)::numeric AS total
        FROM pago
        WHERE estado_cuota = 'pagado' AND fecha_pago BETWEEN $1 AND $2
        GROUP BY metodo_pago
    `, [desde, hasta]);
    const ventas = await pool.query(`
        SELECT metodo_pago, COALESCE(SUM(total), 0)::numeric AS total
        FROM venta
        WHERE estado_venta = 'registrada' AND created_at BETWEEN $1 AND $2
        GROUP BY metodo_pago
    `, [desde, hasta]);

    const porMetodo = {};
    METODOS_PAGO.forEach(m => { porMetodo[m] = { membresias: 0, ventas: 0, total: 0 }; });
    porMetodo.mixto = { membresias: 0, ventas: 0, total: 0 }; // ventas con pago mixto

    memb.rows.forEach(r => {
        if (!porMetodo[r.metodo_pago]) porMetodo[r.metodo_pago] = { membresias: 0, ventas: 0, total: 0 };
        porMetodo[r.metodo_pago].membresias += parseFloat(r.total);
        porMetodo[r.metodo_pago].total      += parseFloat(r.total);
    });
    ventas.rows.forEach(r => {
        if (!porMetodo[r.metodo_pago]) porMetodo[r.metodo_pago] = { membresias: 0, ventas: 0, total: 0 };
        porMetodo[r.metodo_pago].ventas += parseFloat(r.total);
        porMetodo[r.metodo_pago].total  += parseFloat(r.total);
    });
    return porMetodo;
}

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

// ══════════════════════════════════════════════════════════════════════════
//  MONITOR DE CAJA — apertura/cierre de turno + egresos manuales
// ══════════════════════════════════════════════════════════════════════════

// GET /api/reportes/caja/turno-actual
export const getTurnoActual = async (req, res) => {
    try {
        const turnoRes = await pool.query(
            `SELECT t.*, u.nombre || ' ' || u.apellido AS usuario_apertura
             FROM caja_turno t
             LEFT JOIN usuarios u ON u.id_usuario = t.id_usuario_apertura
             WHERE t.estado = 'abierto' ORDER BY t.abierto_at DESC LIMIT 1`
        );
        if (!turnoRes.rows.length) return res.json({ turno: null });

        const turno = turnoRes.rows[0];
        const hasta = new Date().toISOString();
        const ingresos = await _ingresosPorMetodo(turno.abierto_at, hasta);

        const egresosRes = await pool.query(
            `SELECT e.id_egreso, e.motivo, e.monto, e.created_at,
                    u.nombre || ' ' || u.apellido AS usuario
             FROM caja_egreso e
             LEFT JOIN usuarios u ON u.id_usuario = e.id_usuario_reg
             WHERE e.id_turno = $1 ORDER BY e.created_at DESC`,
            [turno.id_turno]
        );

        const totalEfectivo    = ingresos.efectivo?.total || 0;
        const totalDigital     = Object.entries(ingresos).filter(([m]) => m !== 'efectivo').reduce((s, [, v]) => s + v.total, 0);
        const totalEgresos     = egresosRes.rows.reduce((s, e) => s + parseFloat(e.monto), 0);
        const balanceEsperado  = parseFloat(turno.monto_apertura) + totalEfectivo - totalEgresos;

        res.json({
            turno: {
                id_turno: turno.id_turno,
                monto_apertura: parseFloat(turno.monto_apertura),
                usuario_apertura: turno.usuario_apertura,
                abierto_at: turno.abierto_at,
            },
            ingresos,
            egresos: egresosRes.rows.map(e => ({ ...e, monto: parseFloat(e.monto) })),
            resumen: {
                total_efectivo: totalEfectivo,
                total_digital: totalDigital,
                total_egresos: totalEgresos,
                balance_esperado: balanceEsperado,
            },
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al obtener el turno actual' });
    }
};

// POST /api/reportes/caja/abrir
export const abrirTurno = async (req, res) => {
    const { monto_apertura } = req.body;
    const monto = parseFloat(monto_apertura);
    if (isNaN(monto) || monto < 0)
        return res.status(400).json({ message: 'El monto de apertura debe ser un número válido mayor o igual a 0' });

    try {
        const abierto = await pool.query(`SELECT id_turno FROM caja_turno WHERE estado = 'abierto'`);
        if (abierto.rows.length)
            return res.status(409).json({ message: 'Ya hay un turno de caja abierto. Ciérralo antes de abrir uno nuevo.' });

        const result = await pool.query(
            `INSERT INTO caja_turno (id_usuario_apertura, monto_apertura, estado)
             VALUES ($1, $2, 'abierto') RETURNING *`,
            [req.usuario.id, monto]
        );

        registrarAuditoria({
            id_usuario: req.usuario.id,
            nombre_usuario: req.usuario.nombre || req.usuario.username,
            accion: 'CREAR', modulo: 'Reportes-Caja',
            descripcion: `Apertura de caja #${result.rows[0].id_turno} con S/ ${monto.toFixed(2)}`,
            ip: getIP(req),
            datos_nuevos: { id_turno: result.rows[0].id_turno, monto_apertura: monto },
        });

        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al abrir el turno de caja' });
    }
};

// POST /api/reportes/caja/:id/cerrar
export const cerrarTurno = async (req, res) => {
    const { id } = req.params;
    const { monto_cierre_declarado, observaciones } = req.body;
    const declarado = parseFloat(monto_cierre_declarado);
    if (isNaN(declarado) || declarado < 0)
        return res.status(400).json({ message: 'El monto de cierre debe ser un número válido mayor o igual a 0' });

    try {
        const turnoRes = await pool.query(`SELECT * FROM caja_turno WHERE id_turno = $1`, [id]);
        if (!turnoRes.rows.length) return res.status(404).json({ message: 'Turno no encontrado' });
        const turno = turnoRes.rows[0];
        if (turno.estado !== 'abierto')
            return res.status(400).json({ message: 'Este turno ya está cerrado' });

        const hasta = new Date().toISOString();
        const ingresos = await _ingresosPorMetodo(turno.abierto_at, hasta);
        const totalEfectivo = ingresos.efectivo?.total || 0;

        const egresosRes = await pool.query(
            `SELECT COALESCE(SUM(monto), 0)::numeric AS total FROM caja_egreso WHERE id_turno = $1`, [id]
        );
        const totalEgresos = parseFloat(egresosRes.rows[0].total);

        const esperado   = parseFloat(turno.monto_apertura) + totalEfectivo - totalEgresos;
        const diferencia = declarado - esperado;

        const result = await pool.query(
            `UPDATE caja_turno
             SET id_usuario_cierre = $1, monto_cierre_declarado = $2, monto_cierre_esperado = $3,
                 diferencia = $4, estado = 'cerrado', observaciones = $5, cerrado_at = NOW()
             WHERE id_turno = $6 RETURNING *`,
            [req.usuario.id, declarado, esperado, diferencia, observaciones || null, id]
        );

        registrarAuditoria({
            id_usuario: req.usuario.id,
            nombre_usuario: req.usuario.nombre || req.usuario.username,
            accion: 'EDITAR', modulo: 'Reportes-Caja',
            descripcion: `Cierre de caja #${id} — esperado S/ ${esperado.toFixed(2)}, declarado S/ ${declarado.toFixed(2)}, diferencia S/ ${diferencia.toFixed(2)}`,
            ip: getIP(req),
            datos_nuevos: { id_turno: Number(id), esperado, declarado, diferencia },
        });

        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al cerrar el turno de caja' });
    }
};

// POST /api/reportes/caja/egresos
export const registrarEgreso = async (req, res) => {
    const { motivo, monto } = req.body;
    const montoNum = parseFloat(monto);
    if (!motivo || !motivo.trim())
        return res.status(400).json({ message: 'El motivo del egreso es requerido' });
    if (isNaN(montoNum) || montoNum <= 0)
        return res.status(400).json({ message: 'El monto debe ser un número mayor a 0' });

    try {
        const abierto = await pool.query(`SELECT id_turno FROM caja_turno WHERE estado = 'abierto'`);
        if (!abierto.rows.length)
            return res.status(400).json({ message: 'No hay un turno de caja abierto. Abre caja antes de registrar egresos.' });

        const result = await pool.query(
            `INSERT INTO caja_egreso (id_turno, motivo, monto, id_usuario_reg)
             VALUES ($1, $2, $3, $4) RETURNING *`,
            [abierto.rows[0].id_turno, motivo.trim(), montoNum, req.usuario.id]
        );

        registrarAuditoria({
            id_usuario: req.usuario.id,
            nombre_usuario: req.usuario.nombre || req.usuario.username,
            accion: 'CREAR', modulo: 'Reportes-Caja',
            descripcion: `Egreso de caja: "${motivo.trim()}" — S/ ${montoNum.toFixed(2)}`,
            ip: getIP(req),
            datos_nuevos: result.rows[0],
        });

        res.json(result.rows[0]);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al registrar el egreso' });
    }
};

// GET /api/reportes/caja/historial?desde=&hasta=
export const getHistorialTurnos = async (req, res) => {
    const { desde, hasta } = req.query;
    try {
        const params = [];
        const conds = [`t.estado = 'cerrado'`];
        if (desde) { params.push(desde + 'T00:00:00'); conds.push(`t.abierto_at >= $${params.length}`); }
        if (hasta) { params.push(hasta + 'T23:59:59'); conds.push(`t.abierto_at <= $${params.length}`); }

        const result = await pool.query(`
            SELECT t.id_turno, t.monto_apertura, t.monto_cierre_declarado, t.monto_cierre_esperado,
                   t.diferencia, t.abierto_at, t.cerrado_at, t.observaciones,
                   ua.nombre || ' ' || ua.apellido AS usuario_apertura,
                   uc.nombre || ' ' || uc.apellido AS usuario_cierre
            FROM caja_turno t
            LEFT JOIN usuarios ua ON ua.id_usuario = t.id_usuario_apertura
            LEFT JOIN usuarios uc ON uc.id_usuario = t.id_usuario_cierre
            WHERE ${conds.join(' AND ')}
            ORDER BY t.cerrado_at DESC LIMIT 100
        `, params);

        res.json(result.rows.map(r => ({
            ...r,
            monto_apertura: parseFloat(r.monto_apertura),
            monto_cierre_declarado: r.monto_cierre_declarado != null ? parseFloat(r.monto_cierre_declarado) : null,
            monto_cierre_esperado:  r.monto_cierre_esperado  != null ? parseFloat(r.monto_cierre_esperado)  : null,
            diferencia: r.diferencia != null ? parseFloat(r.diferencia) : null,
        })));
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al obtener el historial de caja' });
    }
};

// ══════════════════════════════════════════════════════════════════════════
//  REPORTES FINANCIEROS / CLIENTES (KPIs) / OPERATIVOS
// ══════════════════════════════════════════════════════════════════════════

// GET /api/reportes/financiero?desde=&hasta=
export const getReporteFinanciero = async (req, res) => {
    const hoy = new Date().toISOString().split('T')[0];
    const desde = req.query.desde ? `${req.query.desde}T00:00:00` : `${hoy}T00:00:00`;
    const hasta = req.query.hasta ? `${req.query.hasta}T23:59:59` : `${hoy}T23:59:59`;

    try {
        const ingresos = await _ingresosPorMetodo(desde, hasta);

        const deudaRes = await pool.query(`
            SELECT
                (SELECT COALESCE(SUM(saldo_pendiente), 0) FROM membresia WHERE estado != 'anulada' AND saldo_pendiente > 0) AS deuda_membresias,
                (SELECT COALESCE(SUM(saldo_pendiente), 0) FROM venta WHERE estado_venta != 'anulada' AND saldo_pendiente > 0) AS deuda_ventas
        `);
        const d = deudaRes.rows[0];

        const totalGeneral = Object.values(ingresos).reduce((s, v) => s + v.total, 0);

        res.json({
            rango: { desde: req.query.desde || hoy, hasta: req.query.hasta || hoy },
            ingresos_por_metodo: ingresos,
            total_general: totalGeneral,
            deuda: {
                membresias: parseFloat(d.deuda_membresias),
                ventas: parseFloat(d.deuda_ventas),
                total: parseFloat(d.deuda_membresias) + parseFloat(d.deuda_ventas),
            },
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al obtener el reporte financiero' });
    }
};

// GET /api/reportes/clientes
export const getReporteClientes = async (req, res) => {
    try {
        const stats = await pool.query(`
            SELECT
                COUNT(*) FILTER (WHERE m.tipo_ingreso = 'nuevo'      AND m.created_at >= date_trunc('month', NOW())) AS nuevos_mes,
                COUNT(*) FILTER (WHERE m.tipo_ingreso = 'renovacion' AND m.created_at >= date_trunc('month', NOW())) AS renovaciones_mes
            FROM membresia m
        `);

        const vencimientosRes = await pool.query(`
            SELECT m.id_membresia, c.id_cliente, c.nombre, c.apellido, c.celular, m.fecha_fin,
                   (m.fecha_fin - CURRENT_DATE) AS dias_restantes
            FROM membresia m
            JOIN cliente c ON c.id_cliente = m.id_cliente
            WHERE m.estado = 'activa' AND c.deleted_at IS NULL
              AND m.fecha_fin BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '30 days'
            ORDER BY m.fecha_fin ASC
            LIMIT 50
        `);

        const deudoresRes = await pool.query(`
            SELECT c.id_cliente, c.nombre, c.apellido, c.dni, SUM(m.saldo_pendiente)::numeric AS deuda
            FROM membresia m
            JOIN cliente c ON c.id_cliente = m.id_cliente
            WHERE m.estado != 'anulada' AND m.saldo_pendiente > 0 AND c.deleted_at IS NULL
            GROUP BY c.id_cliente, c.nombre, c.apellido, c.dni
            ORDER BY deuda DESC
            LIMIT 20
        `);

        res.json({
            nuevos_mes: parseInt(stats.rows[0].nuevos_mes),
            renovaciones_mes: parseInt(stats.rows[0].renovaciones_mes),
            proximos_vencimientos: vencimientosRes.rows.map(r => ({ ...r, dias_restantes: parseInt(r.dias_restantes) })),
            top_deudores: deudoresRes.rows.map(r => ({ ...r, deuda: parseFloat(r.deuda) })),
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al obtener el reporte de clientes' });
    }
};

// GET /api/reportes/operativo?desde=&hasta=
export const getReporteOperativo = async (req, res) => {
    const hoy = new Date();
    const hace7dias = new Date(hoy.getTime() - 7 * 24 * 60 * 60 * 1000);
    const desde = req.query.desde ? `${req.query.desde}T00:00:00-05:00` : hace7dias.toISOString();
    const hasta = req.query.hasta ? `${req.query.hasta}T23:59:59-05:00` : hoy.toISOString();

    try {
        const asistenciasRes = await pool.query(`
            SELECT DATE(fecha_hora AT TIME ZONE 'America/Lima') AS fecha, COUNT(*) AS total
            FROM asistencia
            WHERE fecha_hora BETWEEN $1 AND $2
            GROUP BY 1 ORDER BY 1
        `, [desde, hasta]);

        const productosRes = await pool.query(`
            SELECT d.nombre_snapshot AS producto, SUM(d.cantidad) AS unidades, SUM(d.subtotal)::numeric AS total
            FROM venta_detalle d
            JOIN venta v ON v.id = d.id_venta
            WHERE v.estado_venta = 'registrada' AND v.created_at BETWEEN $1 AND $2
            GROUP BY d.nombre_snapshot
            ORDER BY unidades DESC
            LIMIT 10
        `, [desde, hasta]);

        const stockBajoRes = await pool.query(`
            SELECT pp.id, p.nombre AS producto, pr.nombre AS presentacion, pp.stock_actual
            FROM producto_presentacion pp
            JOIN producto p ON p.id_producto = pp.id_producto
            JOIN presentacion pr ON pr.id_presentacion = pp.id_presentacion
            WHERE pp.estado = 1 AND pp.stock_actual <= 5
            ORDER BY pp.stock_actual ASC
            LIMIT 20
        `);

        res.json({
            rango: { desde: req.query.desde || hace7dias.toISOString().split('T')[0], hasta: req.query.hasta || hoy.toISOString().split('T')[0] },
            asistencias_por_dia: asistenciasRes.rows.map(r => ({ fecha: r.fecha, total: parseInt(r.total) })),
            productos_mas_vendidos: productosRes.rows.map(r => ({ ...r, unidades: parseInt(r.unidades), total: parseFloat(r.total) })),
            stock_bajo: stockBajoRes.rows,
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: 'Error al obtener el reporte operativo' });
    }
};
