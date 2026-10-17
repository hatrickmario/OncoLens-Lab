import type { Coincidencia, ListaTerminos, OpcionesDeVerificacion } from './tipos.js';

/** RN-23: coincidencias de la lista de términos prohibidos en `texto`, en orden de aparición. */
export function checkProhibitedTerms(
  _texto: string,
  _lista: ListaTerminos,
  _opciones?: OpcionesDeVerificacion,
): Coincidencia[] {
  throw new Error('no implementado');
}
