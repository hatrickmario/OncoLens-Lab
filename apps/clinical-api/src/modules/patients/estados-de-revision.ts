/** Estado de revisión de un dato clínico extraído (`clinical.review_status`). */
export type EstadoDeRevision =
  'auto_aceptado' | 'requiere_revision' | 'verificado' | 'corregido' | 'rechazado' | 'reemplazado';

/** Estados que cuentan como «pendiente de revisión»; `auto_aceptado` NO (decidido en P-4, RN-26). */
export const ESTADOS_PENDIENTES_DE_REVISION: readonly EstadoDeRevision[] = ['requiere_revision'];
