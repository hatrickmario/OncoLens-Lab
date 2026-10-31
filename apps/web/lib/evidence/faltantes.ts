import type {
  CompletenessItem,
  CompletenessView,
} from '../../../../packages/api-contracts/src/types/clinical-api';
import type { AnclaDeFicha } from '../ficha/anclas';

/** Resultado de leer el checklist: el panel nunca ve una excepción, solo estos tres casos. */
export type LecturaDelChecklist =
  | { tipo: 'ok'; cancerTypeEnabled: boolean; faltantes: CompletenessItem[] }
  | { tipo: 'no_disponible' }
  | { tipo: 'sin_sesion' };

/** Solo los ítems `faltante`: los `presente_sin_verificar` y `no_aplica` no son faltantes (D3). */
export function lecturaDeLaVista(vista: CompletenessView): LecturaDelChecklist {
  return {
    tipo: 'ok',
    cancerTypeEnabled: vista.cancerTypeEnabled,
    faltantes: vista.items.filter((item) => item.status === 'faltante'),
  };
}

const ANCLA_POR_ENTIDAD: Partial<Record<CompletenessItem['destination']['entity'], AnclaDeFicha>> =
  {
    Diagnosis: 'diagnostico',
    Biomarker: 'biomarcadores',
  };

/** Enlace a la sección existente de la ficha donde vive el dato; sin sección propia, al encabezado principal. */
export function enlaceDeRegistro(patientId: string, item: CompletenessItem): string {
  const ancla = ANCLA_POR_ENTIDAD[item.destination.entity];
  return ancla ? `/pacientes/${patientId}#${ancla}` : `/pacientes/${patientId}`;
}

/**
 * `continueWithWarning` de la solicitud: verdadero con ≥1 faltante o con el checklist caído; falso si no hubo (D1).
 * Coincide con los casos en que el panel muestra un aviso con resumen.
 */
export function debeContinuarConAviso(lectura: LecturaDelChecklist): boolean {
  if (lectura.tipo === 'no_disponible') return true;
  return lectura.tipo === 'ok' && lectura.faltantes.length > 0;
}
