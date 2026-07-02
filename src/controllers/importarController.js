import XLSX from 'xlsx';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { pool } from '../config/bd.js';
import { registrarAuditoria, getIP } from '../helpers/auditoria.js';

// Mapeo de nombre de hoja → año
function inferirAnio(nombreHoja) {
  if (!nombreHoja) return new Date().getFullYear();
  const match = nombreHoja.match(/\b(\d{2})\b/);
  if (match) {
    const yy = parseInt(match[1], 10);
    return yy + 2000;
  }
  return new Date().getFullYear();
}

// Parsea "01/04", "20-04", "6-4" etc. con año dado → "YYYY-MM-DD" o null
function parsearFecha(valor, anio) {
  if (!valor && valor !== 0) return null;
  const s = String(valor).trim();
  if (!s) return null;

  // Si XLSX entregó un número serial de fecha
  if (/^\d+(\.\d+)?$/.test(s) && parseFloat(s) > 100) {
    const d = XLSX.SSF.parse_date_code(parseFloat(s));
    if (d) return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
  }

  // Formatos "DD/MM", "DD-MM", "D/M", "D-M"
  const m = s.match(/^(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?$/);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const mon = parseInt(m[2], 10);
  const yr  = m[3] ? (m[3].length === 2 ? 2000 + parseInt(m[3]) : parseInt(m[3])) : anio;
  if (day < 1 || day > 31 || mon < 1 || mon > 12) return null;
  return `${yr}-${String(mon).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
}

/** Suma N días a una fecha "YYYY-MM-DD" */
function addDias(fechaStr, dias) {
  const d = new Date(fechaStr + 'T12:00:00');
  d.setDate(d.getDate() + dias);
  return d.toISOString().split('T')[0];
}

/** Días de diferencia entre dos fechas "YYYY-MM-DD" (b - a) */
function diffDias(a, b) {
  const da = new Date(a + 'T12:00:00');
  const db = new Date(b + 'T12:00:00');
  return Math.round((db - da) / (1000 * 60 * 60 * 24));
}

/** Muestra "YYYY-MM-DD" como "DD/MM/YYYY" (mismo formato del Excel) para mensajes al usuario */
function formatFechaCorta(iso) {
  if (!iso) return iso;
  const [y, m, d] = iso.split('-');
  return (y && m && d) ? `${d}/${m}/${y}` : iso;
}

// Calcula el plazo de pago de la cuota pendiente de una fila (si aplica).
// El plazo siempre cuenta desde fechaInicio (o el override que haya elegido
// quien importa) — nunca desde "hoy" ni desde la fecha de término.
function calcularPlazoPago(fechaInicio, diasLimite, hoy) {
  if (!fechaInicio || !diasLimite) return null;
  const fecha_limite = addDias(fechaInicio, diasLimite);
  const dias_restantes = diffDias(hoy, fecha_limite);
  return { fecha_inicio: fechaInicio, fecha_limite, dias_limite: diasLimite, dias_restantes, vencido: dias_restantes < 0 };
}

// Limpia un número de celular: deja solo dígitos, máx 12 chars
function limpiarCelular(val) {
  if (!val) return null;
  const s = String(val).replace(/\D/g, '').trim();
  return s || null;
}

// Convierte valor de celda a string limpio
function cel(val) {
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

// Extrae keywords del nombre de plan para búsqueda fuzzy
function keywordsPlan(nombre) {
  if (!nombre) return null;
  const n = nombre.toLowerCase();
  if (n.startsWith('inter')) return '%inter%';
  if (n.startsWith('clasi') || n.startsWith('clas')) return '%cl%sic%';
  if (n.startsWith('rutina')) return '%rutina%';
  return `%${n.substring(0, 4)}%`;
}

// Parsea una fila del Excel y devuelve objeto con campos mapeados + advertencias
// fila: número de fila Excel (para generar código TMP único)
function parsearFila(row, headers, anio, fila = 0) {
  const get = (key) => {
    const h = headers.find(h => h.key === key);
    return h ? cel(row[h.col]) : '';
  };

  const advertencias = [];
  const errores = [];

  // Nombre → nombre + apellido
  const nombreCompleto = get('nombre');
  let nombre = '', apellido = '';
  if (nombreCompleto) {
    const partes = nombreCompleto.trim().split(/\s+/);
    if (partes.length === 1) {
      nombre = partes[0];
      apellido = '';
    } else {
      apellido = partes.pop();
      nombre = partes.join(' ');
    }
  }
  if (!nombre) errores.push('Nombre vacío');

  // DNI — si está vacío se genera un código temporal para no perder el registro
  const dniRaw = get('dni').replace(/\D/g, '');
  let dni = dniRaw;
  let tipoDocumento = 'DNI';
  let dniEsTemporal = false;

  if (!dniRaw) {
    // Sin DNI: asignar documento temporal para no descartar al socio
    dni = `TMP-${String(fila).padStart(4,'0')}`;
    tipoDocumento = 'TMP';
    dniEsTemporal = true;
    advertencias.push('Sin DNI — se asignó documento temporal. Actualizar desde el perfil del cliente.');
  } else if (!/^\d{8}$/.test(dniRaw)) {
    // DNI con formato incorrecto: guardar igual con tipo TMP para no perder datos
    dni = `TMP-${dniRaw}`;
    tipoDocumento = 'TMP';
    dniEsTemporal = true;
    advertencias.push(`DNI "${dniRaw}" con formato inválido — guardado como temporal. Verificar y corregir luego.`);
  }

  // CEL
  const celular = limpiarCelular(get('cel'));

  // Plan
  const planNombre = get('plan');

  // Meses (referencia)
  const mesesRaw = get('meses');
  const meses = mesesRaw ? parseInt(mesesRaw) : null;

  // Montos
  const montoRaw = get('monto');
  const saldoRaw = get('saldo');
  const monto  = montoRaw  ? parseFloat(montoRaw)  : null;
  const saldo  = saldoRaw  ? parseFloat(saldoRaw)  : 0;

  // Fechas
  const fechaReg   = parsearFecha(get('fecha'),     anio);
  const fechaPago  = parsearFecha(get('fech_pago'), anio);
  const fechaInicio= parsearFecha(get('f_inicio'),  anio);
  const fechaFin   = parsearFecha(get('f_termino'), anio);

  if (fechaInicio && !fechaFin) advertencias.push('F.termino ausente');

  // Tipo ingreso
  const nvoRen = get('nuevo_ren').toUpperCase();
  let tipoIngreso = 'nuevo';
  if (nvoRen.includes('RENOV') || nvoRen === 'RENOV' || nvoRen.startsWith('R')) {
    tipoIngreso = 'renovacion';
  }

  // Asesor
  const asesorNombre = get('asesor');

  // Observaciones
  const observaciones = get('observa') || null;

  // Agregar nota de DNI pendiente a las observaciones
  let obsExtra = observaciones || '';
  if (dniEsTemporal) {
    obsExtra = ['DNI pendiente de verificación — importado desde Excel', obsExtra].filter(Boolean).join(' | ');
  }

  return {
    nombreCompleto, nombre, apellido,
    dni,
    tipoDocumento,
    dniEsTemporal,
    dniOriginal: dniRaw || null,
    celular,
    planNombre,
    meses,
    monto,
    saldo,
    fechaReg,
    fechaPago,
    fechaInicio,
    fechaFin,
    tipoIngreso,
    asesorNombre,
    observaciones: obsExtra || null,
    advertencias,
    errores,
  };
}

// Detecta las columnas buscando cabeceras conocidas
function detectarHeaders(sheet) {
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1:N5');
  const ALIASES = {
    'nombre':     'nombre',
    'name':       'nombre',
    'dni':        'dni',
    'doc':        'dni',
    'cel':        'cel',
    'celular':    'cel',
    'telefono':   'cel',
    'plan':       'plan',
    'meses':      'meses',
    'monto':      'monto',
    'saldo':      'saldo',
    'fecha':      'fecha',
    'fech pago':  'fech_pago',
    'fech_pago':  'fech_pago',
    'f.inicio':   'f_inicio',
    'f inicio':   'f_inicio',
    'f_inicio':   'f_inicio',
    'inicio':     'f_inicio',
    'f.termino':  'f_termino',
    'f termino':  'f_termino',
    'f_termino':  'f_termino',
    'termino':    'f_termino',
    'fin':        'f_termino',
    'nuevo/ ren': 'nuevo_ren',
    'nuevo/ren':  'nuevo_ren',
    'nuevo ren':  'nuevo_ren',
    'nvo/ren':    'nuevo_ren',
    'asesor':     'asesor',
    'observa':    'observa',
    'observaciones': 'observa',
  };

  let headerRow = -1;
  let headers = [];

  for (let r = range.s.r; r <= Math.min(range.s.r + 5, range.e.r); r++) {
    const rowHeaders = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = sheet[addr];
      if (!cell) continue;
      const raw = cel(cell.v).toLowerCase().replace(/[^\w\s\/\.]/g,'').trim();
      const key = ALIASES[raw];
      if (key) rowHeaders.push({ key, col: addr[0] === addr[0] ? XLSX.utils.encode_col(c) : null, colIdx: c });
    }
    if (rowHeaders.length >= 3) {
      headerRow = r;
      headers = rowHeaders;
      break;
    }
  }

  return { headerRow, headers };
}

// Lee todas las filas de una hoja a partir de la fila de cabeceras
function leerFilas(sheet, headerRow) {
  const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1');
  const rows = [];
  for (let r = headerRow + 1; r <= range.e.r; r++) {
    const row = {};
    for (let c = range.s.c; c <= range.e.c; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = sheet[addr];
      row[XLSX.utils.encode_col(c)] = cell ? cell.v : null;
    }
    rows.push(row);
  }
  return rows;
}

// Busca id_plan por nombre fuzzy
async function buscarPlan(nombre) {
  if (!nombre) return null;
  const kw = keywordsPlan(nombre);
  if (!kw) return null;
  const r = await pool.query(
    `SELECT id_plan, nombre, dias_limite_fraccion FROM plan_membresia WHERE LOWER(nombre) LIKE LOWER($1) AND activo=true ORDER BY id_plan LIMIT 1`,
    [kw]
  );
  return r.rows[0] || null;
}

// Busca un plan por id (usado cuando quien importa asigna manualmente el plan
// de una fila cuyo nombre de Excel no se pudo emparejar).
async function buscarPlanPorId(id) {
  if (!id) return null;
  const r = await pool.query(
    `SELECT id_plan, nombre, dias_limite_fraccion FROM plan_membresia WHERE id_plan=$1 AND activo=true`,
    [id]
  );
  return r.rows[0] || null;
}

// Busca id_usuario por alias o nombre
async function buscarAsesor(nombre) {
  if (!nombre) return null;
  const n = `%${nombre.toLowerCase()}%`;
  const r = await pool.query(
    `SELECT id_usuario, nombre, apellido FROM usuarios
     WHERE LOWER(COALESCE(alias_asesor, nombre)) LIKE LOWER($1) AND estado = 1
     ORDER BY id_usuario LIMIT 1`,
    [n]
  );
  return r.rows[0] || null;
}

// Busca un usuario activo por id (usado cuando quien importa asigna manualmente
// un asesor existente a filas sin asesor o con un alias no encontrado).
async function buscarUsuarioPorId(id) {
  if (!id) return null;
  const r = await pool.query(
    `SELECT id_usuario, nombre, apellido FROM usuarios WHERE id_usuario=$1 AND estado = 1`,
    [id]
  );
  return r.rows[0] || null;
}

// ── POST /api/importar/socios ──────────────────────────────────────────────────
export const importarSocios = async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'No se recibió ningún archivo' });

  const modo  = req.body.modo  || 'preview';   // 'preview' | 'importar'
  const hojasSelStr = req.body.hojas || null;   // JSON string de array de nombres
  let hojasSeleccionadas = null;
  try {
    if (hojasSelStr) hojasSeleccionadas = JSON.parse(hojasSelStr);
  } catch(_) {}

  // Overrides de fecha_inicio por fila (clave "hoja|fila" → "YYYY-MM-DD"), elegidos
  // en la previsualización cuando quien importa no quiere usar la fecha del Excel
  // como base del plazo de pago. Nunca puede ser posterior a hoy.
  const overridesStr = req.body.overrides || null;
  let overridesFechaInicio = {};
  try {
    if (overridesStr) overridesFechaInicio = JSON.parse(overridesStr);
  } catch(_) {}

  // Overrides de plan por fila (clave "hoja|fila" → id_plan), elegidos en la
  // previsualización cuando el nombre de plan del Excel no coincide con ninguno
  // registrado.
  const overridesPlanStr = req.body.overridesPlan || null;
  let overridesPlan = {};
  try {
    if (overridesPlanStr) overridesPlan = JSON.parse(overridesPlanStr);
  } catch(_) {}

  // Overrides de asesor por fila (clave "hoja|fila" → id_usuario), elegidos en
  // la previsualización: tanto para filas sin asesor en el Excel como para
  // alias que no coincidieron con ningún asesor registrado.
  const overridesAsesorStr = req.body.overridesAsesor || null;
  let overridesAsesor = {};
  try {
    if (overridesAsesorStr) overridesAsesor = JSON.parse(overridesAsesorStr);
  } catch(_) {}

  const hoy = new Date().toISOString().split('T')[0];

  try {
    const wb = XLSX.read(req.file.buffer, { type: 'buffer', cellDates: false });

    // Si solo piden la lista de hojas
    if (modo === 'listar') {
      return res.json({ hojas: wb.SheetNames });
    }

    const hojasAProcesar = hojasSeleccionadas
      ? wb.SheetNames.filter(n => hojasSeleccionadas.includes(n))
      : wb.SheetNames;

    if (!hojasAProcesar.length) {
      return res.status(400).json({ message: 'No se encontraron hojas para procesar' });
    }

    // ── Fase 1: Parseo + validación (todas las hojas)
    const todasFilas = [];

    for (const nombreHoja of hojasAProcesar) {
      const sheet = wb.Sheets[nombreHoja];
      if (!sheet || !sheet['!ref']) continue;
      const { headerRow, headers } = detectarHeaders(sheet);
      if (headerRow === -1 || headers.length < 3) continue;

      const anio = inferirAnio(nombreHoja);
      const rawRows = leerFilas(sheet, headerRow);

      for (let i = 0; i < rawRows.length; i++) {
        const row = rawRows[i];
        // Saltar filas completamente vacías
        const vals = Object.values(row).filter(v => v !== null && v !== '');
        if (!vals.length) continue;

        const filaNum = headerRow + 2 + i; // número de fila en Excel (1-based)
        const f = parsearFila(row, headers, anio, filaNum);
        f._hoja = nombreHoja;
        f._fila = filaNum;

        // Aplicar override de fecha_inicio elegido en la previsualización (si hay uno
        // válido para esta fila). Nunca se acepta una fecha posterior a hoy.
        const overrideKey = `${nombreHoja}|${filaNum}`;
        const override = overridesFechaInicio[overrideKey];
        if (override && /^\d{4}-\d{2}-\d{2}$/.test(override) && override <= hoy) {
          f.fechaInicio = override;
        }

        // Buscar planes y asesores si no hay errores bloqueantes
        if (!f.errores.length) {
          const planOverrideId = overridesPlan[overrideKey];
          const plan = planOverrideId
            ? await buscarPlanPorId(planOverrideId)
            : await buscarPlan(f.planNombre);
          if (plan) {
            f.id_plan = plan.id_plan;
            f.planNombreReal = plan.nombre;
            f.planDiasLimite = plan.dias_limite_fraccion;
          } else if (f.planNombre) f.advertencias.push(`Plan "${f.planNombre}" no encontrado`);

          const asesorOverrideId = overridesAsesor[overrideKey];
          const asesor = asesorOverrideId
            ? await buscarUsuarioPorId(asesorOverrideId)
            : await buscarAsesor(f.asesorNombre);
          if (asesor) { f.id_asesor = asesor.id_usuario; }
          else if (f.asesorNombre) { f._asesorFaltante = f.asesorNombre; }

          // Plazo de pago de la cuota pendiente: cuenta desde fecha_inicio (o el
          // override elegido), nunca desde "hoy" ni desde la fecha de término.
          if (f.saldo > 0 && f.fechaInicio && f.planDiasLimite) {
            f.plazoPago = calcularPlazoPago(f.fechaInicio, f.planDiasLimite, hoy);
            f.advertencias.push(
              f.plazoPago.vencido
                ? `Plazo de pago vencido hace ${Math.abs(f.plazoPago.dias_restantes)} día(s) (venció el ${formatFechaCorta(f.plazoPago.fecha_limite)})`
                : `Plazo de pago: quedan ${f.plazoPago.dias_restantes} día(s) (vence el ${formatFechaCorta(f.plazoPago.fecha_limite)})`
            );
          }
        }

        todasFilas.push(f);
      }
    }

    if (modo === 'preview') {
      // Colectar asesores faltantes únicos con conteo de filas afectadas
      const asesorMap = {};
      todasFilas.forEach(f => {
        if (f._asesorFaltante) {
          const k = f._asesorFaltante.toUpperCase();
          if (!asesorMap[k]) asesorMap[k] = { alias: f._asesorFaltante, filas: 0 };
          asesorMap[k].filas++;
        }
      });
      const asesores_faltantes = Object.values(asesorMap);

      const resumen = {
        total: todasFilas.length,
        ok:    todasFilas.filter(f => !f.errores.length).length,
        advertencias: todasFilas.filter(f => !f.errores.length && (f.advertencias.length || f._asesorFaltante)).length,
        errores: todasFilas.filter(f => f.errores.length > 0).length,
      };
      return res.json({ resumen, filas: todasFilas, asesores_faltantes });
    }

    // ── Fase 2: Importación real
    const client = await pool.connect();
    const resultado = { nuevos_clientes: 0, clientes_existentes: 0, membresias_creadas: 0, pagos_creados: 0, dni_temporales: 0, errores: [], total: 0 };

    try {
      await client.query('BEGIN');

      for (let idx = 0; idx < todasFilas.length; idx++) {
        const f = todasFilas[idx];
        resultado.total++;
        if (f.errores.length) {
          resultado.errores.push({ fila: f._fila, hoja: f._hoja, nombre: f.nombreCompleto, motivo: f.errores.join(', ') });
          continue;
        }

        const sp = `sp_fila_${idx}`;
        await client.query(`SAVEPOINT ${sp}`);
        try {
          // Crear o encontrar cliente
          let id_cliente;
          const existeCliente = await client.query(
            `SELECT id_cliente FROM cliente WHERE dni=$1 AND tipo_documento=$2 AND deleted_at IS NULL`,
            [f.dni, f.tipoDocumento]
          );

          if (existeCliente.rows.length > 0) {
            id_cliente = existeCliente.rows[0].id_cliente;
            resultado.clientes_existentes++;
          } else {
            // fecha_registro: usar la del Excel; si no hay, usar fecha_inicio; si tampoco, hoy
            const fechaRegistro = f.fechaReg || f.fechaInicio || hoy;
            const nuevoCliente = await client.query(
              `INSERT INTO cliente (dni, tipo_documento, nombre, apellido, celular, fecha_registro, id_usuario_reg, activo, qr_code)
               VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8)
               RETURNING id_cliente`,
              [
                f.dni,
                f.tipoDocumento,
                f.nombre || f.nombreCompleto,
                f.apellido || '',
                f.celular || null,
                fechaRegistro,
                req.usuario.id,
                uuidv4(),
              ]
            );
            id_cliente = nuevoCliente.rows[0].id_cliente;
            resultado.nuevos_clientes++;
            if (f.dniEsTemporal) resultado.dni_temporales++;
          }

          // Si no hay plan conocido, registrar el cliente sin membresía
          if (!f.id_plan) {
            await client.query(`RELEASE SAVEPOINT ${sp}`);
            resultado.errores.push({
              fila: f._fila, hoja: f._hoja, nombre: f.nombreCompleto,
              motivo: `Plan "${f.planNombre || '(vacío)'}" no encontrado — cliente creado sin membresía. Asignar plan manualmente.`,
            });
            continue;
          }

          // Calcular estado de la membresía
          let estado = 'activa';
          if (f.fechaFin && f.fechaFin < hoy) estado = 'vencida';
          if (f.fechaInicio && f.fechaInicio > hoy) estado = 'programada';

          const idAsesor = f.id_asesor || req.usuario.id;

          // Evitar duplicar membresía con mismo cliente + plan + fecha_inicio
          const membExiste = await client.query(
            `SELECT id_membresia FROM membresia
             WHERE id_cliente=$1 AND id_plan=$2 AND fecha_inicio IS NOT DISTINCT FROM $3`,
            [id_cliente, f.id_plan, f.fechaInicio || null]
          );
          if (membExiste.rows.length > 0) {
            await client.query(`RELEASE SAVEPOINT ${sp}`);
            continue; // ya existe, no contar como error ni como nueva
          }

          // Crear membresía
          const membResult = await client.query(
            `INSERT INTO membresia
               (id_cliente, id_plan, id_usuario_reg, fecha_inicio, fecha_fin,
                tipo_ingreso, estado, monto_total, saldo_pendiente, observaciones)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
             RETURNING id_membresia`,
            [
              id_cliente,
              f.id_plan || null,
              idAsesor,
              f.fechaInicio || null,
              f.fechaFin    || null,
              f.tipoIngreso,
              estado,
              f.monto  || 0,
              f.saldo  || 0,
              f.observaciones,
            ]
          );
          const id_membresia = membResult.rows[0].id_membresia;
          resultado.membresias_creadas++;

          // Crear pago si hay fecha de pago y monto > 0
          if (f.fechaPago && f.monto) {
            const montoPagado = f.monto - (f.saldo || 0);
            if (montoPagado > 0) {
              await client.query(
                `INSERT INTO pago (id_membresia, num_cuota, monto, fecha_programada, fecha_pago, estado_cuota, id_usuario_reg)
                 VALUES ($1, 1, $2, $3, $3, 'pagado', $4)`,
                [id_membresia, montoPagado, f.fechaPago, req.usuario.id]
              );
              resultado.pagos_creados++;
            }
            if (f.saldo > 0) {
              // El plazo de pago cuenta desde fecha_inicio (o el override elegido en
              // la previsualización), nunca desde "hoy" ni desde la fecha de término.
              await client.query(
                `INSERT INTO pago (id_membresia, num_cuota, monto, fecha_programada, fecha_limite, estado_cuota, id_usuario_reg)
                 VALUES ($1, 2, $2, $3, $4, 'pendiente', $5)`,
                [id_membresia, f.saldo, f.fechaFin || hoy, f.plazoPago?.fecha_limite || null, req.usuario.id]
              );
            }
          }

          await client.query(`RELEASE SAVEPOINT ${sp}`);

        } catch (rowErr) {
          await client.query(`ROLLBACK TO SAVEPOINT ${sp}`);
          resultado.errores.push({ fila: f._fila, hoja: f._hoja, nombre: f.nombreCompleto, motivo: rowErr.message });
        }
      }

      await client.query('COMMIT');

      registrarAuditoria({
        id_usuario: req.usuario.id,
        nombre_usuario: `${req.usuario.nombre} ${req.usuario.apellido || ''}`.trim(),
        accion: 'CREAR',
        modulo: 'importar-socios',
        descripcion: `Importación Excel: ${resultado.membresias_creadas} membresías creadas, ${resultado.errores.length} errores`,
        ip: getIP(req),
        datos_nuevos: { hojas: hojasAProcesar, ...resultado },
      });

      return res.json({ resumen: resultado });

    } catch (txErr) {
      await client.query('ROLLBACK');
      throw txErr;
    } finally {
      client.release();
    }

  } catch (err) {
    console.error('[importarSocios]', err.message);
    return res.status(500).json({ message: 'Error al procesar el archivo: ' + err.message });
  }
};

// ── GET /api/importar/historial ───────────────────────────────────────────────
export const getHistorial = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        a.id,
        a.created_at,
        a.nombre_usuario,
        a.descripcion,
        a.datos_nuevos
      FROM auditoria a
      WHERE a.modulo = 'importar-socios' AND a.accion = 'CREAR'
        AND a.datos_nuevos->>'membresias_creadas' IS NOT NULL
      ORDER BY a.created_at DESC
      LIMIT 50
    `);
    res.json(result.rows);
  } catch (err) {
    console.error('[getHistorial]', err.message);
    res.status(500).json({ message: 'Error al obtener historial' });
  }
};

