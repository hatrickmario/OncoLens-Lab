import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Matriz de `docs/architecture/data-model.md` §8 leída del documento (fuente única): los tests no repiten la lista de
 * permisos. Cada fila de la tabla es `| \`código\` | sí/no (doctor) | sí/no (admin) | operaciones |`.
 */
const DATA_MODEL = resolve(
  fileURLToPath(new URL('../../../../docs/architecture/data-model.md', import.meta.url)),
);
const FILA = /^\|\s*`([a-z_]+:[a-z_]+)`\s*\|\s*(sí|no)\s*\|\s*(sí|no)\s*\|/;

export interface FilaDeMatriz {
  readonly codigo: string;
  readonly doctor: boolean;
  readonly admin: boolean;
}

export function leerMatrizDeLaDocumentacion(): FilaDeMatriz[] {
  const filas = readFileSync(DATA_MODEL, 'utf8')
    .split('\n')
    .map((linea) => FILA.exec(linea))
    .filter((coincidencia) => coincidencia !== null)
    .map((c) => ({ codigo: c[1] ?? '', doctor: c[2] === 'sí', admin: c[3] === 'sí' }));
  if (filas.length === 0)
    throw new Error('no se encontró la matriz de permisos en data-model.md §8');
  return filas;
}

/** Códigos que el `admin` NO tiene según la documentación (mínimo privilegio, E-04). */
export function permisosVedadosAlAdmin(): string[] {
  return leerMatrizDeLaDocumentacion()
    .filter((fila) => !fila.admin)
    .map((fila) => fila.codigo);
}
