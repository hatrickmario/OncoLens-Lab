import type { AnalysisBasis } from '../../../../../packages/api-contracts/src/types/clinical-api';
import { mensajes, rellenar } from '../../mensajes';

/** Línea «Base de esta respuesta» (S5-04): el turno no trae Base propia, se usa la del análisis de origen. */
export function baseDeLaRespuesta(base: AnalysisBasis): string {
  const { baseDeLaRespuesta: plantilla, ninguno } = mensajes().followUp;
  const usados = base.patientDataUsed.map(({ label }) => label).join(', ');
  const ausentes = base.missingCriticalDataLabels.join(', ');
  return rellenar(plantilla, { usados: usados || ninguno, ausentes: ausentes || ninguno });
}
