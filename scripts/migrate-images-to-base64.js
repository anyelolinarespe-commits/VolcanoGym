// Migra imágenes guardadas como rutas de archivo (/uploads/...) a Base64 en la BD.
// Uso: node scripts/migrate-images-to-base64.js
//      node scripts/migrate-images-to-base64.js --dry-run   (solo muestra qué haría)

import fs   from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../src/config/bd.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'src', 'public');
const DRY_RUN    = process.argv.includes('--dry-run');

const MIME = {
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png':  'image/png',
  '.webp': 'image/webp',
  '.gif':  'image/gif',
};

function urlToDataUri(urlPath) {
  const filePath = path.join(PUBLIC_DIR, urlPath);
  if (!fs.existsSync(filePath)) return null;
  const ext  = path.extname(filePath).toLowerCase();
  const mime = MIME[ext] || 'image/jpeg';
  const b64  = fs.readFileSync(filePath).toString('base64');
  return `data:${mime};base64,${b64}`;
}

async function migrateTable({ label, query, updateFn }) {
  const { rows } = await pool.query(query);
  console.log(`\n── ${label}: ${rows.length} registro(s) a migrar`);

  let ok = 0, skip = 0, fail = 0;

  for (const row of rows) {
    const urlPath = row.url_foto || row.foto_perfil || row.url_comprobante;
    const dataUri = urlToDataUri(urlPath);

    if (!dataUri) {
      console.log(`  SKIP  archivo no encontrado: ${urlPath}`);
      skip++;
      continue;
    }

    if (DRY_RUN) {
      console.log(`  DRY   ${urlPath}  →  data:... (${Math.round(dataUri.length / 1024)} KB)`);
      ok++;
      continue;
    }

    try {
      await updateFn(row, dataUri);
      console.log(`  OK    ${urlPath}  →  ${Math.round(dataUri.length / 1024)} KB en BD`);
      ok++;
    } catch (err) {
      console.error(`  FAIL  ${urlPath}  →  ${err.message}`);
      fail++;
    }
  }

  return { ok, skip, fail };
}

async function main() {
  if (DRY_RUN) console.log('\n[DRY-RUN] No se escribirá nada en la BD.\n');

  const totales = { ok: 0, skip: 0, fail: 0 };

  const tablas = [
    {
      label: 'producto_foto',
      query: `SELECT id_foto, url_foto FROM producto_foto WHERE url_foto LIKE '/uploads/%'`,
      updateFn: async (row, uri) => pool.query(
        `UPDATE producto_foto SET url_foto = $1 WHERE id_foto = $2`,
        [uri, row.id_foto]
      ),
    },
    {
      label: 'cliente.foto_perfil',
      query: `SELECT id_cliente, foto_perfil FROM cliente WHERE foto_perfil LIKE '/uploads/%'`,
      updateFn: async (row, uri) => pool.query(
        `UPDATE cliente SET foto_perfil = $1 WHERE id_cliente = $2`,
        [uri, row.id_cliente]
      ),
    },
    {
      label: 'pago_detalle.url_comprobante',
      query: `SELECT id_detalle, url_comprobante FROM pago_detalle WHERE url_comprobante LIKE '/uploads/%'`,
      updateFn: async (row, uri) => pool.query(
        `UPDATE pago_detalle SET url_comprobante = $1 WHERE id_detalle = $2`,
        [uri, row.id_detalle]
      ),
    },
    {
      label: 'cuota_venta_detalle.url_comprobante',
      query: `SELECT id_detalle, url_comprobante FROM cuota_venta_detalle WHERE url_comprobante LIKE '/uploads/%'`,
      updateFn: async (row, uri) => pool.query(
        `UPDATE cuota_venta_detalle SET url_comprobante = $1 WHERE id_detalle = $2`,
        [uri, row.id_detalle]
      ),
    },
  ];

  for (const tabla of tablas) {
    const r = await migrateTable(tabla);
    totales.ok   += r.ok;
    totales.skip += r.skip;
    totales.fail += r.fail;
  }

  console.log('\n══════════════════════════════');
  console.log(`  Migrados : ${totales.ok}`);
  console.log(`  Saltados : ${totales.skip}  (archivo no encontrado en disco)`);
  console.log(`  Fallidos : ${totales.fail}`);
  if (DRY_RUN) console.log('\n  Nada fue escrito. Corre sin --dry-run para aplicar.');
  console.log('══════════════════════════════\n');

  await pool.end();
}

main().catch(err => {
  console.error('\nError inesperado:', err.message);
  process.exit(1);
});
