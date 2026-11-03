import express, {
  Router,
  type ErrorRequestHandler,
  type RequestHandler,
  type Response,
} from 'express';
import { z } from 'zod';
import {
  enviarError,
  esErrorDeCuerpoDelCliente,
  rechazarNoEncontrado,
  type CodigoDeError,
} from '../../infrastructure/http-errores.js';
import type { LineaDeLog, Registrar } from '../../infrastructure/logger.js';
import { authorize } from '../../middleware/authorize.js';
import { crearTraceIdMiddleware, traceIdDe } from '../../middleware/trace-id.middleware.js';
import { FalloDePersistenciaError } from './analysis-completion.js';
import { DesidentificacionNoDisponible } from './deidentification/context-deidentifier.js';
import { EntornoNoSintetico } from './deidentification/entorno-sintetico.guard.js';
import { followUpCreateSchema } from './follow-up.schema.js';
import {
  AnalisisNoEncontradoError,
  AnalisisSinEvidenciaError,
  LimiteDeSeguimientoError,
  type FollowUpService,
} from './follow-up.service.js';
import type { TraceIdGenerator } from './ports.js';

export interface DependenciasDelControllerDeSeguimiento {
  service: FollowUpService;
  traceIds: TraceIdGenerator;
  registrar: Registrar;
}

const EVENTO = 'follow_up.solicitud';

interface Rechazo {
  status: number;
  codigo: CodigoDeError;
  resultado: string;
}

const CUERPO_INVALIDO: Rechazo = {
  status: 422,
  codigo: 'CUERPO_INVALIDO',
  resultado: 'cuerpo_invalido',
};
const ERROR_INTERNO: Rechazo = {
  status: 500,
  codigo: 'ERROR_INTERNO',
  resultado: 'error_de_persistencia',
};
const LIMITE_ALCANZADO: Rechazo = {
  status: 409,
  codigo: 'LIMITE_SEGUIMIENTO',
  resultado: 'limite_alcanzado',
};

const ANALISIS_SIN_EVIDENCIA: Rechazo = {
  status: 422,
  codigo: 'ANALISIS_SIN_EVIDENCIA',
  resultado: 'analisis_sin_evidencia',
};
const DESIDENTIFICACION_NO_DISPONIBLE: Rechazo = {
  status: 503,
  codigo: 'DESIDENTIFICACION_NO_DISPONIBLE',
  resultado: 'desidentificacion_no_disponible',
};
const DESIDENTIFICACION_RECHAZADA: Rechazo = {
  status: 502,
  codigo: 'ERROR_SERVICIO_IA',
  resultado: 'desidentificacion_rechazada',
};

/** Errores del dominio → respuesta HTTP; `undefined` si no es uno de ellos (sigue al 500 genérico). */
function rechazoDe(error: unknown): Rechazo | undefined {
  if (error instanceof LimiteDeSeguimientoError) return LIMITE_ALCANZADO;
  if (error instanceof AnalisisSinEvidenciaError) return ANALISIS_SIN_EVIDENCIA;
  if (error instanceof FalloDePersistenciaError) return ERROR_INTERNO;
  if (error instanceof DesidentificacionNoDisponible) return DESIDENTIFICACION_NO_DISPONIBLE;
  if (error instanceof EntornoNoSintetico) return DESIDENTIFICACION_RECHAZADA;
  return undefined;
}

/**
 * `POST` y `GET /evidence-analyses/{analysisId}/follow-ups` (se montan bajo `/platform`, detrás del guard de sesión).
 * Solo traduce HTTP ↔ service. El log lleva únicamente evento, resultado, `traceId` y el UUID del análisis: nunca la
 * pregunta, la respuesta ni la memoria (RN-11).
 */
export function followUpController(dependencias: DependenciasDelControllerDeSeguimiento): Router {
  const { service, traceIds, registrar } = dependencias;
  const router = Router();

  function registrarResultado(response: Response, resultado: string, extra: LineaDeLog = {}): void {
    registrar({ event: EVENTO, resultado, traceId: traceIdDe(response), ...extra });
  }

  function rechazar(response: Response, rechazo: Rechazo, extra: LineaDeLog = {}): void {
    registrarResultado(response, rechazo.resultado, extra);
    enviarError(response, rechazo.status, rechazo.codigo, traceIdDe(response));
  }

  /** Un identificador mal formado es indistinguible de uno inexistente: `404` sin eco. */
  function analisisIdDe(request: Parameters<RequestHandler>[0]): string | null {
    const analisisId = z.uuid().safeParse(request.params['analysisId']);
    return analisisId.success ? analisisId.data : null;
  }

  const crear: RequestHandler = async (request, response) => {
    const analysisId = analisisIdDe(request);
    if (analysisId === null) {
      rechazarNoEncontrado(response, registrar, EVENTO);
      return;
    }
    const cuerpo = followUpCreateSchema.safeParse(request.body);
    if (!cuerpo.success) {
      rechazar(response, CUERPO_INVALIDO, { analysisId });
      return;
    }
    try {
      const resultado = await service.crear({
        traceId: traceIdDe(response),
        analysisId,
        peticion: cuerpo.data,
      });
      if (resultado.tipo === 'creado') {
        registrarResultado(response, 'ok', { analysisId });
        response.status(201).json(resultado.cuerpo);
        return;
      }
      rechazar(response, resultado.respuesta, { analysisId });
    } catch (error) {
      if (error instanceof AnalisisNoEncontradoError) {
        rechazarNoEncontrado(response, registrar, EVENTO);
        return;
      }
      const rechazo = rechazoDe(error);
      if (rechazo === undefined) throw error;
      rechazar(response, rechazo, { analysisId });
    }
  };

  const listar: RequestHandler = async (request, response) => {
    const analysisId = analisisIdDe(request);
    if (analysisId === null) {
      rechazarNoEncontrado(response, registrar, EVENTO);
      return;
    }
    try {
      const turnos = await service.listar(analysisId);
      registrarResultado(response, 'ok', { analysisId });
      response.status(200).json(turnos);
    } catch (error) {
      if (!(error instanceof AnalisisNoEncontradoError)) throw error;
      rechazarNoEncontrado(response, registrar, EVENTO);
    }
  };

  // JSON malformado o cuerpo excesivo: mismo 422 del contrato, sin eco del error del parser.
  const cuerpoIlegible: ErrorRequestHandler = (error: unknown, _request, response, next) => {
    if (!esErrorDeCuerpoDelCliente(error)) {
      next(error);
      return;
    }
    rechazar(response, CUERPO_INVALIDO);
  };

  router.post(
    '/evidence-analyses/:analysisId/follow-ups',
    crearTraceIdMiddleware(traceIds),
    authorize('follow_ups:create'), // x-permission de createFollowUp; el rol no se mira
    express.json(),
    crear,
    cuerpoIlegible,
  );
  router.get(
    '/evidence-analyses/:analysisId/follow-ups',
    crearTraceIdMiddleware(traceIds),
    authorize('follow_ups:read'), // x-permission de listFollowUps
    listar,
  );
  return router;
}
