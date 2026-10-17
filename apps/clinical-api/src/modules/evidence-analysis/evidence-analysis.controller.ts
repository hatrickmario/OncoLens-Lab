import { Router } from 'express';
import type { Registrar } from '../../infrastructure/logger.js';
import type { EvidenceAnalysisService } from './evidence-analysis.service.js';
import type { IdGenerator } from './ports.js';

export interface DependenciasDelController {
  service: EvidenceAnalysisService;
  ids: IdGenerator;
  registrar: Registrar;
}

/** `POST /evidence-analyses` (se monta bajo `/platform`, detrás del guard de sesión). */
export function evidenceAnalysisController(_dependencias: DependenciasDelController): Router {
  const router = Router();
  router.post('/evidence-analyses', () => {
    throw new Error('no implementado');
  });
  return router;
}
