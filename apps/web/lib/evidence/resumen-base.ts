import type { AnalysisBasis } from '../../../../packages/api-contracts/src/types/clinical-api';
import { mensajes, rellenar } from '../mensajes';
import { formatearFechaIso } from './formatear-fecha';
import type { EstadoDelAnalisis } from './estado-del-analisis';

export interface ResumenDeBase {
  /** `null` cuando el checklist no se calculó (`tipo_no_habilitado`): nunca se muestra como 0. */
  faltantes: number | null;
  continuoConAviso: boolean;
  supuestos: number;
  /** Nombres separados por coma, o "ninguna"; solo se nombra la exclusión, nunca su contenido (RN-21). */
  fuentesNoIncluidas: string;
  omitidas: number;
}

export function resumirBase(base: AnalysisBasis, estado: EstadoDelAnalisis): ResumenDeBase {
  const { ninguna } = mensajes().evidence.base;
  return {
    faltantes: estado === 'tipo_no_habilitado' ? null : base.missingCriticalData.length,
    continuoConAviso: base.continuedWithWarning,
    supuestos: base.assumptions.length,
    fuentesNoIncluidas: base.sourcesNotIncluded.join(', ') || ninguna,
    omitidas: base.omittedClaims,
  };
}

/** Primer segmento del resumen: singular con 1, plural con 0 o varios, y "continuó con aviso" solo si así fue (RN-26). */
export function textoDeFaltantes({ faltantes, continuoConAviso }: ResumenDeBase): string {
  const textos = mensajes().evidence.base;
  if (faltantes === null) return textos.faltantesNoEvaluados;
  const cuenta =
    faltantes === 1 ? textos.faltantesUno : rellenar(textos.faltantesVarios, { n: faltantes });
  return continuoConAviso ? `${cuenta} · ${textos.continuoConAviso}` : cuenta;
}

/** Fecha de corte del corpus en la Base del análisis: el mismo formato que el resto de fechas del panel. */
export function formatearFechaDeCorte(fechaIso: string): string {
  return formatearFechaIso(fechaIso);
}
