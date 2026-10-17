import type { ListaTerminos } from './tipos.js';

/** Ruta de la lista versionada dentro del monorepo. */
export const RUTA_LISTA_TERMINOS_PROHIBIDOS = new URL(
  '../../clinical-catalogs/lenguaje/terminos-prohibidos.json',
  import.meta.url,
);

/** Carga y valida la lista; falla cerrado nombrando el archivo. */
export function loadProhibitedTerms(
  _ruta: string | URL = RUTA_LISTA_TERMINOS_PROHIBIDOS,
): ListaTerminos {
  throw new Error('no implementado');
}
