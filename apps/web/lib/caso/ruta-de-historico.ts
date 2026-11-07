import type { DatoCorregible } from '../correcciones/cliente';

/**
 * Recursos con histórico de correcciones (ADR-50) y su tramo en la API del BFF. Un diagnóstico o un evento no tienen
 * ruta de histórico; un tipo desconocido tampoco (el panel no pide nada).
 */
const DATO_CON_HISTORICO: Readonly<Record<string, DatoCorregible>> = {
  biomarker: 'biomarkers',
  clinical_attribute: 'clinical-attributes',
  prior_treatment: 'prior-treatments',
  clinical_note: 'clinical-notes',
};

/** El dato corregible de un `resourceType` del chat, o `null` si ese recurso no tiene histórico. */
export function datoConHistorico(resourceType: string): DatoCorregible | null {
  return Object.hasOwn(DATO_CON_HISTORICO, resourceType) ? DATO_CON_HISTORICO[resourceType]! : null;
}

/**
 * Tramo del histórico bajo `/api/patients/{patientId}/` (p. ej. `biomarkers/{id}/history`), derivado del
 * `ConversationDataLink` porque el contrato no trae `historyPath`. `null` si el recurso no tiene histórico: el panel
 * no hace esa petición. El id es un UUID opaco y se codifica.
 */
export function rutaDeHistorico(resourceType: string, resourceId: string): string | null {
  const dato = datoConHistorico(resourceType);
  return dato === null ? null : `${dato}/${encodeURIComponent(resourceId)}/history`;
}
