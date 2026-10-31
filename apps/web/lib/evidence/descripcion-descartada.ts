import type { DiscardedOption } from '../../../../packages/api-contracts/src/types/clinical-api';
import { mostrarSiPermitido } from './mostrar-si-permitido';

/** Literal que el backend envía en lugar de una afirmación con modal normativo (US-245, D-a). */
export const TEXTO_RETIRADO_POR_EL_BACKEND = '(texto no mostrado)';

export interface DescripcionDeDescartada {
  motivo: DiscardedOption['discardReason'];
  /** Nombre de la opción tras el filtro RN-23; `null` si el filtro lo rechaza. */
  opcion: string | null;
  /** Afirmaciones sin soporte tras el filtro; `null` es una afirmación cuyo texto no se muestra. */
  afirmaciones: Array<string | null>;
  /** La opción se omitió por su redacción: se explica en vez de mostrar afirmaciones. */
  porLenguaje: boolean;
}

/**
 * Qué se muestra de una descartada según el motivo que decidió el backend (RN-01: el panel no lo
 * reinterpreta). Con `lenguaje_no_permitido` no se muestran afirmaciones; el resto pasa por RN-23.
 */
export function descripcionDeDescartada(descartada: DiscardedOption): DescripcionDeDescartada {
  const porLenguaje = descartada.discardReason === 'lenguaje_no_permitido';
  return {
    motivo: descartada.discardReason,
    opcion: mostrarSiPermitido(descartada.option),
    afirmaciones: porLenguaje ? [] : descartada.unsupportedClaims.map(filtrarAfirmacion),
    porLenguaje,
  };
}

function filtrarAfirmacion(afirmacion: string): string | null {
  return afirmacion === TEXTO_RETIRADO_POR_EL_BACKEND ? null : mostrarSiPermitido(afirmacion);
}
