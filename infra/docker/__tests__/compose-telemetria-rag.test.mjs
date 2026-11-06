import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearResolutor } from './lib/compose-resuelto.mjs';

let resolver;
let limpiar;

beforeAll(() => {
  ({ resolver, limpiar } = crearResolutor());
});

afterAll(() => limpiar());

const TOPE_MS = 60_000;

// L1D-316 (privacy-guardian Gate 2 #3): langgraph arrastra langsmith, que enviaría trazas de la conversación a un servicio
// externo si LANGSMITH_TRACING o LANGCHAIN_TRACING_V2 valieran true. El Compose las fija apagadas y sin endpoint (RN-10, RN-12).
describe('docker-compose.yml · telemetría de LangChain apagada en rag-orchestrator (L1D-316)', () => {
  it('fija LANGSMITH_TRACING y LANGCHAIN_TRACING_V2 en false y LANGSMITH_ENDPOINT vacío', () => {
    const entorno = resolver().services['rag-orchestrator'].environment;

    expect(entorno.LANGSMITH_TRACING).toBe('false');
    expect(entorno.LANGCHAIN_TRACING_V2).toBe('false');
    expect(entorno.LANGSMITH_ENDPOINT ?? '').toBe('');
    expect('LANGSMITH_ENDPOINT' in entorno).toBe(true);
  }, TOPE_MS);

  it('no deja que el entorno del anfitrión las encienda', () => {
    const entorno = resolver({ entorno: { LANGSMITH_TRACING: 'true', LANGCHAIN_TRACING_V2: 'true' } }).services['rag-orchestrator'].environment;

    expect(entorno.LANGSMITH_TRACING).toBe('false');
    expect(entorno.LANGCHAIN_TRACING_V2).toBe('false');
  }, TOPE_MS);
});
