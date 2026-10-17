import { z } from 'zod';
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

const esquemaDeEntrada = z.object({
  terminoCanonico: z.string().min(1),
  estandar: z.enum(['cie10', 'loinc', 'atc']),
  codigo: z.string().min(1),
  nombreOficial: z.string().min(1),
  etiquetaEs: z.string().min(1),
  versionFuente: z.string().min(1),
});
const esquemaDeManifest = z.object({
  version: z.string().min(1),
  cancerTypes: z.array(z.string()),
});
const esquemaDeCodigos = z.object({ entradas: z.array(esquemaDeEntrada) });

/** Falla nombrando el archivo y nunca su contenido (puede ser cualquier cosa si el montaje está mal). */
function leerJson<T>(ruta: string, esquema: z.ZodType<T>, leerArchivo: LeerArchivo): T {
  const nombre = ruta.split('/').slice(-2).join('/');
  let bruto: unknown;
  try {
    bruto = JSON.parse(leerArchivo(ruta));
  } catch {
    throw new Error(`Catálogo ilegible: ${nombre}`);
  }
  const resultado = esquema.safeParse(bruto);
  if (!resultado.success) throw new Error(`Catálogo con forma inválida: ${nombre}`);
  return resultado.data;
}

/** Lector de solo lectura del catálogo (`CLINICAL_CATALOG_PATH`); el montaje es de L1D-164. */
export function leerCatalogo(ruta: string, leerArchivo: LeerArchivo): CatalogoClinico {
  const manifest = leerJson(`${ruta}/manifest.json`, esquemaDeManifest, leerArchivo);
  const entradas = manifest.cancerTypes.flatMap(
    (tipo) => leerJson(`${ruta}/${tipo}/codigos.json`, esquemaDeCodigos, leerArchivo).entradas,
  );
  return { version: manifest.version, entradas };
}

/** RN-27: el código sale del catálogo versionado; sin entrada queda `no_mapeado`, nunca inventado ni descartado. */
export function resolverCodigoDelCatalogo(
  catalogo: CatalogoClinico,
  estandar: EstandarTerminologico,
  terminoCanonico: string,
): CodigoResuelto {
  const entrada = catalogo.entradas.find(
    (candidata) => candidata.estandar === estandar && candidata.terminoCanonico === terminoCanonico,
  );
  if (entrada === undefined) return { codigo: null, mappingStatus: 'no_mapeado' };
  return { codigo: entrada.codigo, nombreOficial: entrada.nombreOficial, mappingStatus: 'mapeado' };
}
