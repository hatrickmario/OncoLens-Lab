import { describe, expect, it } from 'vitest';
import { FX_T4A_A } from '../../support/identidad.js';
import {
  buscarFugaDeIdentidad,
  clavesDeIdentidadEnJson,
  ejecutarArnesDeNoFuga,
  valoresDeIdentidad,
  valoresProhibidos,
} from '../../support/no-fuga.js';

/**
 * Sondas del arnés de no-fuga: cada tipo de fuga que el test de US-046 AC-4 debe detectar, inyectada a propósito. Si
 * el arnés dejara de ver una de estas, el test de no-fuga pasaría en falso.
 */
const VALORES = [
  FX_T4A_A.numeroDeDocumento,
  FX_T4A_A.apellido,
  FX_T4A_A.nombreNormalizado,
  'a'.repeat(64),
];

describe('buscarFugaDeIdentidad', () => {
  it('devuelve vacío cuando ninguna fuente contiene la identidad', () => {
    const hallazgos = buscarFugaDeIdentidad(VALORES, [
      { nombre: 'log', texto: '{"event":"analisis.completo","traceId":"req_00000001"}' },
    ]);

    expect(hallazgos).toEqual([]);
  });

  it.each([
    [
      'un log',
      'log:clinical-api[0]',
      JSON.stringify({ event: 'x', documento: FX_T4A_A.numeroDeDocumento }),
      FX_T4A_A.numeroDeDocumento,
    ],
    [
      'un payload',
      'payload:rag[0]',
      `{"query":"paciente ${FX_T4A_A.apellido.toUpperCase()}"}`,
      'rondon',
    ],
    [
      'una fila de audit',
      'audit.audit_log[0]',
      `{"metadata":{"nota":"${FX_T4A_A.nombreNormalizado}"}}`,
      FX_T4A_A.nombreNormalizado,
    ],
    [
      'un índice ciego',
      'research.episode_snapshot[0]',
      `{"snapshot":{"h":"${'a'.repeat(64)}"}}`,
      'a'.repeat(64),
    ],
  ])('detecta la fuga en %s', (_donde, fuente, texto, valor) => {
    const hallazgos = buscarFugaDeIdentidad(VALORES, [{ nombre: fuente, texto }]);

    expect(hallazgos).toContainEqual({ fuente, valor });
  });

  it('ignora tildes y mayúsculas del texto buscado', () => {
    const hallazgos = buscarFugaDeIdentidad(['Rondón'], [{ nombre: 'log', texto: 'RONDON' }]);

    expect(hallazgos).toEqual([{ fuente: 'log', valor: 'rondon' }]);
  });

  it('detecta una clave con nombre de identidad en un JSON aunque su valor no sea ninguno de los buscados', () => {
    const hallazgos = buscarFugaDeIdentidad(
      [],
      [
        {
          nombre: 'payload',
          texto: JSON.stringify({ clinicalContext: { patient: { fullName: 'x' } } }),
        },
      ],
    );

    expect(hallazgos).toEqual([{ fuente: 'payload', valor: 'clave:fullName' }]);
  });
});

describe('clavesDeIdentidadEnJson', () => {
  it('no marca originalName porque está en la lista blanca de los contratos', () => {
    expect(
      clavesDeIdentidadEnJson(JSON.stringify({ biomarkers: [{ originalName: 'HER2' }] })),
    ).toEqual([]);
  });

  it('sigue marcando fullName y nationalId (la excepción no ensancha la regla)', () => {
    const claves = clavesDeIdentidadEnJson(
      JSON.stringify({ fullName: 'x', a: { nationalId: 'y' } }),
    );

    expect(claves.sort()).toEqual(['fullName', 'nationalId']);
  });

  it('devuelve vacío cuando el texto no es un JSON', () => {
    expect(clavesDeIdentidadEnJson('línea de log suelta')).toEqual([]);
  });
});

describe('valoresProhibidos', () => {
  it('descarta los valores de menos de 4 caracteres y los duplicados tras normalizar', () => {
    expect(valoresProhibidos(['abc', 'Rondón', 'RONDON'])).toEqual(['rondon']);
  });
});

describe('ejecutarArnesDeNoFuga', () => {
  it('ejecuta los pasos en orden antes de leer valores y fuentes', async () => {
    const orden: string[] = [];

    const anotar = (paso: string) => () => {
      orden.push(paso);
      return Promise.resolve();
    };

    await ejecutarArnesDeNoFuga({
      pasos: [
        { nombre: 'registrar', ejecutar: anotar('registrar') },
        { nombre: 'analizar', ejecutar: anotar('analizar') },
      ],
      valores: () => anotar('valores')().then(() => []),
      fuentes: () => anotar('fuentes')().then(() => []),
    });

    expect(orden).toEqual(['registrar', 'analizar', 'valores', 'fuentes']);
  });
});

describe('valoresDeIdentidad', () => {
  const identidad = {
    numeroDeDocumento: FX_T4A_A.numeroDeDocumento,
    nombreCompleto: FX_T4A_A.nombreCompleto,
  };

  it('deriva documento, forma con puntos, nombre completo, forma normalizada y cada token del nombre', () => {
    const valores = valoresProhibidos(valoresDeIdentidad(identidad));

    expect(valores).toEqual(
      expect.arrayContaining([
        FX_T4A_A.numeroDeDocumento,
        ['1', '234', '567'].join('.'),
        FX_T4A_A.nombreNormalizado,
        'lucia',
        'fernanda',
        'rondon',
        'pena',
      ]),
    );
  });

  it('detecta Fernanda inyectada en un log (sonda de mutación)', () => {
    const hallazgos = buscarFugaDeIdentidad(valoresDeIdentidad(identidad), [
      { nombre: 'log:clinical-api[0]', texto: JSON.stringify({ event: 'x', nota: 'Fernanda' }) },
    ]);

    expect(hallazgos).toContainEqual({ fuente: 'log:clinical-api[0]', valor: 'fernanda' });
  });
});
