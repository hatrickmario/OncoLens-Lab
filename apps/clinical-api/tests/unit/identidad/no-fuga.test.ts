import { describe, expect, it, vi } from 'vitest';
import { FX_T4A_A } from '../../support/identidad.js';
import {
  buscarFugaDeIdentidad,
  capturarSalidaDelProceso,
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

describe('capturarSalidaDelProceso', () => {
  const identidad = {
    numeroDeDocumento: FX_T4A_A.numeroDeDocumento,
    nombreCompleto: FX_T4A_A.nombreCompleto,
  };

  /** Ejecuta un paso con la captura activa y revisa la salida del proceso con el mismo arnés del test de no-fuga. */
  async function hallazgosDelPaso(ejecutar: () => Promise<void>) {
    const { salida, restaurar } = capturarSalidaDelProceso();
    try {
      const hallazgos = await ejecutarArnesDeNoFuga({
        pasos: [{ nombre: 'paso', ejecutar }],
        valores: () => Promise.resolve(valoresDeIdentidad(identidad)),
        fuentes: () =>
          Promise.resolve(
            salida.map((texto, indice) => ({ nombre: `salida:proceso[${indice}]`, texto })),
          ),
      });
      return { hallazgos, salida: [...salida] };
    } finally {
      restaurar();
    }
  }

  it.each(['log', 'info', 'warn', 'error', 'debug'] as const)(
    'detecta Fernanda escrita con console.%s (sonda de mutación)',
    async (metodo) => {
      const { hallazgos } = await hallazgosDelPaso(() => {
        console[metodo]('Fernanda');
        return Promise.resolve();
      });

      expect(hallazgos).toContainEqual({ fuente: 'salida:proceso[0]', valor: 'fernanda' });
    },
  );

  it.each([
    ['un objeto con el nombre', () => ({ nombre: 'Fernanda' }), 'fernanda'],
    [
      'un objeto anidado con el documento',
      () => ({ p: { numeroDeDocumento: FX_T4A_A.numeroDeDocumento } }),
      FX_T4A_A.numeroDeDocumento,
    ],
    [
      'un Error con el documento en cause',
      () => new Error('fallo', { cause: FX_T4A_A.numeroDeDocumento }),
      FX_T4A_A.numeroDeDocumento,
    ],
    [
      'un Error con el documento en la propiedad detail (como un error de pg)',
      () =>
        Object.assign(new Error('fallo'), { detail: `Key (hmac)=(${FX_T4A_A.numeroDeDocumento})` }),
      FX_T4A_A.numeroDeDocumento,
    ],
  ])('detecta la fuga escrita con console.error de %s', async (_caso, argumento, valor) => {
    const { hallazgos } = await hallazgosDelPaso(() => {
      console.error(argumento());
      return Promise.resolve();
    });

    expect(hallazgos).toContainEqual({ fuente: 'salida:proceso[0]', valor });
  });

  it.each(['dir', 'table'] as const)('detecta Fernanda escrita con console.%s', async (metodo) => {
    const { hallazgos } = await hallazgosDelPaso(() => {
      console[metodo]({ nombre: 'Fernanda' });
      return Promise.resolve();
    });

    expect(hallazgos).toContainEqual({ fuente: 'salida:proceso[0]', valor: 'fernanda' });
  });

  it('captura algo en un paso de control que escribe en el proceso (la captura no está ciega)', async () => {
    const { salida } = await hallazgosDelPaso(() => {
      process.stdout.write('línea de control');
      console.info('control');
      return Promise.resolve();
    });

    expect(salida.length).toBeGreaterThan(0);
  });

  it('detecta Fernanda escrita en process.stderr como Uint8Array', async () => {
    const { hallazgos } = await hallazgosDelPaso(() => {
      process.stderr.write(new TextEncoder().encode('Fernanda'));
      return Promise.resolve();
    });

    expect(hallazgos).toContainEqual({ fuente: 'salida:proceso[0]', valor: 'fernanda' });
  });

  it('restaura console y process.stdout al terminar', () => {
    const { restaurar } = capturarSalidaDelProceso();
    restaurar();

    expect(vi.isMockFunction(console.info)).toBe(false);
    expect(vi.isMockFunction(process.stdout.write)).toBe(false);
  });
});
