import type { LeerArchivo } from '../../src/config/secrets.js';

export type EstandarTerminologico = 'cie10' | 'loinc' | 'atc';

/** Una entrada de `packages/clinical-catalogs/<tipo>/codigos.json`, tal como la versiona el catálogo. */
export interface EntradaDelCatalogo {
  readonly terminoCanonico: string;
  readonly estandar: EstandarTerminologico;
  readonly codigo: string;
  readonly nombreOficial: string;
  readonly etiquetaEs: string;
  readonly versionFuente: string;
}

export interface CatalogoClinico {
  readonly version: string;
  readonly entradas: readonly EntradaDelCatalogo[];
}

export type CodigoResuelto =
  | { readonly codigo: string; readonly nombreOficial: string; readonly mappingStatus: 'mapeado' }
  | { readonly codigo: null; readonly mappingStatus: 'no_mapeado' };

/** Lector de solo lectura del catálogo (`CLINICAL_CATALOG_PATH`); el montaje es de L1D-164. */
export function leerCatalogo(_ruta: string, _leerArchivo: LeerArchivo): CatalogoClinico {
  throw new Error('no implementado');
}

/** RN-27: el código sale del catálogo versionado; sin entrada queda `no_mapeado`, nunca inventado ni descartado. */
export function resolverCodigoDelCatalogo(
  _catalogo: CatalogoClinico,
  _estandar: EstandarTerminologico,
  _terminoCanonico: string,
): CodigoResuelto {
  throw new Error('no implementado');
}
