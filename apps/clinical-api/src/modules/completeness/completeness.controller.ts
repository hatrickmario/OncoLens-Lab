import { Router, type RequestHandler } from 'express';
import { rechazarNoEncontrado } from '../../infrastructure/http-errores.js';
import type { Registrar } from '../../infrastructure/logger.js';
import { authorize } from '../../middleware/authorize.js';
import type { TraceIdGenerator } from '../../infrastructure/trace-id-generator.js';
import { crearTraceIdMiddleware, traceIdDe } from '../../middleware/trace-id.middleware.js';
import { PacienteNoEncontradoError } from '../patients/patients.errores.js';
import { faltantesDe } from './completeness.rules.js';
import { leerIdDePaciente } from './completeness.schema.js';
import { comoVistaDelChecklist } from './completeness.vista.js';
import type { CompletenessService } from './ports.js';

export interface DependenciasDelController {
  service: CompletenessService;
  traceIds: TraceIdGenerator;
  registrar: Registrar;
}

const EVENTO_COMPLETITUD = 'completeness.consulta';

function crearConsultar(service: CompletenessService, registrar: Registrar): RequestHandler {
  return async (request, response) => {
    const paciente = leerIdDePaciente(request.params);
    if (paciente === undefined) {
      rechazarNoEncontrado(response, registrar, EVENTO_COMPLETITUD);
      return;
    }
    try {
      const checklist = await service.calcular(paciente);
      const vista = comoVistaDelChecklist(checklist);
      // Solo UUID, traceId, versión del catálogo y conteos: nunca etiquetas, valores ni el error de la base (RN-10).
      registrar({
        event: EVENTO_COMPLETITUD,
        resultado: 'ok',
        traceId: traceIdDe(response),
        patientId: paciente,
        catalogVersion: vista.catalogVersion,
        total: vista.items.length,
        faltantes: faltantesDe(checklist).length,
      });
      response.setHeader('Cache-Control', 'no-store');
      response.status(200).json(vista);
    } catch (error) {
      if (!(error instanceof PacienteNoEncontradoError)) throw error;
      rechazarNoEncontrado(response, registrar, EVENTO_COMPLETITUD);
    }
  };
}

/**
 * `GET /platform/patients/{patientId}/completeness` (se monta bajo `/platform`, detrás del guard de sesión). Solo
 * traduce HTTP ↔ service; un faltante nunca produce 4xx (RN-26) y el administrador recibe 403 sin llegar al service.
 */
export function completenessController(dependencias: DependenciasDelController): Router {
  const { service, traceIds, registrar } = dependencias;
  const router = Router();
  router.get(
    '/patients/:patientId/completeness',
    crearTraceIdMiddleware(traceIds),
    authorize('clinical:read'), // x-permission de getCompleteness
    crearConsultar(service, registrar),
  );
  return router;
}
