import { Router } from 'express';
import type { Registrar } from '../../infrastructure/logger.js';
import type { TraceIdGenerator } from '../../infrastructure/trace-id-generator.js';
import type { CorrectionsService } from './corrections.service.js';

export interface DependenciasDelController {
  /** El service de UNA petición: recibe el `traceId` para que el log de la normalización lo lleve. */
  servicioPara: (traceId: string) => CorrectionsService;
  traceIds: TraceIdGenerator;
  registrar: Registrar;
}

const noImplementado = (): never => {
  throw new Error('no implementado');
};

/** `POST …/corrections` y `GET …/history|clinical-notes` (se montan bajo `/platform`, detrás del guard). */
export function correctionsController(_dependencias: DependenciasDelController): Router {
  const router = Router();
  router.post('/patients/:patientId/biomarkers/:biomarkerId/corrections', noImplementado);
  router.get('/patients/:patientId/biomarkers/:biomarkerId/history', noImplementado);
  router.get('/patients/:patientId/clinical-notes', noImplementado);
  router.post('/patients/:patientId/clinical-notes/:noteId/corrections', noImplementado);
  router.get('/patients/:patientId/clinical-notes/:noteId/history', noImplementado);
  return router;
}
