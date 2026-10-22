import type { EvidenceAnalysis } from '../../../../packages/api-contracts/src/types/clinical-api';

export type ClaseDeResultado =
  | 'con_opciones'
  | 'solo_descartadas'
  | 'sin_opciones'
  | 'sin_evidencia'
  | 'tipo_no_habilitado'
  | 'no_soportado';

/** Decide qué estado del resultado se dibuja (design D2; AC-4, AC-5 de US-061, RN-02). */
export function clasificarResultado(
  analisis: Pick<EvidenceAnalysis, 'status' | 'evidenceOptions' | 'discardedOptions'>,
): ClaseDeResultado {
  if (analisis.status === 'sin_evidencia') return 'sin_evidencia';
  if (analisis.status === 'tipo_no_habilitado') return 'tipo_no_habilitado';
  if (analisis.status !== 'con_evidencia') return 'no_soportado';
  if (analisis.evidenceOptions.length > 0) return 'con_opciones';
  return analisis.discardedOptions.length > 0 ? 'solo_descartadas' : 'sin_opciones';
}
