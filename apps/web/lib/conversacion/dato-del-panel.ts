import type {
  CaseView,
  ConversationDataLink,
  Provenance,
} from '../../../../packages/api-contracts/src/types/clinical-api';
import { rotuloOValor } from '../caso/presentacion';
import { mensajes } from '../mensajes';

export interface DatoDelCaso {
  valor: string;
  procedencia: Provenance;
}

/**
 * Busca en la vista de caso el dato al que apunta un `ConversationDataLink`. Solo tratamientos previos, atributos y
 * eventos de la línea de tiempo llevan `id` en `CaseView`; para un biomarcador o un diagnóstico devuelve `null` y el
 * panel muestra lo que el turno dice de él, sin inventar un valor.
 */
export function datoDelCaso(vista: CaseView, enlace: ConversationDataLink): DatoDelCaso | null {
  const id = enlace.resourceId;
  if (enlace.resourceType === 'prior_treatment') {
    const fila = vista.priorTreatments.find((t) => t.id === id);
    return fila ? { valor: fila.regimenName, procedencia: fila.provenance } : null;
  }
  if (enlace.resourceType === 'clinical_attribute') {
    const fila = vista.attributes.find((a) => a.id === id);
    const valores = mensajes().caso.valoresDeAtributo;
    return fila ? { valor: rotuloOValor(valores, fila.value), procedencia: fila.provenance } : null;
  }
  if (enlace.resourceType === 'clinical_event') {
    const evento = vista.timeline.find((e) => e.id === id);
    return evento ? { valor: evento.description, procedencia: evento.provenance } : null;
  }
  return null;
}
