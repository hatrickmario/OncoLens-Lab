import type { Client } from 'pg';

/** Consultas al catálogo de PostgreSQL (information_schema / pg_catalog) que reutilizan los tests del esquema. */

export const SCHEMAS_CLINICOS = ['auth', 'identity', 'clinical', 'audit', 'research'] as const;

export interface ColumnaDelCatalogo {
  nombre: string;
  tipo: string;
  tipoUdt: string;
  anulable: boolean;
  porDefecto: string | null;
}

/** `schema.tabla` de todas las tablas base de los cinco schemas clínicos, ordenadas. */
export async function tablasDelCatalogo(cliente: Client): Promise<string[]> {
  const { rows } = await cliente.query<{ nombre: string }>(
    `SELECT table_schema || '.' || table_name AS nombre
       FROM information_schema.tables
      WHERE table_type = 'BASE TABLE' AND table_schema = ANY($1)
      ORDER BY 1`,
    [[...SCHEMAS_CLINICOS]],
  );
  return rows.map((fila) => fila.nombre);
}

/** Tablas esperadas que no están en el catálogo (para nombrar la ausente en el fallo). */
export function tablasAusentes(esperadas: readonly string[], reales: readonly string[]): string[] {
  return esperadas.filter((tabla) => !reales.includes(tabla));
}

export async function columnasDe(cliente: Client, schema: string, tabla: string): Promise<ColumnaDelCatalogo[]> {
  const { rows } = await cliente.query<{
    nombre: string;
    tipo: string;
    tipo_udt: string;
    anulable: string;
    por_defecto: string | null;
  }>(
    `SELECT column_name AS nombre, data_type AS tipo, udt_name AS tipo_udt, is_nullable AS anulable,
            column_default AS por_defecto
       FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2
      ORDER BY ordinal_position`,
    [schema, tabla],
  );
  return rows.map((fila) => ({
    nombre: fila.nombre,
    tipo: fila.tipo,
    tipoUdt: fila.tipo_udt,
    anulable: fila.anulable === 'YES',
    porDefecto: fila.por_defecto,
  }));
}

export async function valoresDeEnum(cliente: Client, nombre: string): Promise<string[]> {
  const { rows } = await cliente.query<{ valor: string }>(
    `SELECT e.enumlabel AS valor
       FROM pg_enum e JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = $1
      ORDER BY e.enumsortorder`,
    [nombre],
  );
  return rows.map((fila) => fila.valor);
}
