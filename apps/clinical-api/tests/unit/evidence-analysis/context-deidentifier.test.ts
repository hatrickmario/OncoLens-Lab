import { describe, expect, it } from 'vitest';
import {
  DesidentificacionNoDisponible,
  crearContextDeidentifier,
  enmascararTextoLibre,
  verificarDesidentificado,
} from '../../../src/modules/evidence-analysis/deidentification/context-deidentifier.js';
import { EntornoNoSintetico } from '../../../src/modules/evidence-analysis/deidentification/entorno-sintetico.guard.js';
import { configuracionDePiiDeTest } from '../../support/desidentificacion.js';
import type {
  ContextoPermitido,
  IdentidadDelPaciente,
  PiiDetector,
} from '../../../src/modules/evidence-analysis/ports.js';

const FECHAS = configuracionDePiiDeTest().fechas.expresiones;

const CONTEXTO_VACIO: ContextoPermitido = {
  population: 'adulto',
  diagnosis: null,
  biomarkers: [],
  clinicalNotes: [],
  currentLine: null,
  attributes: [],
  priorTreatments: [],
  events: [],
  biomarkerTrends: [],
  missingCriticalData: [],
  priorAnalyses: [],
};

/** Detector falso que sustituye la palabra SECRETO y reporta el tipo `secreto`. */
const detectorDeSecretos: PiiDetector = {
  enmascarar: (texto) => {
    const hallazgos = texto.split('SECRETO').length - 1;
    return {
      texto: texto.replaceAll('SECRETO', '[X]'),
      findingTypes: hallazgos > 0 ? ['secreto'] : [],
      hallazgos,
    };
  },
};

const ENTRADA = {
  traceId: 'req_Test0001',
  patientId: 'paciente-sintetico',
  contexto: CONTEXTO_VACIO,
  query: 'pregunta sintética',
  dataOrigin: 'sintetico',
} as const;

function dependencias(
  cambios: {
    appEnv?: string | undefined;
    leer?: () => Promise<IdentidadDelPaciente | null>;
    detector?: PiiDetector;
    pseudonimo?: () => string;
  } = {},
) {
  const lineas: Record<string, unknown>[] = [];
  const llamadas = { identidad: 0, detector: 0 };
  return {
    lineas,
    llamadas,
    dependencias: {
      identidades: {
        leer: () => {
          llamadas.identidad += 1;
          return cambios.leer?.() ?? Promise.resolve(null);
        },
      },
      detectores: {
        para: () => {
          llamadas.detector += 1;
          return cambios.detector ?? detectorDeSecretos;
        },
      },
      pseudonimos: { nuevo: cambios.pseudonimo ?? (() => 'psd_Fijo0001') },
      appEnv: Object.hasOwn(cambios, 'appEnv') ? cambios.appEnv : 'test',
      expresionesDeFecha: FECHAS,
      registrar: (linea: Record<string, unknown>) => {
        lineas.push(linea);
      },
    },
  };
}

describe('enmascararTextoLibre', () => {
  it('enmascara cada cadena del contexto y conserva null, números y la estructura', () => {
    const contexto = {
      ...CONTEXTO_VACIO,
      events: [
        {
          dataRef: 'r1',
          eventType: 'evolucion',
          monthsAgo: 2,
          description: 'dato SECRETO aquí',
          provenance: {},
        },
      ],
      diagnosis: null,
    } as unknown as ContextoPermitido;

    const { contexto: enmascarado, findingTypes } = enmascararTextoLibre(
      contexto,
      detectorDeSecretos,
    );

    expect(enmascarado.events[0]).toMatchObject({
      description: 'dato [X] aquí',
      monthsAgo: 2,
      dataRef: 'r1',
    });
    expect(enmascarado.diagnosis).toBeNull();
    expect(findingTypes).toEqual(['secreto']);
  });

  it('no modifica el contexto de entrada', () => {
    const contexto = {
      ...CONTEXTO_VACIO,
      attributes: [{ dataRef: 'r1', key: 'k', value: 'SECRETO', monthsAgo: null }],
    } as unknown as ContextoPermitido;

    enmascararTextoLibre(contexto, detectorDeSecretos);

    expect(contexto.attributes[0]).toMatchObject({ value: 'SECRETO' });
  });
});

describe('verificarDesidentificado', () => {
  const valido = { ...CONTEXTO_VACIO, pseudoPatientId: 'psd_Fijo0001' };

  it('acepta un contexto sin fechas absolutas ni notas', () => {
    expect(() => verificarDesidentificado(valido, 'pregunta', FECHAS)).not.toThrow();
  });

  it('rechaza un contexto con una cadena AAAA-MM-DD', () => {
    const conFecha = { ...valido, missingCriticalData: ['biopsia del 2024-03-15'] };

    expect(() => verificarDesidentificado(conFecha, 'pregunta', FECHAS)).toThrow();
  });

  it('rechaza una pregunta con una fecha AAAA-MM-DD', () => {
    expect(() => verificarDesidentificado(valido, 'tras el 2024-03-15', FECHAS)).toThrow();
  });

  it.each(['control de marzo 2024', 'el 15.03.2024', 'el 2024/03/15', 'el 15 mar 2024'])(
    'rechaza un contexto que todavía trae la fecha absoluta %s',
    (fecha) => {
      const conFecha = { ...valido, missingCriticalData: [fecha] };

      expect(() => verificarDesidentificado(conFecha, 'pregunta', FECHAS)).toThrow();
      expect(() => verificarDesidentificado(valido, fecha, FECHAS)).toThrow();
    },
  );

  it('rechaza un contexto con notas no vacías', () => {
    const conNotas = {
      ...valido,
      clinicalNotes: [{ dataRef: 'r9' }],
    } as unknown as typeof valido;

    expect(() => verificarDesidentificado(conNotas, 'pregunta', FECHAS)).toThrow();
  });
});

