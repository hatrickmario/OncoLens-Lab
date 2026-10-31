import type { AnalysisBasis } from '../../../../packages/api-contracts/src/types/clinical-api';
import { mensajes, rellenar } from '../mensajes';

type BaseConExcedente = Pick<AnalysisBasis, 'optionsNotShown' | 'maxOptions'>;

/** Límite que muestra la UI cuando un análisis no declara `maxOptions` (FR-09). */
const LIMITE_POR_DEFECTO = 3;

function contarNoMostradas({ optionsNotShown }: BaseConExcedente): number | null {
  return Number.isInteger(optionsNotShown) && optionsNotShown! > 0 ? optionsNotShown! : null;
}

/** Texto de las opciones con soporte que el límite no muestra (FR-09); `null` si no hay ninguna. */
export function textoOpcionesNoMostradas(basis: BaseConExcedente): string | null {
  const n = contarNoMostradas(basis);
  if (n === null) return null;
  const limite = basis.maxOptions ?? LIMITE_POR_DEFECTO;
  return rellenar(mensajes().evidence.resultado.noMostradas, { n, limite });
}

/** Frase que se añade al anuncio «Análisis listo» (NFR-12); `null` si no hay opciones no mostradas. */
export function anuncioOpcionesNoMostradas(basis: BaseConExcedente): string | null {
  const n = contarNoMostradas(basis);
  return n === null ? null : rellenar(mensajes().evidence.estado.noMostradas, { n });
}

/** Rótulo de posición de una tarjeta en la lista (RN-23): posición, nunca jerarquía. */
export function etiquetaDePosicion(n: number, total: number): string {
  return rellenar(mensajes().evidence.resultado.posicion, { n, total });
}
