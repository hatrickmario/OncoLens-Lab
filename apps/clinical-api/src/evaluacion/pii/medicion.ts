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

export function etiquetaCubierta(
  _valor: string,
  _enmascarado: string,
  _minimoDeCobertura: number,
): boolean {
  throw new Error('no implementado');
}

export function sensibilidadPorTipo(
  _textos: TextoMedido[],
  _minimoDeCobertura: number,
): Record<string, Sensibilidad> {
  throw new Error('no implementado');
}

export function falsosPositivosClinicos(_textos: TextoMedido[]): FalsosPositivos {
  throw new Error('no implementado');
}

export function percentil95(_valores: number[]): number {
  throw new Error('no implementado');
}
