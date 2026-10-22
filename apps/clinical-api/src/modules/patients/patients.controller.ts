import { Router, type RequestHandler, type Response } from 'express';
import { enviarError } from '../../infrastructure/http-errores.js';
import type { Registrar } from '../../infrastructure/logger.js';
import { authorize } from '../../middleware/authorize.js';
import { vistaSegunPermiso } from '../../middleware/vista-segun-permiso.js';
import type { TraceIdGenerator } from '../evidence-analysis/ports.js';
import { crearTraceIdMiddleware } from '../evidence-analysis/trace-id.middleware.js';
import { leerFiltrosDelListado } from './patients.schema.js';
import type { PatientsService, VistaDeListado } from './patients.service.js';

export interface DependenciasDelController {
  service: PatientsService;
  traceIds: TraceIdGenerator;
  registrar: Registrar;
}

const EVENTO_LISTADO = 'patients.listado';

/**
 * `GET /patients` (se monta bajo `/platform`, detrás del guard de sesión). Solo traduce HTTP ↔ service. El log lleva
 * evento, resultado, `traceId` y el total: nunca filtros con identidad, cuerpos ni datos del paciente (RN-10).
 */
export function patientsController(dependencias: DependenciasDelController): Router {
  const { service, traceIds, registrar } = dependencias;
  const router = Router();

  const traceIdDe = (response: Response): string => response.locals.traceId ?? '';

  /** Con identidad (aunque enmascarada) la respuesta no se guarda en cachés intermedias (RN-10). */
  const sinCache = (response: Response): void => {
    response.setHeader('Cache-Control', 'no-store');
  };

  const listar: RequestHandler = async (request, response) => {
    const filtros = leerFiltrosDelListado(request.query);
    if (!filtros.success) {
      registrar({
        event: EVENTO_LISTADO,
        resultado: 'cuerpo_invalido',
        traceId: traceIdDe(response),
      });
      enviarError(response, 422, 'CUERPO_INVALIDO', traceIdDe(response));
      return;
    }
    const vista = vistaSegunPermiso<VistaDeListado>(request.sesion ?? { permisos: new Set() }, {
      'clinical:read': 'doctor_listado',
      default: 'admin',
    });
    const pagina = await service.listar({ filtros: filtros.data, vista });
    registrar({
      event: EVENTO_LISTADO,
      resultado: 'ok',
      traceId: traceIdDe(response),
      total: pagina.total,
    });
    sinCache(response);
    response.status(200).json(pagina);
  };

  router.get('/patients', crearTraceIdMiddleware(traceIds), authorize('patients:lookup'), listar);
  return router;
}
