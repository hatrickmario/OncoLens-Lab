/**
 * Medición del detector de PII de Backend 1 (ADR-40, opción A) sobre `data/eval/pii-mini`: sensibilidad por tipo,
 * falsos positivos sobre términos clínicos de control y latencia p95. Lógica pura y determinista (el reloj se inyecta
 * desde el comando). Los reportes llevan solo agregados y tipos, nunca valores ni textos (RN-14).
 */

export interface EtiquetaSembrada {
  inicio: number;
  fin: number;
  tipo: string;
}

export interface ControlClinico {
  termino: string;
  critico: boolean;
}

export interface TextoSembrado {
  id: string;
  contexto: string;
  texto: string;
  etiquetas: EtiquetaSembrada[];
  controles: ControlClinico[];
}

export interface TextoMedido {
  original: TextoSembrado;
  enmascarado: string;
}

export interface Sensibilidad {
  aciertos: number;
  total: number;
  valor: number;
}

export interface FalsosPositivos {
  controles: number;
  marcados: number;
  tasa: number;
  criticosMarcados: Record<string, number>;
  porTermino: Record<string, number>;
}

export const TOTAL = 'total';

const contarCaracteres = (palabras: string[]): number =>
  palabras.reduce((suma, palabra) => suma + palabra.length, 0);

/** Un valor está cubierto cuando el enmascarado hizo desaparecer al menos `minimoDeCobertura` de sus caracteres. */
export function etiquetaCubierta(
  valor: string,
  enmascarado: string,
  minimoDeCobertura: number,
): boolean {
  const palabras = valor.split(/\s+/).filter(Boolean);
  const desaparecidas = palabras.filter((palabra) => !enmascarado.includes(palabra));
  return contarCaracteres(desaparecidas) / contarCaracteres(palabras) >= minimoDeCobertura;
}

const sensibilidadDe = (aciertos: number, total: number): Sensibilidad => ({
  aciertos,
  total,
  valor: total === 0 ? 0 : aciertos / total,
});

export function sensibilidadPorTipo(
  textos: TextoMedido[],
  minimoDeCobertura: number,
): Record<string, Sensibilidad> {
  const porTipo = new Map<string, boolean[]>();
  for (const { original, enmascarado } of textos) {
    for (const etiqueta of original.etiquetas) {
      const valor = original.texto.slice(etiqueta.inicio, etiqueta.fin);
      const aciertos = porTipo.get(etiqueta.tipo) ?? [];
      aciertos.push(etiquetaCubierta(valor, enmascarado, minimoDeCobertura));
      porTipo.set(etiqueta.tipo, aciertos);
    }
  }
  const resultado: Record<string, Sensibilidad> = {};
  for (const tipo of [...porTipo.keys()].sort()) {
    const aciertos = porTipo.get(tipo) ?? [];
    resultado[tipo] = sensibilidadDe(aciertos.filter(Boolean).length, aciertos.length);
  }
  const todos = [...porTipo.values()].flat();
  resultado[TOTAL] = sensibilidadDe(todos.filter(Boolean).length, todos.length);
  return resultado;
}

const apariciones = (texto: string, termino: string): number => texto.split(termino).length - 1;

const sumar = (conteo: Record<string, number>, termino: string, cantidad: number): void => {
  conteo[termino] = (conteo[termino] ?? 0) + cantidad;
};

/** Controles clínicos (no son PII) que el enmascarado hizo desaparecer: lo que se ocultaría por error. */
export function falsosPositivosClinicos(textos: TextoMedido[]): FalsosPositivos {
  const porTermino: Record<string, number> = {};
  const criticosMarcados: Record<string, number> = {};
  let controles = 0;
  let marcados = 0;
  for (const { original, enmascarado } of textos) {
    const esperados = new Map<string, { cantidad: number; critico: boolean }>();
    for (const { termino, critico } of original.controles) {
      const actual = esperados.get(termino);
      esperados.set(termino, { cantidad: (actual?.cantidad ?? 0) + 1, critico });
    }
    for (const [termino, { cantidad, critico }] of esperados) {
      const perdidos = Math.max(0, cantidad - apariciones(enmascarado, termino));
      controles += cantidad;
      marcados += perdidos;
      if (perdidos === 0) continue;
      sumar(porTermino, termino, perdidos);
      if (critico) sumar(criticosMarcados, termino, perdidos);
    }
  }
  return {
    controles,
    marcados,
    tasa: controles === 0 ? 0 : marcados / controles,
    criticosMarcados,
    porTermino,
  };
}

/** Percentil 95 por rango (método del techo); 0 sin muestras. */
export function percentil95(valores: number[]): number {
  if (valores.length === 0) return 0;
  const ordenados = [...valores].sort((a, b) => a - b);
  return ordenados[Math.ceil(0.95 * ordenados.length) - 1] ?? 0;
}
