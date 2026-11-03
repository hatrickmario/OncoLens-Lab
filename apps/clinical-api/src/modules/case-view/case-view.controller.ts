import { Router, type RequestHandler } from 'express';
import { rechazarNoEncontrado } from '../../infrastructure/http-errores.js';
import type { Registrar } from '../../infrastructure/logger.js';
import type { TraceIdGenerator } from '../../infrastructure/trace-id-generator.js';
import { authorize } from '../../middleware/authorize.js';
import { crearTraceIdMiddleware, traceIdDe } from '../../middleware/trace-id.middleware.js';
import { PacienteNoEncontradoError } from '../compartido/pacientes.errores.js';
import { leerIdDePaciente } from './case-view.schema.js';
import { comoCaseView } from './case-view.vista.js';
import type { CaseViewService } from './ports.js';

export interface DependenciasDelController {
  service: CaseViewService;
  traceIds: TraceIdGenerator;
  registrar: Registrar;
}

const EVENTO_VISTA_DE_CASO = 'case_view.consulta';

function crearConsultar(service: CaseViewService, registrar: Registrar): RequestHandler {
  return async (request, response) => {
    const paciente = leerIdDePaciente(request.params);
    if (paciente === undefined) {
      rechazarNoEncontrado(response, registrar, EVENTO_VISTA_DE_CASO);
      return;
    }
    try {
      const vista = comoCaseView(await service.obtener(paciente));
      // Solo UUID, traceId y resultado: nunca la description, los valores ni los fármacos (RN-10, [S5 resp. 12]).
      registrar({
        event: EVENTO_VISTA_DE_CASO,
        resultado: 'ok',
        traceId: traceIdDe(response),
        patientId: paciente,
      });
      // La description llega sin enmascarar al oncólogo autorizado: ni el navegador ni un intermedio la guardan.
      response.setHeader('Cache-Control', 'no-store');
      response.status(200).json(vista);
    } catch (error) {
      if (!(error instanceof PacienteNoEncontradoError)) throw error;
      rechazarNoEncontrado(response, registrar, EVENTO_VISTA_DE_CASO);
    }
  };
}

/**
 * `GET /platform/patients/{patientId}/case` (se monta bajo `/platform`, detrás del guard de sesión). Solo traduce
 * HTTP ↔ service; el administrador recibe 403 sin llegar al service (mínimo privilegio, PRD v1.4 §11).
 */
export function caseViewController(dependencias: DependenciasDelController): Router {
  const { service, traceIds, registrar } = dependencias;
  const router = Router();
  router.get(
    '/patients/:patientId/case',
    crearTraceIdMiddleware(traceIds),
    authorize('clinical:read'), // x-permission de getPatientCase
    crearConsultar(service, registrar),
  );
  return router;
}
