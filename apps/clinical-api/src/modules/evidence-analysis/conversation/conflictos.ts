/**
 * Conflictos y correcciones de los hechos del chat (L1D-319, US-262, RN-08, ADR-50): reglas puras, sin E/S.
 * Backend 1 calcula los pares con `conflicts_with_id`; Backend 2 solo recibe el `factRef` opaco de la contraparte.
 */

/** Sufijo fijo con que la verbalización de un dato corregido lo dice (el NLI usa el mismo texto). */
export const MARCA_DE_CORRECCION = '(corregido)';

export function conMarcaDeCorreccion(verbalizacion: string): string {
  return `${verbalizacion} ${MARCA_DE_CORRECCION}`;
}

export interface DatoParaConflicto {
  factRef: string;
  id: string;
  conflictsWithId: string | null;
}

/**
 * `factRef` → `factRef` de su contraparte, simétrico: ambos hechos de un par llevan el del otro. Un vínculo cuya
 * contraparte no es un hecho del turno no forma par (no habría dos valores que mostrar).
 */
export function contrapartesDeConflicto(
  datos: readonly DatoParaConflicto[],
): ReadonlyMap<string, string> {
  const porId = new Map(datos.map((dato) => [dato.id, dato.factRef]));
  const pares = new Map<string, string>();
  for (const dato of datos) {
    const otro = dato.conflictsWithId === null ? undefined : porId.get(dato.conflictsWithId);
    if (otro === undefined) continue;
    pares.set(dato.factRef, otro);
    pares.set(otro, dato.factRef);
  }
  return pares;
}
