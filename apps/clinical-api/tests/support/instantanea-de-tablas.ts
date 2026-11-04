import type { Client } from 'pg';
import { tablasDelCatalogo } from './catalogo.js';

/**
 * Instantánea de tablas para los tests de «no escribe» (US-070, AC-T3.2): por cada tabla de los schemas pedidos, el
 * número de filas y un *hash* del contenido ordenado por clave primaria. El *hash* ve un `UPDATE` (p. ej. un
 * `review_status` cambiado) que el conteo no ve. La lista sale del catálogo: una tabla nueva entra sola. El contenido
 * de las filas (identidad cifrada incluida) se resume en la base y nunca viaja al test ni a los logs.
 */

export interface InstantaneaDeTabla {
  readonly filas: number;
  readonly hash: string;
}

/** `schema.tabla` → conteo y *hash*. */
export type InstantaneaDeTablas = Readonly<Record<string, InstantaneaDeTabla>>;

export interface OpcionesDeInstantanea {
  readonly schemas: readonly string[];
}

const entreComillas = (identificador: string): string => `"${identificador.replaceAll('"', '""')}"`;

async function columnasDeClavePrimaria(cliente: Client, schema: string, tabla: string) {
  const { rows } = await cliente.query<{ columna: string }>(
    `SELECT a.attname AS columna
       FROM pg_index i
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY (i.indkey)
      WHERE i.indisprimary AND i.indrelid = format('%I.%I', $1::text, $2::text)::regclass
      ORDER BY array_position(i.indkey::int2[], a.attnum)`,
    [schema, tabla],
  );
  return rows.map((fila) => entreComillas(fila.columna));
}

async function instantaneaDeUnaTabla(
  cliente: Client,
  schema: string,
  tabla: string,
): Promise<InstantaneaDeTabla> {
  const claves = await columnasDeClavePrimaria(cliente, schema, tabla);
  // Sin clave primaria el orden sería indeterminado: el texto de la fila ordena a la propia fila.
  const orden = claves.length > 0 ? claves.join(', ') : 't::text';
  const { rows } = await cliente.query<{ filas: number; hash: string }>(
    `SELECT count(*)::int AS filas,
            md5(coalesce(string_agg(t::text, '|' ORDER BY ${orden}), '')) AS hash
       FROM ${entreComillas(schema)}.${entreComillas(tabla)} t`,
  );
  return rows[0] ?? { filas: 0, hash: '' };
}

export async function instantaneaDeTablas(
  cliente: Client,
  { schemas }: OpcionesDeInstantanea,
): Promise<InstantaneaDeTablas> {
  const instantanea: Record<string, InstantaneaDeTabla> = {};
  for (const nombre of await tablasDelCatalogo(cliente)) {
    const [schema, tabla] = nombre.split('.') as [string, string];
    if (!schemas.includes(schema)) continue;
    instantanea[nombre] = await instantaneaDeUnaTabla(cliente, schema, tabla);
  }
  return instantanea;
}

/** `schema.tabla` cuyo conteo o contenido difiere entre las dos instantáneas (ordenadas). */
export function tablasConDiferencia(
  antes: InstantaneaDeTablas,
  despues: InstantaneaDeTablas,
): string[] {
  const nombres = new Set([...Object.keys(antes), ...Object.keys(despues)]);
  return [...nombres]
    .filter((nombre) => {
      const previa = antes[nombre];
      const actual = despues[nombre];
      return previa?.filas !== actual?.filas || previa?.hash !== actual?.hash;
    })
    .sort();
}
