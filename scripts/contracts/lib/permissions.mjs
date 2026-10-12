/** Lectura de la matriz de permisos de `docs/architecture/data-model.md`. */
import { cellText, sectionOf, tableRows } from './markdown.mjs';

const MATRIX_HEADING = /^##\s+\d+\.\s+Matriz de permisos/;

/**
 * Filas de la matriz: un código concreto por acción y sí/no por rol.
 * @param {string | undefined} dataModelText
 * @returns {{ code: string, doctor: string, admin: string }[]}
 */
export function permissionMatrix(dataModelText) {
  const section = sectionOf(dataModelText ?? '', MATRIX_HEADING);
  if (!section) return [];
  return tableRows(section)
    .slice(1)
    .map((cells) => ({ code: cellText(cells[0] ?? ''), doctor: cellText(cells[1] ?? ''), admin: cellText(cells[2] ?? '') }));
}
