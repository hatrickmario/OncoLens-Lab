import { Router } from 'express';
import type { Registrar } from '../../infrastructure/logger.js';
import type { TraceIdGenerator } from '../evidence-analysis/ports.js';
import type { CompletenessService } from './ports.js';

export interface DependenciasDelController {
  service: CompletenessService;
  traceIds: TraceIdGenerator;
  registrar: Registrar;
}

/** Esqueleto de `GET /platform/patients/{patientId}/completeness` (L1D-95): se implementa en el commit feat. */
export function completenessController(_dependencias: DependenciasDelController): Router {
  const router = Router();
  router.get('/patients/:patientId/completeness', () => {
    throw new Error('no implementado');
  });
  return router;
}
