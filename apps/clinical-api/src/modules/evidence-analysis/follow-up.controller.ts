import express, { Router, type Request, type RequestHandler, type Response } from 'express';
import { z } from 'zod';
import { rechazarNoEncontrado } from '../../infrastructure/http-errores.js';
import type { Registrar } from '../../infrastructure/logger.js';
import { authorize } from '../../middleware/authorize.js';
import { crearTraceIdMiddleware, traceIdDe } from '../../middleware/trace-id.middleware.js';
import { FalloDePersistenciaError } from './analysis-completion.js';
import { followUpCreateSchema } from './follow-up.schema.js';
import {
  AnalisisNoEncontradoError,
  AnalisisSinEvidenciaError,
  LimiteDeSeguimientoError,
  type FollowUpService,
} from './follow-up.service.js';
import type { TraceIdGenerator } from './ports.js';
import {
  CUERPO_INVALIDO,
  ERROR_INTERNO,
  crearEmisor,
  manejadorDeCuerpoIlegible,
  rechazoDeDesidentificacion,
  type Rechazo,
} from './rechazos-http.js';

export interface DependenciasDelControllerDeSeguimiento {
  service: FollowUpService;
  traceIds: TraceIdGenerator;
  registrar: Registrar;
}

const EVENTO = 'follow_up.solicitud';

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

/** Errores del dominio → respuesta HTTP; `undefined` si no es uno de ellos (sigue al 500 genérico). */
function rechazoDe(error: unknown): Rechazo | undefined {
  if (error instanceof LimiteDeSeguimientoError) return LIMITE_ALCANZADO;
  if (error instanceof AnalisisSinEvidenciaError) return ANALISIS_SIN_EVIDENCIA;
  if (error instanceof FalloDePersistenciaError) return ERROR_INTERNO;
  return rechazoDeDesidentificacion(error);
}

/** Un identificador mal formado es indistinguible de uno inexistente: `404` sin eco. */
function analisisIdDe(request: Request): string | null {
  const analisisId = z.uuid().safeParse(request.params['analysisId']);
  return analisisId.success ? analisisId.data : null;
}

/** Emisor del seguimiento: el común del módulo más el `404` sin eco. */
function crearEmisorDeSeguimiento(registrar: Registrar) {
  return {
    ...crearEmisor(registrar, EVENTO),
    noEncontrado: (response: Response) => {
      rechazarNoEncontrado(response, registrar, EVENTO);
    },
  };
}

type EmisorDeSeguimiento = ReturnType<typeof crearEmisorDeSeguimiento>;

function manejadorDeCreacion(
  service: FollowUpService,
  emisor: EmisorDeSeguimiento,
): RequestHandler {
  return async (request, response) => {
    const analysisId = analisisIdDe(request);
    if (analysisId === null) {
      emisor.noEncontrado(response);
      return;
    }
    const cuerpo = followUpCreateSchema.safeParse(request.body);
    if (!cuerpo.success) {
      emisor.rechazar(response, CUERPO_INVALIDO, { analysisId });
      return;
    }
    try {
      const resultado = await service.crear({
        traceId: traceIdDe(response),
        analysisId,
        peticion: cuerpo.data,
      });
      if (resultado.tipo === 'fallo') {
        emisor.rechazar(response, resultado.respuesta, { analysisId });
        return;
      }
      emisor.registrarResultado(response, 'ok', { analysisId });
      response.status(201).json(resultado.cuerpo);
    } catch (error) {
      if (error instanceof AnalisisNoEncontradoError) {
        emisor.noEncontrado(response);
        return;
      }
      const rechazo = rechazoDe(error);
      if (rechazo === undefined) throw error;
      emisor.rechazar(response, rechazo, { analysisId });
    }
  };
}

function manejadorDeListado(service: FollowUpService, emisor: EmisorDeSeguimiento): RequestHandler {
  return async (request, response) => {
    const analysisId = analisisIdDe(request);
    if (analysisId === null) {
      emisor.noEncontrado(response);
      return;
    }
    try {
      const turnos = await service.listar(analysisId);
      emisor.registrarResultado(response, 'ok', { analysisId });
      response.status(200).json(turnos);
    } catch (error) {
      if (!(error instanceof AnalisisNoEncontradoError)) throw error;
      emisor.noEncontrado(response);
    }
  };
}

/**
 * `POST` y `GET /evidence-analyses/{analysisId}/follow-ups` (se montan bajo `/platform`, detrás del guard de sesión).
 * Solo traduce HTTP ↔ service. Registra sus rutas en el `router` que recibe (el del gateway de análisis, para que la
 * raíz de composición y el test de coherencia con el contrato vean un solo router del módulo).
 */
export function followUpController(
  dependencias: DependenciasDelControllerDeSeguimiento,
  router: Router = Router(),
): Router {
  const { service, traceIds, registrar } = dependencias;
  const emisor = crearEmisorDeSeguimiento(registrar);
  router.post(
    '/evidence-analyses/:analysisId/follow-ups',
    crearTraceIdMiddleware(traceIds),
    authorize('follow_ups:create'), // x-permission de createFollowUp; el rol no se mira
    express.json(),
    manejadorDeCreacion(service, emisor),
    manejadorDeCuerpoIlegible(emisor),
  );
  router.get(
    '/evidence-analyses/:analysisId/follow-ups',
    crearTraceIdMiddleware(traceIds),
    authorize('follow_ups:read'), // x-permission de listFollowUps
    manejadorDeListado(service, emisor),
  );
  return router;
}
