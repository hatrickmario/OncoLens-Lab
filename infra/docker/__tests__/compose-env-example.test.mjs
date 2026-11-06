import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RAIZ, crearResolutor } from './lib/compose-resuelto.mjs';

let resolver;
let limpiar;

beforeAll(() => {
  ({ resolver, limpiar } = crearResolutor());
});

afterAll(() => limpiar());

const TOPE_MS = 60_000;

/**
 * Las variables RN-22 de cada `.env.example` deben LLEGAR al contenedor: Compose pasa el entorno de forma explícita
 * (sin `env_file` global, que filtraría secretos de un servicio a otro), así que una clave del ejemplo que no esté en
 * `environment` queda silenciosamente en el valor por defecto del código. Cada excepción lleva su motivo.
 */
const EXCEPCIONES_RAG = [
  { patron: /^CORPUS_(SEED_MANIFEST_PATH|ACCEPTED_LICENSES|EXCLUDED_SOURCES|CUTOFF_DATE|FETCH_.+|METADATA_.+|SPARSE_REINDEX_BATCH_SIZE|MIGRATOR_DATABASE_URL)$/, motivo: 'CLI de ingesta y migración del corpus, no el servicio HTTP' },
  { patron: /^(ALLOW_CC_BY_NC|PG_RAG_CORPUS_MIGRATOR_PASSWORD_FILE)$/, motivo: 'solo la CLI de ingesta / migrador' },
  { patron: /^MILVUS_(COLLECTION_NAME|SPARSE_.+|LEN_.+)$/, motivo: 'esquema de la colección de Milvus, fijo en código y versionado' },
  { patron: /^(EVAL_.+|JUEZ_.+|RETRIEVAL_REGRESSION_TOLERANCE)$/, motivo: 'suite evaluate (OL-06), no corre en el contenedor' },
  { patron: /^OCR_.+$/, motivo: 'OCR es Post-MVP (PRD E-17)' },
  // Deuda conocida: runtime del servicio que aún toma el valor por defecto del código. Se reporta en el PR; sácalas de aquí al añadirlas a Compose.
  { patron: /^(RETRIEVAL_MODE|RETRIEVAL_FUSION|RETRIEVAL_CANCER_TYPE_MAX_LENGTH|RRF_K|HYBRID_SPARSE_WEIGHT|DEFAULT_QUERY_LANGUAGE|EMBEDDING_SPARSE_WEIGHTS_PATH|EMBEDDING_SPARSE_WEIGHTS_SHA256|EMBEDDING_MAX_LENGTH|MODEL_INTRA_OP_THREADS|MODEL_BATCH_MAX_TOKENS|LLM_REQUEST_TIMEOUT_MS|LLM_NUM_CTX|LLM_TEMPERATURE|LLM_ALLOWED_HOSTS|PROMPT_VERSION|POPULATION_FALLBACK_DEADLINE_MS)$/, motivo: 'deuda: el Compose aún no las pasa (chore/s6-compose-env-vars)' },
];
const EXCEPCIONES_WEB = [{ patron: /^(E2E_.+|AI_DISCLAIMER_TEXT)$/, motivo: 'solo para los E2E de Playwright en el anfitrión' }];

function leerEjemplo(ruta) {
  return Object.fromEntries(
    readFileSync(path.join(RAIZ, ruta), 'utf8')
      .split('\n')
      .map((linea) => /^([A-Z][A-Z0-9_]*)=(.*)$/.exec(linea))
      .filter(Boolean)
      .map((m) => [m[1], m[2]]),
  );
}

function faltantes(ruta, excepciones, entorno) {
  return Object.keys(leerEjemplo(ruta)).filter((k) => !(k in entorno) && !excepciones.some((e) => e.patron.test(k)));
}

describe('docker-compose.yml · las claves de .env.example llegan al contenedor (RN-22)', () => {
  it('pasa a rag-orchestrator toda clave de su .env.example que no sea excepción justificada', () => {
    const entorno = resolver().services['rag-orchestrator'].environment;
    expect(faltantes('apps/rag-orchestrator/.env.example', EXCEPCIONES_RAG, entorno)).toEqual([]);
  }, TOPE_MS);

  it('pasa a web toda clave de su .env.example que no sea excepción justificada', () => {
    const entorno = resolver().services.web.environment;
    expect(faltantes('apps/web/.env.example', EXCEPCIONES_WEB, entorno)).toEqual([]);
  }, TOPE_MS);

  it('pasa a clinical-api toda clave de su .env.example', () => {
    const entorno = resolver().services['clinical-api'].environment;
    expect(faltantes('apps/clinical-api/.env.example', [], entorno)).toEqual([]);
  }, TOPE_MS);

  it('usa por defecto en Compose el mismo valor que .env.example en las claves del chat y del corte (CSP en aplicar)', () => {
    const resuelto = resolver();
    const ejemplo = leerEjemplo('apps/rag-orchestrator/.env.example');
    const rag = resuelto.services['rag-orchestrator'].environment;
    expect(resuelto.services.web.environment.WEB_CSP_MODO).toBe('aplicar');
    for (const k of ['CHAT_THREAD_TTL_SECONDS', 'CHAT_MAX_THREADS', 'CHAT_MEMORY_MAX_TOKENS', 'CHAT_NOTICE_AI', 'CHAT_NOTICE_ACADEMIC', 'CHAT_NOTICE_VERIFY', 'RERANKER_CUT_LOG_MAX_IDS']) {
      expect(String(rag[k]), k).toBe(ejemplo[k]);
    }
    expect(rag.LLM_TOKENIZER_PATH ?? '').toBe('');
  }, TOPE_MS);

  it('detecta una clave del ejemplo ausente de Compose', () => {
    const entorno = resolver().services.web.environment;
    const sinCsp = Object.fromEntries(Object.entries(entorno).filter(([k]) => k !== 'WEB_CSP_MODO'));
    expect(faltantes('apps/web/.env.example', EXCEPCIONES_WEB, sinCsp)).toEqual(['WEB_CSP_MODO']);
  }, TOPE_MS);
});
