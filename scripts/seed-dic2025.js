import { pool } from '../src/config/bd.js';

const DNI = '73491995';

const fechas = [
  '2025-12-02 07:30:00',
  '2025-12-05 08:15:00',
  '2025-12-09 07:00:00',
  '2025-12-12 09:45:00',
  '2025-12-16 07:20:00',
  '2025-12-19 08:00:00',
  '2025-12-23 10:10:00',
  '2025-12-26 07:50:00',
];

const { rows: clientes } = await pool.query(
  'SELECT id_cliente FROM cliente WHERE dni = $1', [DNI]
);
if (!clientes.length) { console.error('Cliente no encontrado con DNI', DNI); process.exit(1); }
const id_cliente = clientes[0].id_cliente;

const { rows: membs } = await pool.query(
  'SELECT id_membresia FROM membresia WHERE id_cliente = $1 ORDER BY created_at DESC LIMIT 1', [id_cliente]
);
if (!membs.length) { console.error('Sin membresía para ese cliente'); process.exit(1); }
const id_membresia = membs[0].id_membresia;

const { rows: users } = await pool.query(
  'SELECT id_usuario FROM usuarios WHERE activo = TRUE LIMIT 1'
);
const id_usuario = users[0].id_usuario;

for (const fecha of fechas) {
  await pool.query(
    `INSERT INTO asistencia (id_cliente, id_membresia, id_usuario_reg, metodo_registro, membresia_valida, tiene_deuda, fecha_hora)
     VALUES ($1, $2, $3, 'manual', TRUE, FALSE, $4)`,
    [id_cliente, id_membresia, id_usuario, fecha]
  );
  console.log('✓', fecha);
}

console.log(`\nListo: ${fechas.length} asistencias de diciembre 2025 insertadas para cliente_id=${id_cliente}`);
await pool.end();
