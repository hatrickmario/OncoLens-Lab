import { Router } from 'express';

export interface InformacionDeSalud {
  readonly configKeys: readonly string[];
  readonly serviceVersion: string;
}

/**
 * `GET /health` (contrato: getHealth). Solo indica que el proceso está listo.
 * No consulta a rag-orchestrator: con el LLM caído sigue respondiendo 200 (US-034 AC-4).
 */
export function createHealthRouter(): Router {
  const router = Router();
  router.get('/health', (_request, response) => {
    response.json({ status: 'ok' });
  });
  return router;
}
