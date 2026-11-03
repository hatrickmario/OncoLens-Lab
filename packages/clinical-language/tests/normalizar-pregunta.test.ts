import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { esquemaPreguntaNormalizada, normalizarPregunta } from '../src/normalizar-pregunta.js';

interface CasoDeNormalizacion {
  nombre: string;
  entrada: string;
  esperada: string;
  repetir?: number;
}

const tabla = JSON.parse(
  readFileSync(new URL('../fixtures/normalizacion-pregunta.json', import.meta.url), 'utf8'),
) as { casos: CasoDeNormalizacion[] };

const repetido = (texto: string, veces: number | undefined): string => texto.repeat(veces ?? 1);

describe('normalizarPregunta', () => {
  for (const caso of tabla.casos) {
    it(`${caso.nombre} (tabla compartida)`, () => {
      expect(normalizarPregunta(repetido(caso.entrada, caso.repetir))).toBe(
        repetido(caso.esperada, caso.repetir),
      );
    });
  }

  it('es idempotente cuando se aplica dos veces', () => {
    for (const caso of tabla.casos) {
      const una = normalizarPregunta(repetido(caso.entrada, caso.repetir));
      expect(normalizarPregunta(una)).toBe(una);
    }
  });
});

describe('esquemaPreguntaNormalizada', () => {
  const limites = z.string().min(1).max(5);

  it('mide el límite después de normalizar cuando la entrada NFD supera el máximo en crudo', () => {
    const resultado = esquemaPreguntaNormalizada(limites).safeParse('e\u{301}'.repeat(5));

    expect(resultado.success).toBe(true);
    expect(resultado.data).toBe('\u{e9}'.repeat(5));
  });

  it('rechaza la pregunta cuando queda vacía tras normalizar', () => {
    expect(esquemaPreguntaNormalizada(limites).safeParse(' \u{a0}\t ').success).toBe(false);
  });

  it('rechaza la pregunta cuando no es una cadena', () => {
    expect(esquemaPreguntaNormalizada(limites).safeParse(42).success).toBe(false);
  });
});
