import type {
  ApplicabilityCriterion,
  StudyPopulationValue,
} from '../../../../packages/api-contracts/src/types/clinical-api';

/** Un valor del estudio con su fragmento; `chunkId` es `null` solo si la forma antigua no trae fragmento. */
export interface ValorDelEstudio {
  value: string;
  chunkId: string | null;
  scope: StudyPopulationValue['scope'];
}

export interface ValoresDelEstudio {
  /** Valores que cuentan para el estado. */
  elegibilidad: ValorDelEstudio[];
  /** Subgrupo o mención: contexto que no cuenta para el estado (DEC-11). */
  contexto: ValorDelEstudio[];
}

/**
 * Valores del estudio de un criterio: lee `studyPopulationValues[]` y, para análisis antiguos, cae a
 * `studyPopulationValue` (D4). Solo cuentan los fragmentos que cita la opción (RN-01, D8).
 */
export function valoresDelEstudio(
  criterio: ApplicabilityCriterion,
  fragmentosDeLaOpcion: readonly string[],
): ValoresDelEstudio {
  const valores: ValorDelEstudio[] = criterio.studyPopulationValues
    ? criterio.studyPopulationValues.filter((v) => fragmentosDeLaOpcion.includes(v.chunkId))
    : valorUnicoAntiguo(criterio);
  return {
    elegibilidad: valores.filter((v) => v.scope === 'elegibilidad'),
    contexto: valores.filter((v) => v.scope !== 'elegibilidad'),
  };
}

function valorUnicoAntiguo(criterio: ApplicabilityCriterion): ValorDelEstudio[] {
  if (criterio.studyPopulationValue === null) return [];
  return [
    {
      value: criterio.studyPopulationValue,
      chunkId: criterio.citedSources[0]?.chunkId ?? null,
      scope: 'elegibilidad',
    },
  ];
}
