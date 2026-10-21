import type { AnalysisBasis } from '../../../../packages/api-contracts/src/types/clinical-api';

export interface AnalysisBasisPanelProps {
  base: AnalysisBasis;
  /** Estado del análisis: decide si el resumen dice qué se buscó o que no se consultó el corpus. */
  estado: 'con_evidencia' | 'sin_evidencia' | 'tipo_no_habilitado';
}

/** Base del análisis (S2-09, US-067). Esqueleto: se implementa en el commit feat. */
export function AnalysisBasisPanel(_props: AnalysisBasisPanelProps) {
  return null;
}
