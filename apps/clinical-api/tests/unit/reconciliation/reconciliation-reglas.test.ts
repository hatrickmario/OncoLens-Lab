import { describe, expect, it } from 'vitest';
import type { EntradaDeCodigo } from '../../../src/modules/reconciliation/ports.js';
import {
  clave,
  estandarDe,
  resolverCodigo,
  tipoDeEventoSinCodigo,
} from '../../../src/modules/reconciliation/reconciliation.reglas.js';

const entrada = (terminoCanonico: string, codigo: string, etiquetaEs = terminoCanonico) =>
  ({
    terminoCanonico,
    estandar: 'loinc',
    codigo,
    nombreOficial: `${terminoCanonico} oficial`,
    etiquetaEs,
  }) satisfies EntradaDeCodigo;

describe('clave', () => {
  it('ignora mayúsculas, tildes y espacios extremos o repetidos cuando se normaliza', () => {
    expect(clave('  Índice   de  PROLIFERACIÓN ')).toBe('indice de proliferacion');
  });

  it('devuelve cadena vacía cuando el texto solo tiene espacios', () => {
    expect(clave('   ')).toBe('');
  });
});

describe('tipoDeEventoSinCodigo', () => {
  it.each(['progresion', 'respuesta', 'toxicidad', 'recaida', 'evolucion'] as const)(
    'es verdadero cuando el evento es %s',
    (tipo) => {
      expect(tipoDeEventoSinCodigo(tipo)).toBe(true);
    },
  );

  it.each(['procedimiento', 'cirugia'] as const)('es falso cuando el evento es %s', (tipo) => {
    expect(tipoDeEventoSinCodigo(tipo)).toBe(false);
  });
});

describe('estandarDe', () => {
  it('devuelve null cuando el evento no lleva codificación', () => {
    expect(
      estandarDe({
        entidad: 'ClinicalEvent',
        tipoDeCancer: 'mama',
        textoOriginal: 'x',
        tipoDeEvento: 'progresion',
      }),
    ).toBeNull();
  });

  it('devuelve null cuando un ClinicalEvent llega sin tipo', () => {
    expect(
      estandarDe({ entidad: 'ClinicalEvent', tipoDeCancer: 'mama', textoOriginal: 'x' }),
    ).toBeNull();
  });
});

describe('resolverCodigo', () => {
  it('prefiere el código propuesto cuando existe en el catálogo', () => {
    const resultado = resolverCodigo({
      entradas: [entrada('HER2', 'A-1')],
      sinonimos: [],
      textoOriginal: 'otro',
      codigoPropuesto: 'A-1',
    });

    expect(resultado).toEqual({ resultado: 'mapeado', terminoCanonico: 'HER2', codigos: ['A-1'] });
  });

  it('resuelve por la etiqueta en español cuando no hay código propuesto', () => {
    const resultado = resolverCodigo({
      entradas: [entrada('RE', 'A-2', 'Receptores de estrógeno')],
      sinonimos: [],
      textoOriginal: 'receptores de estrogeno',
    });

    expect(resultado).toMatchObject({ resultado: 'mapeado', terminoCanonico: 'RE' });
  });

  it('devuelve todos los códigos del término cuando el estándar admite varios', () => {
    const resultado = resolverCodigo({
      entradas: [entrada('combo', 'B-1'), entrada('combo', 'B-2')],
      sinonimos: [],
      textoOriginal: 'combo',
    });

    expect(resultado).toMatchObject({ codigos: ['B-1', 'B-2'] });
  });

  it('devuelve sin_coincidencia cuando el texto está vacío', () => {
    const resultado = resolverCodigo({
      entradas: [entrada('HER2', 'A-1')],
      sinonimos: [],
      textoOriginal: ' ',
    });

    expect(resultado).toEqual({ resultado: 'sin_coincidencia' });
  });

  it('devuelve ambiguo cuando la clave coincide con dos términos canónicos distintos [D4]', () => {
    const resultado = resolverCodigo({
      entradas: [entrada('HER2', 'A-1'), entrada('RE', 'A-2')],
      sinonimos: [
        { terminoCanonico: 'HER2', textos: ['marcador'] },
        { terminoCanonico: 'RE', textos: ['Marcador'] },
      ],
      textoOriginal: 'MARCADOR',
    });

    expect(resultado).toEqual({ resultado: 'ambiguo' });
  });

  it('ignora sinónimos de un término sin entradas en el estándar cuando se resuelve', () => {
    const resultado = resolverCodigo({
      entradas: [entrada('HER2', 'A-1')],
      sinonimos: [{ terminoCanonico: 'otro-estandar', textos: ['zeta'] }],
      textoOriginal: 'zeta',
    });

    expect(resultado).toEqual({ resultado: 'sin_coincidencia' });
  });
});
