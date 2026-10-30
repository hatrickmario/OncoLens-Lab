import { Router, type RequestHandler, type Response } from 'express';
import { enviarError } from '../../infrastructure/http-errores.js';
import type { Registrar } from '../../infrastructure/logger.js';
import { authorize } from '../../middleware/authorize.js';
import type { TraceIdGenerator } from '../evidence-analysis/ports.js';
import { crearTraceIdMiddleware } from '../evidence-analysis/trace-id.middleware.js';
import { PacienteNoEncontradoError } from '../patients/patients.errores.js';
import { idDePacienteSchema } from './completeness.schema.js';
import { comoVistaDelChecklist } from './completeness.vista.js';
import type { CompletenessService } from './ports.js';

export interface DependenciasDelController {
  service: CompletenessService;
  traceIds: TraceIdGenerator;
  registrar: Registrar;
}

const EVENTO_COMPLETITUD = 'completeness.consulta';

const traceIdDe = (response: Response): string => response.locals.traceId ?? '';

/** `404 NO_ENCONTRADO` sin eco: lo mismo para un UUID inexistente que para un identificador mal formado. */
function rechazarPacienteNoEncontrado(response: Response, registrar: Registrar): void {
  registrar({
    event: EVENTO_COMPLETITUD,
    resultado: 'no_encontrado',
    traceId: traceIdDe(response),
  });
  enviarError(response, 404, 'NO_ENCONTRADO', traceIdDe(response));
}

function crearConsultar(service: CompletenessService, registrar: Registrar): RequestHandler {
  return async (request, response) => {
    const patientId = idDePacienteSchema.safeParse(request.params['patientId']);
    if (!patientId.success) {
      rechazarPacienteNoEncontrado(response, registrar);
      return;
    }
    try {
      const checklist = await service.calcular(patientId.data);
      const vista = comoVistaDelChecklist(checklist);
      // Solo UUID, traceId, versión del catálogo y conteos: nunca etiquetas, valores ni el error de la base (RN-10).
      registrar({
        event: EVENTO_COMPLETITUD,
        resultado: 'ok',
        traceId: traceIdDe(response),
        patientId: patientId.data,
        catalogVersion: vista.catalogVersion,
        total: vista.items.length,
        faltantes: vista.items.filter((item) => item.status === 'faltante').length,
      });
      response.setHeader('Cache-Control', 'no-store');
      response.status(200).json(vista);
    } catch (error) {
      if (!(error instanceof PacienteNoEncontradoError)) throw error;
      rechazarPacienteNoEncontrado(response, registrar);
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
