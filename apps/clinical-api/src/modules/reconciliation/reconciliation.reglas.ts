import type {
  EntidadNormalizable,
  EntradaDeCodigo,
  Estandar,
  PropuestaDeNormalizacion,
  SinonimosDeTermino,
  TipoDeEvento,
} from './ports.js';

/** Estándar de cada entidad con un único estándar (RN-27, D3). `ClinicalEvent` lo decide su tipo (`ESTANDAR_DE_EVENTO`). */
export const ESTANDAR_DE_ENTIDAD: Readonly<
  Record<Exclude<EntidadNormalizable, 'ClinicalEvent'>, Estandar>
> = {
  Diagnosis: 'cie10',
  Biomarker: 'loinc',
  PriorTreatment: 'atc',
};

/** Tipos de `ClinicalEvent` que llevan codificación y su estándar; los demás (p. ej. `progresion`) quedan `n_a`. */
const ESTANDAR_DE_EVENTO: Readonly<Partial<Record<TipoDeEvento, Estandar>>> = {
  cirugia: 'cups',
  procedimiento: 'cups',
};

/** Verdadero cuando un evento de ese tipo no lleva codificación aplicable (`mapping_status = n_a`). */
export function tipoDeEventoSinCodigo(tipo: TipoDeEvento): boolean {
  return ESTANDAR_DE_EVENTO[tipo] === undefined;
}

/** Estándar contra el que se normaliza la propuesta, o `null` si no lleva codificación (`n_a`). */
export function estandarDe(propuesta: PropuestaDeNormalizacion): Estandar | null {
  if (propuesta.entidad !== 'ClinicalEvent') return ESTANDAR_DE_ENTIDAD[propuesta.entidad];
  if (propuesta.tipoDeEvento === undefined || tipoDeEventoSinCodigo(propuesta.tipoDeEvento)) {
    return null;
  }
  return ESTANDAR_DE_EVENTO[propuesta.tipoDeEvento] ?? null;
}

/** Clave de comparación: minúsculas, sin tildes, espacios colapsados y recortados. */
export function clave(texto: string): string {
  return texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export type ResolucionDeCodigo =
  | { readonly resultado: 'mapeado'; readonly terminoCanonico: string; readonly codigos: string[] }
  | { readonly resultado: 'ambiguo' }
  | { readonly resultado: 'sin_coincidencia' };

export interface EntradaDeResolucion {
  /** Entradas del catálogo del tipo de cáncer, ya filtradas por el estándar de la entidad. */
  readonly entradas: readonly EntradaDeCodigo[];
  readonly sinonimos: readonly SinonimosDeTermino[];
  readonly textoOriginal: string;
  readonly codigoPropuesto?: string;
}

/**
 * RN-27, ÚNICO sitio donde se decide un código (D2): (1) el código propuesto, si existe en el catálogo para el estándar;
 * (2) el texto original contra término canónico, etiqueta, nombre oficial y sinónimos ES/EN; (3) sin coincidencia.
 * Una clave que apunta a dos términos canónicos distintos es ambigua: no se elige (D4).
 */
export function resolverCodigo(entrada: EntradaDeResolucion): ResolucionDeCodigo {
  const propuesto = entrada.entradas.find((e) => e.codigo === entrada.codigoPropuesto);
  if (propuesto !== undefined) {
    return {
      resultado: 'mapeado',
      terminoCanonico: propuesto.terminoCanonico,
      codigos: [propuesto.codigo],
    };
  }
  return resolverPorTexto(entrada);
}

function resolverPorTexto(entrada: EntradaDeResolucion): ResolucionDeCodigo {
  const buscada = clave(entrada.textoOriginal);
  const terminos = new Set<string>();
  for (const { terminoCanonico, etiquetaEs, nombreOficial } of entrada.entradas) {
    const nombres = [terminoCanonico, etiquetaEs, nombreOficial];
    if (nombres.some((nombre) => clave(nombre) === buscada)) terminos.add(terminoCanonico);
  }
  const conCodigo = new Set(entrada.entradas.map((e) => e.terminoCanonico));
  for (const { terminoCanonico, textos } of entrada.sinonimos) {
    if (conCodigo.has(terminoCanonico) && textos.some((texto) => clave(texto) === buscada)) {
      terminos.add(terminoCanonico);
    }
  }
  if (buscada === '' || terminos.size === 0) return { resultado: 'sin_coincidencia' };
  const [terminoCanonico, otro] = [...terminos];
  if (terminoCanonico === undefined || otro !== undefined) return { resultado: 'ambiguo' };
  const codigos = entrada.entradas
    .filter((e) => e.terminoCanonico === terminoCanonico)
    .map((e) => e.codigo);
  return { resultado: 'mapeado', terminoCanonico, codigos };
}
