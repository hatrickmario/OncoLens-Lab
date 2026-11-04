import type { CompletenessItem } from '../../../../packages/api-contracts/src/types/clinical-api';

export type EntidadDeDestino = CompletenessItem['destination']['entity'];

export type TipoDeAccionManual = 'biomarcador' | 'diagnostico' | 'atributo' | 'tratamiento';

export const DESTINO_DE_REGISTRO = {} as Record<
  EntidadDeDestino,
  { tipo: TipoDeAccionManual; pagina: 'ficha' | 'caso' }
>;

export function hrefDeAccionManual(
  _pacienteId: string,
  _accion: { tipo: TipoDeAccionManual; item: string },
): string {
  throw new Error('no implementado');
}
