import { describe, expect, it } from 'vitest';
import {
  DesidentificacionProvisionalRechazada,
  crearDesidentificadorProvisional,
  exigirEntornoSintetico,
} from '../../../src/modules/evidence-analysis/context-deidentifier.provisional.js';
import type { ContextoPermitido } from '../../../src/modules/evidence-analysis/ports.js';

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

function rechazoDe(accion: () => void): DesidentificacionProvisionalRechazada {
  try {
    accion();
  } catch (error) {
    if (error instanceof DesidentificacionProvisionalRechazada) return error;
    throw error;
  }
  throw new Error('debía rechazar y no lo hizo');
}

describe('exigirEntornoSintetico', () => {
  it.each(['local', 'test'])('deja pasar un caso sintético cuando APP_ENV es %s', (appEnv) => {
    expect(() => exigirEntornoSintetico('sintetico', appEnv)).not.toThrow();
  });

  it.each(['real_anonimizado', 'real_identificado'] as const)(
    'rechaza con motivo data_origin cuando el origen es %s',
    (origen) => {
      expect(rechazoDe(() => exigirEntornoSintetico(origen, 'test')).motivo).toBe('data_origin');
    },
  );

  it.each([['piloto'], [''], [undefined]])(
    'rechaza con motivo app_env cuando APP_ENV es %j',
    (appEnv) => {
      expect(rechazoDe(() => exigirEntornoSintetico('sintetico', appEnv)).motivo).toBe('app_env');
    },
  );

  it('informa data_origin antes que app_env cuando fallan ambos', () => {
    expect(rechazoDe(() => exigirEntornoSintetico('real_anonimizado', 'piloto')).motivo).toBe(
      'data_origin',
    );
  });
});

describe('crearDesidentificadorProvisional', () => {
  it('asigna el seudónimo del generador, deja la pregunta y conserva el contexto cuando el caso es sintético en test', async () => {
    const desidentificador = crearDesidentificadorProvisional({
      pseudonimos: { nuevo: () => 'psd_Fijo0001' },
      appEnv: 'test',
    });

    const salida = await desidentificador.desidentificar({
      contexto: CONTEXTO_VACIO,
      query: 'pregunta sintética',
      dataOrigin: 'sintetico',
    });

    expect(salida).toEqual({
      clinicalContext: { pseudoPatientId: 'psd_Fijo0001', ...CONTEXTO_VACIO },
      query: 'pregunta sintética',
    });
  });

  it('pide un seudónimo nuevo en cada consulta', async () => {
    let n = 0;
    const desidentificador = crearDesidentificadorProvisional({
      pseudonimos: { nuevo: () => `psd_Consulta${++n}` },
      appEnv: 'local',
    });
    const entrada = {
      contexto: CONTEXTO_VACIO,
      query: 'q',
      dataOrigin: 'sintetico' as const,
    };

    const primera = await desidentificador.desidentificar(entrada);
    const segunda = await desidentificador.desidentificar(entrada);

    expect(primera.clinicalContext.pseudoPatientId).toBe('psd_Consulta1');
    expect(segunda.clinicalContext.pseudoPatientId).toBe('psd_Consulta2');
  });

  it('rechaza sin pedir seudónimo cuando el entorno no es de pruebas', async () => {
    let pedidos = 0;
    const desidentificador = crearDesidentificadorProvisional({
      pseudonimos: {
        nuevo: () => {
          pedidos += 1;
          return 'psd_Nunca';
        },
      },
      appEnv: 'piloto',
    });

    await expect(
      desidentificador.desidentificar({
        contexto: CONTEXTO_VACIO,
        query: 'q',
        dataOrigin: 'sintetico',
      }),
    ).rejects.toBeInstanceOf(DesidentificacionProvisionalRechazada);
    expect(pedidos).toBe(0);
  });
});
