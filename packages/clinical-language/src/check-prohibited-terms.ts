import { claveFlexiva, clavesDe, normalizarTexto, palabrasDe } from './normalizar.js';
import { posicionesDe } from './secuencias.js';
import type {
  Coincidencia,
  ListaTerminos,
  Nivel,
  OpcionesDeVerificacion,
  PrefijoProhibido,
  TerminoProhibido,
} from './tipos.js';

/** Aparición de un término o prefijo: tramo `[inicio, inicio + longitud)` en palabras. */
interface Candidata {
  id: string;
  termino: string;
  nivel: Nivel;
  inicio: number;
  longitud: number;
  /** Posición del término en la lista (A y luego B), para desempatar. */
  orden: number;
  /** El tramo del texto es, palabra por palabra, el texto normalizado del término. */
  exacta: boolean;
}

/** Marca que ocupa el lugar de una frase permitida: ninguna clave de la lista la iguala. */
const HUECO = '';

/**
 * RN-23: coincidencias de la lista de términos prohibidos en `texto`, en orden de aparición. Puro.
 * Por defecto solo el Nivel A y sin `frasesPermitidas` (salida generada); el Nivel B y las frases son para
 * textos propios (design D2, D3).
 */
export function checkProhibitedTerms(
  texto: string,
  lista: ListaTerminos,
  { niveles = ['A'], permitirFrases = false }: OpcionesDeVerificacion = {},
): Coincidencia[] {
  const palabras = permitirFrases
    ? taparFrasesPermitidas(palabrasDe(texto), lista.frasesPermitidas.frases)
    : palabrasDe(texto);
  const claves = palabras.map(claveFlexiva);
  const candidatas = recolectarCandidatas(palabras, claves, lista, niveles);
  return elegirTramosMasLargos(candidatas).map(({ id, termino, nivel }) => ({
    id,
    termino,
    nivel,
  }));
}

function taparFrasesPermitidas(palabras: string[], frases: string[]): string[] {
  const resultado = [...palabras];
  for (const frase of frases) {
    const secuencia = palabrasDe(frase);
    for (const inicio of posicionesDe(resultado, secuencia)) {
      resultado.fill(HUECO, inicio, inicio + secuencia.length);
    }
  }
  return resultado;
}

function recolectarCandidatas(
  palabras: string[],
  claves: string[],
  lista: ListaTerminos,
  niveles: readonly Nivel[],
): Candidata[] {
  const candidatas: Candidata[] = [];
  let orden = 0;
  if (niveles.includes('A')) {
    for (const termino of lista.nivelA.terminos) {
      candidatas.push(...candidatasDeTermino(termino, 'A', orden++, palabras, claves));
    }
  }
  if (niveles.includes('B')) {
    for (const prefijo of lista.nivelB.prefijos) {
      candidatas.push(...candidatasDePrefijo(prefijo, orden++, palabras));
    }
    for (const termino of lista.nivelB.terminos) {
      candidatas.push(...candidatasDeTermino(termino, 'B', orden++, palabras, claves));
    }
  }
  return candidatas;
}

/** Cada palabra de la normalización base que empieza por el prefijo es una candidata de una palabra. */
function candidatasDePrefijo(
  prefijo: PrefijoProhibido,
  orden: number,
  palabras: string[],
): Candidata[] {
  const normalizado = normalizarTexto(prefijo.prefijo);
  return palabras.flatMap((palabra, inicio) =>
    palabra.startsWith(normalizado)
      ? [
          {
            id: prefijo.id,
            termino: prefijo.prefijo,
            nivel: 'B' as const,
            inicio,
            longitud: 1,
            orden,
            exacta: palabra === normalizado,
          },
        ]
      : [],
  );
}

function candidatasDeTermino(
  termino: TerminoProhibido,
  nivel: Nivel,
  orden: number,
  palabras: string[],
  claves: string[],
): Candidata[] {
  const tramos = termino.formas
    ? termino.formas.flatMap((forma) => tramosDe(palabrasDe(forma), palabras))
    : tramosDe(clavesDe(termino.texto), claves);
  const sinAnuladas = tramos.filter((tramo) => !anuladoPorExcepcion(tramo, termino, claves));
  const textoNormalizado = normalizarTexto(termino.texto);
  return sinAnuladas.map(({ inicio, longitud }) => ({
    id: termino.id,
    termino: termino.texto,
    nivel,
    inicio,
    longitud,
    orden,
    exacta: palabras.slice(inicio, inicio + longitud).join(' ') === textoNormalizado,
  }));
}

/** Una aparición de una `excepción` que contiene el tramo de la coincidencia la anula. */
function anuladoPorExcepcion(
  tramo: { inicio: number; longitud: number },
  termino: TerminoProhibido,
  claves: string[],
): boolean {
  return (termino.excepciones ?? []).some((excepcion) => {
    const secuencia = clavesDe(excepcion);
    return posicionesDe(claves, secuencia).some(
      (inicio) =>
        inicio <= tramo.inicio && tramo.inicio + tramo.longitud <= inicio + secuencia.length,
    );
  });
}

function tramosDe(secuencia: string[], haystack: string[]): { inicio: number; longitud: number }[] {
  return posicionesDe(haystack, secuencia).map((inicio) => ({
    inicio,
    longitud: secuencia.length,
  }));
}

/**
 * Tramo más largo (design D3.7): en el mismo tramo exacto gana el término cuyo texto normalizado es igual
 * al tramo y, si ninguno, el primero de la lista; después, por longitud descendente e inicio ascendente,
 * se aceptan las que no se solapan con una ya aceptada. El resultado sale en orden de aparición.
 */
function elegirTramosMasLargos(candidatas: Candidata[]): Candidata[] {
  const porTramo = new Map<string, Candidata>();
  for (const candidata of candidatas) {
    const clave = `${candidata.inicio}:${candidata.longitud}`;
    const actual = porTramo.get(clave);
    if (!actual || gana(candidata, actual)) porTramo.set(clave, candidata);
  }
  const ordenadas = [...porTramo.values()].sort(
    (a, b) => b.longitud - a.longitud || a.inicio - b.inicio,
  );
  const aceptadas: Candidata[] = [];
  for (const candidata of ordenadas) {
    if (!aceptadas.some((aceptada) => seSolapan(aceptada, candidata))) aceptadas.push(candidata);
  }
  return aceptadas.sort((a, b) => a.inicio - b.inicio);
}

function gana(nueva: Candidata, actual: Candidata): boolean {
  if (nueva.exacta !== actual.exacta) return nueva.exacta;
  return nueva.orden < actual.orden;
}

function seSolapan(a: Candidata, b: Candidata): boolean {
  return a.inicio < b.inicio + b.longitud && b.inicio < a.inicio + a.longitud;
}
