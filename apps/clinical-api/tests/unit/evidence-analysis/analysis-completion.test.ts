import { describe, expect, it } from 'vitest';
import conEvidencia from '../../../../../contracts/examples/rag-query-con-evidencia.json' with { type: 'json' };
import sinEvidencia from '../../../../../contracts/examples/rag-query-sin-evidencia.json' with { type: 'json' };
import peticion from '../../../../../contracts/examples/rag-query-request.json' with { type: 'json' };
import type { RagQueryInternalRequest } from '../../../../../packages/api-contracts/src/client/rag-orchestrator/index.js';
import { crearBaseDelAnalisisS1 } from '../../../src/modules/evidence-analysis/analysis-basis.js';
import type { RegistroDeAnalisis } from '../../../src/modules/evidence-analysis/analysis-record.js';
import type { EntradaDeCierre } from '../../../src/modules/evidence-analysis/ports.js';
import {
  FalloDePersistenciaError,
  RespuestaInternaInvalidaError,
  crearAnalysisCompletion,
  topRelevanceScorePersistible,
  validarRespuestaInterna,
} from '../../../src/modules/evidence-analysis/analysis-completion.js';

const copia = <T>(valor: T): T => structuredClone(valor);

describe('validarRespuestaInterna', () => {
  it('devuelve la respuesta cuando cumple RagQueryInternalResponse', () => {
    expect(validarRespuestaInterna(copia(conEvidencia)).topRelevanceScore).toBe(0.87);
    expect(validarRespuestaInterna(copia(sinEvidencia)).topRelevanceScore).toBeNull();
  });

  it('lanza RespuestaInternaInvalidaError cuando falta el bloque meta', () => {
    const sinMeta = Object.fromEntries(
      Object.entries(copia(conEvidencia)).filter(([campo]) => campo !== 'meta'),
    );

    expect(() => validarRespuestaInterna(sinMeta)).toThrow(RespuestaInternaInvalidaError);
  });

  it('lanza RespuestaInternaInvalidaError cuando trae una propiedad que el contrato no declara', () => {
    expect(() => validarRespuestaInterna({ ...copia(conEvidencia), recommendations: [] })).toThrow(
      RespuestaInternaInvalidaError,
    );
  });

  it('lanza RespuestaInternaInvalidaError sin eco del contenido cuando no es un objeto', () => {
    expect(() => validarRespuestaInterna('texto interno sintético')).toThrow(
      RespuestaInternaInvalidaError,
    );
    expect(() => validarRespuestaInterna('texto interno sintético')).not.toThrow(
      /texto interno sintético/,
    );
  });
});

describe('topRelevanceScorePersistible', () => {
  it('copia el puntaje de Backend 2 cuando hay evidencia', () => {
    expect(topRelevanceScorePersistible(validarRespuestaInterna(copia(conEvidencia)))).toBe(0.87);
  });

  it('conserva null cuando no hay evidencia', () => {
    expect(topRelevanceScorePersistible(validarRespuestaInterna(copia(sinEvidencia)))).toBeNull();
  });

  it('rechaza sin_evidencia con 0.0 porque null no es 0.0 (RN-02)', () => {
    const incoherente = validarRespuestaInterna({ ...copia(sinEvidencia), topRelevanceScore: 0 });

    expect(() => topRelevanceScorePersistible(incoherente)).toThrow(RespuestaInternaInvalidaError);
  });

  it('rechaza con_evidencia sin puntaje', () => {
    const incoherente = validarRespuestaInterna({
      ...copia(conEvidencia),
      topRelevanceScore: null,
    });

    expect(() => topRelevanceScorePersistible(incoherente)).toThrow(RespuestaInternaInvalidaError);
  });

  it('rechaza sin_evidencia que trae opciones', () => {
    const incoherente = validarRespuestaInterna({
      ...copia(sinEvidencia),
      evidenceOptions: copia(conEvidencia).evidenceOptions,
    });

    expect(() => topRelevanceScorePersistible(incoherente)).toThrow(RespuestaInternaInvalidaError);
  });
});

const UUID_FIJO = '00000000-0000-4000-8000-000000000001';

function entradaDeCierre(cuerpo: unknown): EntradaDeCierre {
  return {
    traceId: 'req_Fijo0001',
    patientId: 'paciente-sintetico',
    episodeId: 'episodio-sintetico',
    userId: 'usuario-sintetico',
    questionTemplateId: null,
    continueWithWarning: false,
    request: peticion as RagQueryInternalRequest,
    dataRefs: new Map(),
    respuesta: { ok: true, cuerpo: structuredClone(cuerpo) as never },
  };
}

function cierreConFake(persistir: (registro: RegistroDeAnalisis) => Promise<RegistroDeAnalisis>) {
  const persistidos: RegistroDeAnalisis[] = [];
  const cierre = crearAnalysisCompletion({
    analisis: {
      persistirAnalisis: async (registro) => {
        persistidos.push(registro);
        return persistir(registro);
      },
    },
    base: crearBaseDelAnalisisS1({ textoDelSupuesto: 'Supuesto sintético.' }),
    reloj: { now: () => new Date('2026-10-16T12:00:00.000Z') },
    idsDeAnalisis: () => UUID_FIJO,
    disclaimer: 'Aviso sintético.',
  });
  return { cierre, persistidos };
}

describe('crearAnalysisCompletion', () => {
  it('responde desde el registro que devolvió el repository, no desde la respuesta de Backend 2', async () => {
    const { cierre } = cierreConFake(async (registro) => ({ ...registro, id: 'id-de-la-fila' }));

    const resultado = await cierre.completar(entradaDeCierre(conEvidencia));

    expect(resultado).toMatchObject({ tipo: 'completado', cuerpo: { id: 'id-de-la-fila' } });
  });

  it('lanza FalloDePersistenciaError sin el mensaje de la base cuando el repository falla', async () => {
    const { cierre } = cierreConFake(async () => {
      throw new Error('valor sintético de la fila en el mensaje de PostgreSQL');
    });

    const fallo = await cierre.completar(entradaDeCierre(conEvidencia)).catch((e: unknown) => e);

    expect(fallo).toBeInstanceOf(FalloDePersistenciaError);
    expect((fallo as Error).message).not.toContain('valor sintético');
  });

  it('no persiste y devuelve un fallo 502 cuando la respuesta de Backend 2 no cumple el contrato', async () => {
    const { cierre, persistidos } = cierreConFake(async (registro) => registro);

    const resultado = await cierre.completar(entradaDeCierre({ status: 'con_evidencia' }));

    expect(resultado).toMatchObject({ tipo: 'fallo', respuesta: { status: 502 } });
    expect(persistidos).toEqual([]);
  });

  it('no persiste cuando el paciente no tiene episodio al que asociar el registro', async () => {
    const { cierre, persistidos } = cierreConFake(async (registro) => registro);

    await expect(
      cierre.completar({ ...entradaDeCierre(conEvidencia), episodeId: null }),
    ).rejects.toBeInstanceOf(FalloDePersistenciaError);
    expect(persistidos).toEqual([]);
  });
});
