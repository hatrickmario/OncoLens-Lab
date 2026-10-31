import type { ApplicabilityCriterion } from '../../../../packages/api-contracts/src/types/clinical-api';
import { mensajes } from '../mensajes';
import type { ValoresDelEstudio } from './valores-del-estudio';

/**
 * Texto que acompaña al estado de un criterio: el motivo de Parcial o la causa de Desconocido (H-11, H-14).
 * Un Desconocido siempre trae causa; `unknownReason = null` solo existe en análisis históricos (RN-06).
 */
export function motivoDelEstado(
  criterio: ApplicabilityCriterion,
  valores: ValoresDelEstudio,
): string | null {
  const { motivoParcial, causaDesconocido } = mensajes().evidence.aplicabilidad;
  if (criterio.status === 'parcial') {
    return criterio.partialReason ? motivoParcial[criterio.partialReason] : null;
  }
  if (criterio.status !== 'desconocido') return null;
  if (criterio.unknownReason === null) return causaDesconocido.sin_causa_registrada;
  const soloContexto = valores.elegibilidad.length === 0 && valores.contexto.length > 0;
  if (criterio.unknownReason === 'no_reportado_por_fuente' && soloContexto) {
    return causaDesconocido.solo_subgrupo;
  }
  return causaDesconocido[criterio.unknownReason];
}
