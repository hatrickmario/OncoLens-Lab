import type { Client } from 'pg';
import { describe, expect, inject, it } from 'vitest';
import { conTransaccionRevertida, esperarRechazo } from '../../support/db.js';
import {
  filaDeAnalisis,
  filaDeAnalisisConEvidencia,
  filaDeAnalisisTipoNoHabilitado,
  filaDeResumenDeCaso,
  filaDeSeguimiento,
  generadorDeIds,
  INSTANTE_FIJO,
  insertar,
  insertarContextoClinico,
  sqlInsertar,
  type Fila,
  type GeneradorDeIds,
} from '../../support/filas-sinteticas.js';

const urlBase = inject('urlBaseDeTest');
// Espacio de ids propio de este archivo (los archivos corren en paralelo sobre una sola base).
const ESPACIO_DE_IDS = 7;

interface Contexto {
  patientId: string;
  episodeId: string;
  userId: string;
}
type Constructor = (ids: GeneradorDeIds, patientId: string, episodeId: string, requestedBy: string, resto?: Fila) => Fila;

async function conContexto<T>(cuerpo: (cliente: Client, ids: GeneradorDeIds, contexto: Contexto) => Promise<T>): Promise<T> {
  return conTransaccionRevertida(urlBase, async (cliente) => {
    const ids = generadorDeIds(ESPACIO_DE_IDS);
    return cuerpo(cliente, ids, await insertarContextoClinico(cliente, ids));
  });
}

async function restriccionViolada(cliente: Client, constructor: Constructor, ids: GeneradorDeIds, c: Contexto, variante: Fila) {
  const { sql, valores } = sqlInsertar('clinical.ai_analysis_record', constructor(ids, c.patientId, c.episodeId, c.userId, variante));
  return (await esperarRechazo(cliente, sql, valores)).constraint;
}

// Reglas por estado y tipo de data-model.md §4.3 (US-038 AC-4, RN-02, RN-12): cada estado acepta lo válido y rechaza lo inválido.
const ESTADOS: Array<{ estado: string; constructor: Constructor; invalidos: Array<[string, Fila, string]> }> = [
  {
    estado: 'con_evidencia',
    constructor: filaDeAnalisisConEvidencia,
    invalidos: [
      ['sin llm_model', { llm_model: null }, 'ai_analysis_record_con_evidencia_ck'],
      ['sin nli_model', { nli_model: null }, 'ai_analysis_record_con_evidencia_ck'],
      ['sin embedding_model', { embedding_model: null }, 'ai_analysis_record_con_evidencia_ck'],
      ['sin reranker_model', { reranker_model: null }, 'ai_analysis_record_con_evidencia_ck'],
      ['sin prompt_version', { prompt_version: null }, 'ai_analysis_record_con_evidencia_ck'],
      ['sin puntaje', { top_relevance_score: null }, 'ai_analysis_record_puntaje_estado_ck'],
      ['con puntaje fuera de 0..1', { top_relevance_score: 1.5 }, 'ai_analysis_record_puntaje_rango_ck'],
      ['con llm_provider desconocido', { llm_provider: 'otro' }, 'ai_analysis_record_llm_provider_ck'],
    ],
  },
  {
    estado: 'sin_evidencia',
    constructor: filaDeAnalisis,
    invalidos: [
      ['con puntaje 0.0 en lugar de NULL', { top_relevance_score: 0 }, 'ai_analysis_record_puntaje_estado_ck'],
      ['con opciones de evidencia', { evidence_options: JSON.stringify([{ option: 'x' }]) }, 'ai_analysis_record_opciones_ck'],
    ],
  },
  {
    estado: 'tipo_no_habilitado',
    constructor: filaDeAnalisisTipoNoHabilitado,
    invalidos: [
      ['con llm_provider', { llm_provider: 'local' }, 'ai_analysis_record_tipo_no_habilitado_ck'],
      ['con llm_model', { llm_model: 'modelo-fingido' }, 'ai_analysis_record_tipo_no_habilitado_ck'],
      ['con nli_model', { nli_model: 'nli-fingido' }, 'ai_analysis_record_tipo_no_habilitado_ck'],
      ['con embedding_model', { embedding_model: 'embeddings-fingidos' }, 'ai_analysis_record_tipo_no_habilitado_ck'],
      ['con reranker_model', { reranker_model: 'reranker-fingido' }, 'ai_analysis_record_tipo_no_habilitado_ck'],
      ['con prompt_version', { prompt_version: 'prompt-v0' }, 'ai_analysis_record_tipo_no_habilitado_ck'],
      ['con corpus_release', { corpus_release: 'corpus-sintetico' }, 'ai_analysis_record_tipo_no_habilitado_ck'],
      ['con retrieval_params', { retrieval_params: JSON.stringify({}) }, 'ai_analysis_record_tipo_no_habilitado_ck'],
      ['con puntaje', { top_relevance_score: 0.5 }, 'ai_analysis_record_puntaje_estado_ck'],
    ],
  },
  {
    estado: 'resumen_caso',
    constructor: filaDeResumenDeCaso,
    invalidos: [
      ['con embedding_model', { embedding_model: 'embeddings-fingidos' }, 'ai_analysis_record_resumen_caso_ck'],
      ['con reranker_model', { reranker_model: 'reranker-fingido' }, 'ai_analysis_record_resumen_caso_ck'],
      ['con corpus_release', { corpus_release: 'corpus-sintetico' }, 'ai_analysis_record_resumen_caso_ck'],
      ['con retrieval_params', { retrieval_params: JSON.stringify({}) }, 'ai_analysis_record_resumen_caso_ck'],
      ['con puntaje de recuperación', { top_relevance_score: 0.5 }, 'ai_analysis_record_resumen_caso_ck'],
      ['sin llm_model', { llm_model: null }, 'ai_analysis_record_con_evidencia_ck'],
      ['sin prompt_version', { prompt_version: null }, 'ai_analysis_record_con_evidencia_ck'],
    ],
  },
];

