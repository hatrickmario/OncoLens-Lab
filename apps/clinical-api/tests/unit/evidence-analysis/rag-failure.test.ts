import { describe, expect, it } from 'vitest';
import {
  RESPUESTA_INTERNA_INVALIDA,
  mapearFalloRag,
} from '../../../src/modules/evidence-analysis/rag-failure.js';
import type { FalloDeRag } from '../../../src/modules/evidence-analysis/ports.js';

const fallo = (resto: Partial<FalloDeRag>): FalloDeRag => ({ ok: false, status: null, ...resto });

describe('mapearFalloRag', () => {
  it.each([
    ['venció el plazo local', fallo({ tiempoAgotado: true }), 504, 'DEADLINE_VENCIDO'],
    [
      '504 de rag-orchestrator',
      fallo({ status: 504, codigo: 'DEADLINE_VENCIDO' }),
      504,
      'DEADLINE_VENCIDO',
    ],
    [
      '503 LOCAL_LLM_UNAVAILABLE',
      fallo({ status: 503, codigo: 'LOCAL_LLM_UNAVAILABLE' }),
      503,
      'LOCAL_LLM_UNAVAILABLE',
    ],
    [
      '503 RETRIEVAL_UNAVAILABLE',
      fallo({ status: 503, codigo: 'RETRIEVAL_UNAVAILABLE' }),
      502,
      'ERROR_SERVICIO_IA',
    ],
    [
      '503 NLI_UNAVAILABLE',
      fallo({ status: 503, codigo: 'NLI_UNAVAILABLE' }),
      502,
      'ERROR_SERVICIO_IA',
    ],
    [
      '503 con código desconocido',
      fallo({ status: 503, codigo: 'OTRO' }),
      502,
      'ERROR_SERVICIO_IA',
    ],
    ['503 sin código', fallo({ status: 503 }), 502, 'ERROR_SERVICIO_IA'],
    [
      '422 TIPO_CANCER_NO_REGISTRADO',
      fallo({ status: 422, codigo: 'TIPO_CANCER_NO_REGISTRADO' }),
      422,
      'TIPO_CANCER_NO_REGISTRADO',
    ],
    [
      '422 de validación',
      fallo({ status: 422, codigo: 'CUERPO_INVALIDO' }),
      502,
      'ERROR_SERVICIO_IA',
    ],
    ['401', fallo({ status: 401, codigo: 'TOKEN_SERVICIO_INVALIDO' }), 502, 'ERROR_SERVICIO_IA'],
    ['500', fallo({ status: 500 }), 502, 'ERROR_SERVICIO_IA'],
    [
      '409 CATALOG_VERSION_MISMATCH',
      fallo({ status: 409, codigo: 'CATALOG_VERSION_MISMATCH' }),
      409,
      'CATALOG_VERSION_MISMATCH',
    ],
    ['409 con otro código', fallo({ status: 409, codigo: 'OTRO' }), 502, 'ERROR_SERVICIO_IA'],
    ['409 sin código', fallo({ status: 409 }), 502, 'ERROR_SERVICIO_IA'],
    [
      '429 (en el S1)',
      fallo({ status: 429, codigo: 'COLA_INFERENCIA_LLENA' }),
      502,
      'ERROR_SERVICIO_IA',
    ],
    ['error de red', fallo({ status: null }), 502, 'ERROR_SERVICIO_IA'],
  ])('traduce %s a %i %s', (_caso, entrada, status, codigo) => {
    expect(mapearFalloRag(entrada)).toMatchObject({ status, codigo });
  });

  it('da a cada fila una etiqueta de log propia y sin datos de la petición', () => {
    const etiquetas = [
      fallo({ tiempoAgotado: true }),
      fallo({ status: 503, codigo: 'LOCAL_LLM_UNAVAILABLE' }),
      fallo({ status: 503, codigo: 'RETRIEVAL_UNAVAILABLE' }),
      fallo({ status: 503, codigo: 'NLI_UNAVAILABLE' }),
      fallo({ status: 422, codigo: 'TIPO_CANCER_NO_REGISTRADO' }),
      fallo({ status: 422 }),
      fallo({ status: 401 }),
      fallo({ status: 409 }),
      fallo({ status: 429 }),
      fallo({ status: null }),
      fallo({ status: 500 }),
    ].map((entrada) => mapearFalloRag(entrada).resultado);

    expect(new Set(etiquetas).size).toBe(etiquetas.length);
    for (const etiqueta of etiquetas) expect(etiqueta).toMatch(/^[a-z_]+$/);
  });

  it('prioriza el plazo local vencido sobre cualquier estado HTTP', () => {
    expect(mapearFalloRag(fallo({ status: 503, tiempoAgotado: true }))).toMatchObject({
      status: 504,
    });
  });
});

describe('RESPUESTA_INTERNA_INVALIDA', () => {
  it('es un 502 ERROR_SERVICIO_IA', () => {
    expect(RESPUESTA_INTERNA_INVALIDA).toMatchObject({ status: 502, codigo: 'ERROR_SERVICIO_IA' });
  });
});
