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
 * Predicado SQL ÚNICO de RN-07 («el dato no fue rechazado ni reemplazado») sobre la columna indicada. Lo usan la ficha,
 * el tipo de cáncer del listado y el contador de pendientes, para que no diverjan.
 */
export function sqlDatoVigente(columna: string): string {
  const descartados = ESTADOS_DESCARTADOS.map((estado) => `'${estado}'`).join(', ');
  return `${columna} NOT IN (${descartados})`;
}
