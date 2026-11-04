import express, { Router } from 'express';
import type { Registrar } from '../../infrastructure/logger.js';
import type { TraceIdGenerator } from '../../infrastructure/trace-id-generator.js';
import { authorize } from '../../middleware/authorize.js';
import { crearTraceIdMiddleware } from '../../middleware/trace-id.middleware.js';
import { crearCuerpoIlegible } from '../compartido/http-escritura.js';
import { crearRegistroHttp } from '../compartido/registro-http.js';
import { leerCuerpoDeTratamiento } from './prior-treatments.schema.js';
import type { PriorTreatmentsService } from './prior-treatments.service.js';

export interface DependenciasDelController {
  /** El service de UNA petición: recibe el `traceId` para que el log de la normalización lo lleve. */
  servicioPara: (traceId: string) => PriorTreatmentsService;
  traceIds: TraceIdGenerator;
  registrar: Registrar;
}

const EVENTO_TRATAMIENTO = 'prior_treatments.registro';

/**
 * `POST /platform/patients/{id}/prior-treatments` (se monta bajo `/platform`, detrás del guard). Solo traduce HTTP ↔
 * service: `authorize` corre antes de leer el cuerpo (403 sin efectos) y el log nunca lleva el esquema escrito.
 */
export function priorTreatmentsController(dependencias: DependenciasDelController): Router {
  const router = Router();
  router.post(
    '/patients/:patientId/prior-treatments',
    crearTraceIdMiddleware(dependencias.traceIds),
    authorize('clinical:write'), // x-permission de createManualPriorTreatment
    express.json(),
    crearRegistroHttp(dependencias, {
      evento: EVENTO_TRATAMIENTO,
      leerCuerpo: leerCuerpoDeTratamiento,
      ejecutar: (servicio, solicitud) => servicio.registrarTratamiento(solicitud),
      etiquetasDelLog: (creado) => ({ mappingStatus: creado.mappingStatus }),
    }),
    crearCuerpoIlegible(dependencias.registrar, EVENTO_TRATAMIENTO),
  );
  return router;
}
