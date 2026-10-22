import express, {
  Router,
  type ErrorRequestHandler,
  type Request,
  type RequestHandler,
  type Response,
} from 'express';
import type { PatientPage } from '../../../../../packages/api-contracts/src/client/clinical-api/index.js';
import { enviarError, esErrorDeCuerpoDelCliente } from '../../infrastructure/http-errores.js';
import type { Registrar } from '../../infrastructure/logger.js';
import { authorize } from '../../middleware/authorize.js';
import { vistaSegunPermiso } from '../../middleware/vista-segun-permiso.js';
import type { TraceIdGenerator } from '../evidence-analysis/ports.js';
import { crearTraceIdMiddleware } from '../evidence-analysis/trace-id.middleware.js';
import { leerBusqueda, leerFiltrosDelListado } from './patients.schema.js';
import type { PatientsService, VistaDeListado } from './patients.service.js';

export interface DependenciasDelController {
  service: PatientsService;
  traceIds: TraceIdGenerator;
  registrar: Registrar;
}

const EVENTO_LISTADO = 'patients.listado';
const EVENTO_BUSQUEDA = 'patients.busqueda';

/** Tipo de criterio que puede viajar al log: nunca el criterio mismo (RN-10). */
type TipoDeCriterio = 'documento' | 'nombre';

const traceIdDe = (response: Response): string => response.locals.traceId ?? '';

/** Elige la vista por PERMISO, nunca por rol; sin sesión, la de menor privilegio. */
const vistaDe = (request: Request): VistaDeListado =>
  vistaSegunPermiso<VistaDeListado>(request.sesion ?? { permisos: new Set() }, {
    'clinical:read': 'doctor_listado',
    default: 'admin',
  });

/** Respuestas del módulo con el log que las acompaña: evento, resultado, `traceId`, tipo de criterio y total. */
function crearRespuestas(registrar: Registrar) {
  return {
    rechazarCuerpoInvalido(response: Response, evento: string): void {
      registrar({ event: evento, resultado: 'cuerpo_invalido', traceId: traceIdDe(response) });
      enviarError(response, 422, 'CUERPO_INVALIDO', traceIdDe(response));
    },
    /** Con identidad (aunque enmascarada) la respuesta no se guarda en cachés intermedias (RN-10). */
    responderPagina(
      response: Response,
      evento: string,
      pagina: PatientPage,
      criterio?: TipoDeCriterio,
    ): void {
      registrar({
        event: evento,
        resultado: 'ok',
        traceId: traceIdDe(response),
        total: pagina.total,
        ...(criterio !== undefined && { criterio }),
      });
      response.setHeader('Cache-Control', 'no-store');
      response.status(200).json(pagina);
    },
  };
}

type Respuestas = ReturnType<typeof crearRespuestas>;

function crearListar(service: PatientsService, respuestas: Respuestas): RequestHandler {
  return async (request, response) => {
    const filtros = leerFiltrosDelListado(request.query);
    if (!filtros.success) {
      respuestas.rechazarCuerpoInvalido(response, EVENTO_LISTADO);
      return;
    }
    const pagina = await service.listar({ filtros: filtros.data, vista: vistaDe(request) });
    respuestas.responderPagina(response, EVENTO_LISTADO, pagina);
  };
}

function crearBuscar(service: PatientsService, respuestas: Respuestas): RequestHandler {
  return async (request, response) => {
    const busqueda = leerBusqueda(request.body);
    if (busqueda === undefined) {
      respuestas.rechazarCuerpoInvalido(response, EVENTO_BUSQUEDA);
      return;
    }
    const pagina = await service.buscar({ busqueda, vista: vistaDe(request) });
    respuestas.responderPagina(response, EVENTO_BUSQUEDA, pagina, busqueda.criterio.tipo);
  };
}

/** JSON malformado o cuerpo excesivo: mismo 422 del contrato, sin eco del error del parser. */
function crearCuerpoIlegible(respuestas: Respuestas): ErrorRequestHandler {
  return (error: unknown, _request, response, next) => {
    if (!esErrorDeCuerpoDelCliente(error)) {
      next(error);
      return;
    }
    respuestas.rechazarCuerpoInvalido(response, EVENTO_BUSQUEDA);
  };
}

/**
 * `GET /patients` y `POST /patients/search` (se montan bajo `/platform`, detrás del guard de sesión). Solo traducen
 * HTTP ↔ service; el log nunca lleva filtros con identidad, cuerpos ni datos del paciente (RN-10).
 */
export function patientsController(dependencias: DependenciasDelController): Router {
  const { service, traceIds, registrar } = dependencias;
  const respuestas = crearRespuestas(registrar);
  const router = Router();
  router.get(
    '/patients',
    crearTraceIdMiddleware(traceIds),
    authorize('patients:lookup'),
    crearListar(service, respuestas),
  );
  router.post(
    '/patients/search',
    crearTraceIdMiddleware(traceIds),
    authorize('patients:lookup'), // x-permission de searchPatients; el rol no se mira
    express.json(),
    crearBuscar(service, respuestas),
    crearCuerpoIlegible(respuestas),
  );
  return router;
}
