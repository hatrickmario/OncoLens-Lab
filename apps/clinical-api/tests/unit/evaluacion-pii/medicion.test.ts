import { describe, expect, it } from 'vitest';
import {
  valorAusenteDelEnmascarado,
  falsosPositivosClinicos,
  percentil95,
  sensibilidadPorTipo,
  TOTAL,
  type TextoMedido,
  type TextoSembrado,
} from '../../../src/evaluacion/pii/medicion.js';

const COBERTURA = 0.5;

function medido(
  texto: string,
  enmascarado: string,
  etiquetas: Array<[string, string]> = [],
  controles: Array<[string, boolean]> = [],
): TextoMedido {
  const original: TextoSembrado = {
    id: 't',
    contexto: 'documento',
    texto,
    etiquetas: etiquetas.map(([tipo, valor]) => {
      const inicio = texto.indexOf(valor);
      return { tipo, inicio, fin: inicio + valor.length };
    }),
    controles: controles.map(([termino, critico]) => ({ termino, critico })),
  };
  return { original, enmascarado };
}

describe('valorAusenteDelEnmascarado', () => {
  it('es verdadera cuando el valor ya no aparece en el texto enmascarado', () => {
    expect(valorAusenteDelEnmascarado('correo-x', 'escribir a [CORREO]', COBERTURA)).toBe(true);
  });

  it('es falsa cuando el valor sigue completo en el texto enmascarado', () => {
    expect(valorAusenteDelEnmascarado('correo-x', 'escribir a correo-x', COBERTURA)).toBe(false);
  });

  it('es verdadera cuando se enmascara al menos la mitad de los caracteres de un valor de varias palabras', () => {
    expect(
      valorAusenteDelEnmascarado(
        'Lucía Romero Vidal',
        'Paciente [NOMBRE] [NOMBRE] Vidal',
        COBERTURA,
      ),
    ).toBe(true);
  });

  it('es falsa cuando se enmascara menos de la mitad de los caracteres', () => {
    expect(
      valorAusenteDelEnmascarado('Lucía Romero Vidal', 'Paciente [NOMBRE] Romero Vidal', COBERTURA),
    ).toBe(false);
  });
});

describe('sensibilidadPorTipo', () => {
  it('calcula aciertos, total y valor por tipo y el total global cuando hay aciertos y fallos', () => {
    const resultado = sensibilidadPorTipo(
      [
        medido('a@x.test y Ana', '[CORREO] y Ana', [
          ['correo', 'a@x.test'],
          ['nombre', 'Ana'],
        ]),
        medido('b@x.test', '[CORREO]', [['correo', 'b@x.test']]),
      ],
      COBERTURA,
    );

    expect(resultado['correo']).toEqual({ aciertos: 2, total: 2, valor: 1 });
    expect(resultado['nombre']).toEqual({ aciertos: 0, total: 1, valor: 0 });
    expect(resultado[TOTAL]).toEqual({ aciertos: 2, total: 3, valor: 2 / 3 });
  });

  it('devuelve solo el total con valor null cuando no hay etiquetas', () => {
    expect(sensibilidadPorTipo([medido('texto', 'texto')], COBERTURA)).toEqual({
      [TOTAL]: { aciertos: 0, total: 0, valor: null },
    });
  });
});

describe('falsosPositivosClinicos', () => {
  it('cuenta los controles que el enmascarado hace desaparecer y separa los críticos cuando el detector toca un término clínico', () => {
    const resultado = falsosPositivosClinicos([
      medido(
        'HER2 y Gleason 7 y ki67',
        'HER2 y [NOMBRE] y ki67',
        [],
        [
          ['HER2', true],
          ['Gleason 7', true],
          ['ki67', false],
        ],
      ),
    ]);

    expect(resultado.controles).toBe(3);
    expect(resultado.marcados).toBe(1);
    expect(resultado.tasa).toBeCloseTo(1 / 3);
    expect(resultado.criticosMarcados).toEqual({ 'Gleason 7': 1 });
    expect(resultado.porTermino).toEqual({ 'Gleason 7': 1 });
  });

  it('devuelve tasa null cuando no hay controles', () => {
    expect(falsosPositivosClinicos([medido('x', 'x')])).toEqual({
      controles: 0,
      marcados: 0,
      tasa: null,
      criticosMarcados: {},
      porTermino: {},
    });
  });
});

describe('percentil95', () => {
  it('devuelve el valor del rango por techo cuando hay veinte muestras ordenadas al revés', () => {
    const muestras = Array.from({ length: 20 }, (_, i) => 20 - i);

    expect(percentil95(muestras)).toBe(19);
  });

  it('devuelve cero cuando no hay muestras', () => {
    expect(percentil95([])).toBe(0);
  });
});
