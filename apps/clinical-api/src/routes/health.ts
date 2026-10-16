import { Router } from 'express';

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
