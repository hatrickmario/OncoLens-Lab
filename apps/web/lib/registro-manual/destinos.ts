import type { CompletenessItem } from '../../../../packages/api-contracts/src/types/clinical-api';
import { hrefDeRegistroManual, type PaginaDeRegistro } from './enlaces';

export type EntidadDeDestino = CompletenessItem['destination']['entity'];

export type TipoDeAccionManual = 'biomarcador' | 'diagnostico' | 'atributo' | 'tratamiento';

/**
 * Único catálogo de a dónde lleva registrar un dato crítico según su `destination.entity` (D3, D-7): el tipo de acción
 * y la página cuyo `?item=` abre su formulario. El diagnóstico va a la ficha (su diálogo vive ahí); los diálogos de
 * atributo y tratamiento se abren en la vista de caso sin `?item=`. Ninguna entidad ofrece «cargar documento».
 */
export const DESTINO_DE_REGISTRO: Record<
  EntidadDeDestino,
  { tipo: TipoDeAccionManual; pagina: PaginaDeRegistro }
> = {
  Biomarker: { tipo: 'biomarcador', pagina: 'caso' },
  Diagnosis: { tipo: 'diagnostico', pagina: 'ficha' },
  ClinicalAttribute: { tipo: 'atributo', pagina: 'caso' },
  PriorTreatment: { tipo: 'tratamiento', pagina: 'caso' },
};

/** `?item=<clave>` sobre la página que declara el catálogo de destinos para ese tipo de acción. */
export function hrefDeAccionManual(
  pacienteId: string,
  accion: { tipo: TipoDeAccionManual; item: string },
): string {
  const destino = Object.values(DESTINO_DE_REGISTRO).find((d) => d.tipo === accion.tipo);
  if (destino === undefined) throw new Error('tipo de acción manual desconocido');
  return hrefDeRegistroManual(pacienteId, accion.item, destino.pagina);
}
