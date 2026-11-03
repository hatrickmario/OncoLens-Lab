/** Estado de revisión de un dato clínico extraído (`clinical.review_status`). */
export type EstadoDeRevision =
  'auto_aceptado' | 'requiere_revision' | 'verificado' | 'corregido' | 'rechazado' | 'reemplazado';

/** Estados que cuentan como «pendiente de revisión»; `auto_aceptado` NO (decidido en P-4, RN-26). */
export const ESTADOS_PENDIENTES_DE_REVISION: readonly EstadoDeRevision[] = ['requiere_revision'];

/** Estados de un dato que ya no vale: nunca se muestra ni cuenta ni es «el vigente» (RN-07). */
export const ESTADOS_DESCARTADOS: readonly EstadoDeRevision[] = ['rechazado', 'reemplazado'];

/** Un estado que sí puede mostrarse (`Provenance.reviewStatus` del contrato). */
export type EstadoDeRevisionVisible = Exclude<EstadoDeRevision, 'rechazado' | 'reemplazado'>;

/**
 * Predicado SQL ÚNICO de «sin fecha confiable» de un evento clínico: sin fecha o con precisión `incierta` (PRD AC-02.2).
 * Lo usa el contador de la ficha; el timeline aplica el equivalente en TS de este predicado (`comoEventoConOrden`) y el
 * contexto del análisis otro (`fechaConfiable`); unificarlos es D5-22.
 */
export function sqlFechaNoConfiable(fecha: string, precision: string): string {
  return `(${fecha} IS NULL OR ${precision} = 'incierta')`;
}

/**
 * Predicado SQL ÚNICO de «evento clínico propio»: sin `analysis_id`. Una fila con `analysis_id` es el reflejo de un
 * análisis previo (ADR-32), no un dato clínico: ni se muestra ni cuenta como pendiente.
 */
export function sqlEventoClinicoPropio(columna = 'analysis_id'): string {
  return `${columna} IS NULL`;
}

/**
 * Predicado SQL ÚNICO de RN-07 («el dato no fue rechazado ni reemplazado») sobre la columna indicada. Lo usan la ficha,
 * el tipo de cáncer del listado y el contador de pendientes, para que no diverjan.
 */
export function sqlDatoVigente(columna: string): string {
  const descartados = ESTADOS_DESCARTADOS.map((estado) => `'${estado}'`).join(', ');
  return `${columna} NOT IN (${descartados})`;
}
