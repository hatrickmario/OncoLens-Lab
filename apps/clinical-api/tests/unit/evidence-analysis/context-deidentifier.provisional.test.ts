import { describe, expect, it } from 'vitest';
import {
  DesidentificacionProvisionalRechazada,
  crearDesidentificadorProvisional,
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

const ENTRADA_BASE = { traceId: 'req_Test0001', patientId: 'paciente-sintetico' } as const;

describe('crearDesidentificadorProvisional', () => {
  it('asigna el seudónimo del generador, deja la pregunta y conserva el contexto cuando el caso es sintético en test', async () => {
    const desidentificador = crearDesidentificadorProvisional({
      pseudonimos: { nuevo: () => 'psd_Fijo0001' },
      appEnv: 'test',
    });

    const salida = await desidentificador.desidentificar({
      ...ENTRADA_BASE,
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
      ...ENTRADA_BASE,
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
        ...ENTRADA_BASE,
        contexto: CONTEXTO_VACIO,
        query: 'q',
        dataOrigin: 'sintetico',
      }),
    ).rejects.toBeInstanceOf(DesidentificacionProvisionalRechazada);
    expect(pedidos).toBe(0);
  });
});