// ── GET /api/importar/pendientes ──────────────────────────────────────────────
export const getPendientes = async (req, res) => {
  try {
    const [tmpRes, sinMembRes] = await Promise.all([
      // Clientes con DNI temporal
      pool.query(`
        SELECT
          c.id_cliente, c.nombre, c.apellido, c.dni, c.celular,
          c.fecha_registro, c.created_at,
          'dni_temporal' AS tipo_pendiente,
          NULL AS plan_nombre
        FROM cliente c
        WHERE c.tipo_documento = 'TMP' AND c.deleted_at IS NULL
        ORDER BY c.created_at DESC
      `),
      // Clientes sin ninguna membresía
      pool.query(`
        SELECT
          c.id_cliente, c.nombre, c.apellido, c.dni, c.celular,
          c.fecha_registro, c.created_at,
          'sin_membresia' AS tipo_pendiente,
          NULL AS plan_nombre
        FROM cliente c
        WHERE c.deleted_at IS NULL
          AND NOT EXISTS (SELECT 1 FROM membresia m WHERE m.id_cliente = c.id_cliente)
        ORDER BY c.created_at DESC
      `),
    ]);

    res.json({
      dni_temporales: tmpRes.rows,
      sin_membresia:  sinMembRes.rows,
    });
  } catch (err) {
    console.error('[getPendientes]', err.message);
    res.status(500).json({ message: 'Error al obtener pendientes' });
  }
};

