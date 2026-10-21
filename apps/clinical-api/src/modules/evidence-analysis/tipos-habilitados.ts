import type { TiposDeCancerHabilitados } from './ports.js';

/** Adaptador de `TiposDeCancerHabilitados` sobre la lista ya validada contra el manifiesto (RN-20, RN-22). */
export function crearTiposHabilitados(habilitados: readonly string[]): TiposDeCancerHabilitados {
  return { estaHabilitado: (tipo) => habilitados.includes(tipo) };
}
