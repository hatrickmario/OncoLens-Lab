import { Router } from 'express';
import type { Registrar } from '../../infrastructure/logger.js';
import type { TraceIdGenerator } from '../../infrastructure/trace-id-generator.js';
import { authorize } from '../../middleware/authorize.js';
import { crearTraceIdMiddleware } from '../../middleware/trace-id.middleware.js';
import type { CaseViewService } from './ports.js';

export interface DependenciasDelController {
  service: CaseViewService;
  traceIds: TraceIdGenerator;
  registrar: Registrar;
}

export function caseViewController(dependencias: DependenciasDelController): Router {
  const router = Router();
  router.get(
    '/patients/:patientId/case',
    crearTraceIdMiddleware(dependencias.traceIds),
    authorize('clinical:read'), // x-permission de getPatientCase
    () => {
      throw new Error('no implementado');
    },
  );
  return router;
}