describe('crearContextDeidentifier', () => {
  it('devuelve el seudónimo después del contexto, las notas vacías y la pregunta enmascarada', async () => {
    const { dependencias: deps } = dependencias();

    const salida = await crearContextDeidentifier(deps).desidentificar({
      ...ENTRADA,
      query: 'dato SECRETO',
    });

    expect(salida.query).toBe('dato [X]');
    expect(salida.clinicalContext.pseudoPatientId).toBe('psd_Fijo0001');
    expect(salida.clinicalContext.clinicalNotes).toEqual([]);
    expect(Object.keys(salida.clinicalContext).at(-1)).toBe('pseudoPatientId');
  });

  it('pide un seudónimo nuevo en cada consulta', async () => {
    let n = 0;
    const { dependencias: deps } = dependencias({ pseudonimo: () => `psd_Consulta${++n}` });
    const desidentificador = crearContextDeidentifier(deps);

    const primera = await desidentificador.desidentificar(ENTRADA);
    const segunda = await desidentificador.desidentificar(ENTRADA);

    expect(primera.clinicalContext.pseudoPatientId).toBe('psd_Consulta1');
    expect(segunda.clinicalContext.pseudoPatientId).toBe('psd_Consulta2');
  });

  it('descarta las notas aunque el contexto de entrada las traiga', async () => {
    const { dependencias: deps } = dependencias();
    const conNotas = { ...CONTEXTO_VACIO, clinicalNotes: [{ dataRef: 'r9' }] } as never;

    const salida = await crearContextDeidentifier(deps).desidentificar({
      ...ENTRADA,
      contexto: conNotas,
    });

    expect(salida.clinicalContext.clinicalNotes).toEqual([]);
  });

  it('lanza DesidentificacionNoDisponible sin llamar al detector cuando el lector de identidad falla', async () => {
    const { dependencias: deps, llamadas } = dependencias({
      leer: () => Promise.reject(new Error('fallo con dato SECRETO')),
    });

    await expect(crearContextDeidentifier(deps).desidentificar(ENTRADA)).rejects.toBeInstanceOf(
      DesidentificacionNoDisponible,
    );
    expect(llamadas.detector).toBe(0);
  });

  it('lanza DesidentificacionNoDisponible y no filtra el mensaje original cuando el detector falla', async () => {
    const { dependencias: deps } = dependencias({
      detector: {
        enmascarar: () => {
          throw new Error('fallo con dato SECRETO');
        },
      },
    });

    const error = await crearContextDeidentifier(deps)
      .desidentificar(ENTRADA)
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DesidentificacionNoDisponible);
    expect((error as Error).message).not.toContain('SECRETO');
  });

  it('lanza DesidentificacionNoDisponible cuando el resultado todavía trae una fecha AAAA-MM-DD', async () => {
    const { dependencias: deps } = dependencias();
    const conFecha = { ...CONTEXTO_VACIO, missingCriticalData: ['2024-03-15'] };

    await expect(
      crearContextDeidentifier(deps).desidentificar({ ...ENTRADA, contexto: conFecha }),
    ).rejects.toBeInstanceOf(DesidentificacionNoDisponible);
  });

  it('aplica la guarda de entorno antes de leer la identidad o construir el detector', async () => {
    const { dependencias: deps, llamadas } = dependencias({ appEnv: 'piloto' });

    await expect(crearContextDeidentifier(deps).desidentificar(ENTRADA)).rejects.toBeInstanceOf(
      EntornoNoSintetico,
    );
    expect(llamadas).toEqual({ identidad: 0, detector: 0 });
  });

  it('registra traceId, patientId, tipos y conteo, sin la pregunta ni los valores', async () => {
    const { dependencias: deps, lineas } = dependencias();

    await crearContextDeidentifier(deps).desidentificar({ ...ENTRADA, query: 'dato SECRETO' });

    expect(lineas).toEqual([
      {
        event: 'desidentificacion.enmascarado',
        traceId: 'req_Test0001',
        patientId: 'paciente-sintetico',
        findingTypes: ['secreto'],
        hallazgos: 1,
      },
    ]);
  });

  it('registra el fallo sin el mensaje de la excepción', async () => {
    const { dependencias: deps, lineas } = dependencias({
      leer: () => Promise.reject(new Error('fallo con dato SECRETO')),
    });

    await crearContextDeidentifier(deps)
      .desidentificar(ENTRADA)
      .catch(() => undefined);

    expect(lineas).toEqual([
      {
        event: 'desidentificacion.fallo',
        traceId: 'req_Test0001',
        patientId: 'paciente-sintetico',
      },
    ]);
  });
});