const CASOS_INVALIDOS = ESTADOS.flatMap(({ estado, constructor, invalidos }) =>
  invalidos.map(([caso, variante, restriccion]) => ({ estado, constructor, caso, variante, restriccion })),
);

describe('clinical.ai_analysis_record por estado y tipo', () => {
  it.each(ESTADOS)('guarda el análisis válido en $estado [US-038 AC-4]', async ({ constructor }) => {
    await conContexto(async (cliente, ids, c) => {
      const guardada = await insertar(cliente, 'clinical.ai_analysis_record', constructor(ids, c.patientId, c.episodeId, c.userId));

      expect(guardada.id).toBeDefined();
    });
  });

  it.each(CASOS_INVALIDOS)('rechaza por $restriccion el análisis en $estado $caso [US-038 AC-4]', async ({ constructor, variante, restriccion }) => {
    await conContexto(async (cliente, ids, c) => {
      expect(await restriccionViolada(cliente, constructor, ids, c, variante)).toBe(restriccion);
    });
  });

  it('conserva top_relevance_score NULL y no 0.0 cuando el tipo no está habilitado [US-038 AC-4]', async () => {
    await conContexto(async (cliente, ids, c) => {
      const guardada = await insertar(cliente, 'clinical.ai_analysis_record', filaDeAnalisisTipoNoHabilitado(ids, c.patientId, c.episodeId, c.userId));
      const { rows } = await cliente.query('SELECT top_relevance_score IS NULL AS es_nulo FROM clinical.ai_analysis_record WHERE id = $1', [guardada.id]);

      expect(rows[0]).toEqual({ es_nulo: true });
    });
  });
});

describe('clinical.analysis_follow_up inmutable', () => {
  it('rechaza por el trigger y deja el turno intacto cuando se actualiza cualquier columna [US-038 AC-4]', async () => {
    await conContexto(async (cliente, ids, c) => {
      const analisis = await insertar(cliente, 'clinical.ai_analysis_record', filaDeAnalisis(ids, c.patientId, c.episodeId, c.userId));
      const turno = await insertar(cliente, 'clinical.analysis_follow_up', filaDeSeguimiento(ids, analisis.id as string));

      const error = await esperarRechazo(cliente, 'UPDATE clinical.analysis_follow_up SET omitted_claims = 5 WHERE id = $1', [turno.id]);
      const { rows } = await cliente.query('SELECT omitted_claims FROM clinical.analysis_follow_up WHERE id = $1', [turno.id]);

      expect(error.message).toContain('analysis_follow_up es inmutable (RN-06)');
      expect(rows[0]).toEqual({ omitted_claims: 0 });
    });
  });
});

describe('clinical.care_episode cierre coherente', () => {
  it.each([
    ['cierra sin responsable', 'UPDATE clinical.care_episode SET closed_at = $2, closed_by = NULL WHERE patient_id = $1'],
    ['registra responsable sin cierre', 'UPDATE clinical.care_episode SET closed_by = $2 WHERE patient_id = $1'],
    ['registra motivo de cierre sin cierre', 'UPDATE clinical.care_episode SET closure_reason = $2 WHERE patient_id = $1'],
  ])('rechaza por care_episode_cierre_ck el episodio que %s [US-038 AC-1]', async (_caso, sql) => {
    await conContexto(async (cliente, _ids, c) => {
      const valor = sql.includes('closed_at') ? INSTANTE_FIJO : sql.includes('closed_by') ? c.userId : 'alta_sintetica';

      const error = await esperarRechazo(cliente, sql, [c.patientId, valor]);

      expect(error.constraint).toBe('care_episode_cierre_ck');
    });
  });
});
