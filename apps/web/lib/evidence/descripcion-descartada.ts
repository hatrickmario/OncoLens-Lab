import type { DiscardedOption } from '../../../../packages/api-contracts/src/types/clinical-api';
import { LITERALES_DE_AFIRMACION_RETIRADA } from './literales-de-retiro';
import { POLITICA_DE_MOTIVO, type Motivo } from './motivos-de-descarte';
import { textoSiPermitido } from './texto-si-permitido';

export interface DescripcionDeDescartada {
  motivo: Motivo;
  /** Nombre de la opción tras el filtro RN-23; `null` si el filtro lo rechaza. */
  opcion: string | null;
  /** Afirmaciones sin soporte tras el filtro; `null` es una afirmación cuyo texto no se muestra. */
  afirmaciones: Array<string | null>;
  /** La opción se omitió por su redacción: se explica en vez de mostrar afirmaciones. */
  porLenguaje: boolean;
}

/**
 * Qué se muestra de una descartada según el motivo que decidió el backend (RN-01: el panel no lo
 * reinterpreta). Si el motivo no muestra afirmaciones no se muestra ninguna; el resto pasa por RN-23.
 */
export function descripcionDeDescartada(descartada: DiscardedOption): DescripcionDeDescartada {
  const { muestraAfirmaciones } = POLITICA_DE_MOTIVO[descartada.discardReason];
  return {
    motivo: descartada.discardReason,
    opcion: textoSiPermitido(descartada.option),
    afirmaciones: muestraAfirmaciones ? descartada.unsupportedClaims.map(filtrarAfirmacion) : [],
    porLenguaje: descartada.discardReason === 'lenguaje_no_permitido',
  };
}

function filtrarAfirmacion(afirmacion: string): string | null {
  return LITERALES_DE_AFIRMACION_RETIRADA.has(afirmacion) ? null : textoSiPermitido(afirmacion);
}
