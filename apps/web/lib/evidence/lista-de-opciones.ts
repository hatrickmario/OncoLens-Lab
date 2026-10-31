import type { AnalysisBasis } from '../../../../packages/api-contracts/src/types/clinical-api';

/** Texto de las opciones con soporte que el límite no muestra (FR-09); `null` si no hay ninguna. */
export function textoOpcionesNoMostradas(
  _basis: Pick<AnalysisBasis, 'optionsNotShown' | 'maxOptions'>,
): string | null {
  throw new Error('no implementado');
}

/** Rótulo de posición de una tarjeta en la lista (RN-23): posición, nunca jerarquía. */
export function etiquetaDePosicion(_n: number, _total: number): string {
  throw new Error('no implementado');
}
