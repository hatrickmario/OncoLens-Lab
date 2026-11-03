import express, { Router, type RequestHandler } from 'express';
import type { Registrar } from '../../infrastructure/logger.js';
import { authorize } from '../../middleware/authorize.js';
import { crearTraceIdMiddleware } from '../../middleware/trace-id.middleware.js';
import type { FollowUpService } from './follow-up.service.js';
import type { TraceIdGenerator } from './ports.js';

export interface DependenciasDelControllerDeSeguimiento {
  service: FollowUpService;
  traceIds: TraceIdGenerator;
  registrar: Registrar;
}

/**
 * `POST` y `GET /evidence-analyses/{analysisId}/follow-ups` (se monta bajo `/platform`, detrás del guard de sesión).
 * Solo traduce HTTP ↔ service.
 */
export function followUpController(dependencias: DependenciasDelControllerDeSeguimiento): Router {
  const { service, traceIds } = dependencias;
  void service;
  const router = Router();
  const noImplementado: RequestHandler = () => {
    throw new Error('no implementado');
  };
  router.post(
    '/evidence-analyses/:analysisId/follow-ups',
    crearTraceIdMiddleware(traceIds),
    authorize('follow_ups:create'),
    express.json(),
    noImplementado,
  );
  router.get(
    '/evidence-analyses/:analysisId/follow-ups',
    crearTraceIdMiddleware(traceIds),
    authorize('follow_ups:read'),
    noImplementado,
  );
  return router;
}