// ── POST /api/importar/crear-asesor ───────────────────────────────────────────
// Crea un usuario recepcionista durante el flujo de importación.
// Body: { nombre, apellido, alias, username, password }
export const crearAsesor = async (req, res) => {
  const { nombre, apellido = '', alias, username, password = 'volcano123' } = req.body;

  if (!nombre || !username) {
    return res.status(400).json({ message: 'Nombre y username son requeridos' });
  }

  try {
    const existe = await pool.query(
      `SELECT id_usuario FROM usuarios WHERE LOWER(username) = LOWER($1)`,
      [username.trim()]
    );
    if (existe.rows.length > 0) {
      return res.status(409).json({ message: `El username "${username}" ya existe` });
    }

    const hash = await bcrypt.hash(password, 10);
    const email = `${username.trim().toLowerCase()}@volcanogym.pe`;

    const result = await pool.query(
      `INSERT INTO usuarios (id_perfil, nombre, apellido, username, email, password_hash, alias_asesor, estado, creado_por)
       VALUES (2, $1, $2, $3, $4, $5, $6, 1, $7)
       RETURNING id_usuario, nombre, apellido, username, alias_asesor`,
      [nombre.trim(), apellido.trim(), username.trim().toLowerCase(), email, hash, alias || nombre.trim(), req.usuario.id]
    );

    registrarAuditoria({
      id_usuario: req.usuario.id,
      nombre_usuario: `${req.usuario.nombre} ${req.usuario.apellido || ''}`.trim(),
      accion: 'CREAR',
      modulo: 'importar-socios',
      descripcion: `Asesor creado durante importación: ${nombre} (${alias || username})`,
      ip: getIP(req),
      datos_nuevos: result.rows[0],
    });

    return res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('[crearAsesor]', err.message);
    return res.status(500).json({ message: 'Error al crear el asesor: ' + err.message });
  }
};
