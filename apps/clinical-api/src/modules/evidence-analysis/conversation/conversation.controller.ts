import express, { Router, type Request, type RequestHandler, type Response } from 'express';
import { z } from 'zod';
import { rechazarNoEncontrado } from '../../../infrastructure/http-errores.js';
import type { Registrar } from '../../../infrastructure/logger.js';
import { authorize } from '../../../middleware/authorize.js';
import { crearTraceIdMiddleware, traceIdDe } from '../../../middleware/trace-id.middleware.js';
import { FalloDePersistenciaError } from '../analysis-completion.js';
import { ChecklistNoDisponibleError, type TraceIdGenerator } from '../ports.js';
import {
  CUERPO_INVALIDO,
  ERROR_INTERNO,
  crearEmisor,
  manejadorDeCuerpoIlegible,
  rechazoDeDesidentificacion,
  type Rechazo,
} from '../rechazos-http.js';
import { conversationTurnCreateSchema } from './conversation.schema.js';
import {
  ConversacionNoEncontradaError,
  TurnoReferidoInexistenteError,
  type ConversationService,
} from './conversation.service.js';

export interface DependenciasDelControllerDeConversacion {
  service: ConversationService;
  traceIds: TraceIdGenerator;
  registrar: Registrar;
}

const EVENTO = 'conversation.solicitud';

/** Errores del dominio → respuesta HTTP; `undefined` si no es uno de ellos (sigue al 500 genérico). */
function rechazoDe(error: unknown): Rechazo | undefined {
  if (error instanceof FalloDePersistenciaError) return ERROR_INTERNO;
  if (error instanceof TurnoReferidoInexistenteError) return CUERPO_INVALIDO;
  if (error instanceof ChecklistNoDisponibleError) {
    return { ...ERROR_INTERNO, resultado: 'checklist_no_disponible' };
  }
  return rechazoDeDesidentificacion(error);
}

/** Un identificador mal formado es indistinguible de uno inexistente: `404` sin eco. */
function uuidDe(request: Request, parametro: 'patientId' | 'conversationId'): string | null {
  const id = z.uuid().safeParse(request.params[parametro]);
  return id.success ? id.data : null;
}

/** Emisor de la conversación: el común del módulo más el `404` sin eco. */
function crearEmisorDeConversacion(registrar: Registrar) {
  return {
    ...crearEmisor(registrar, EVENTO),
    noEncontrado: (response: Response) => {
      rechazarNoEncontrado(response, registrar, EVENTO);
    },
  };
}

type EmisorDeConversacion = ReturnType<typeof crearEmisorDeConversacion>;

function manejadorDeApertura(
  service: ConversationService,
  emisor: EmisorDeConversacion,
): RequestHandler {
  return async (request, response) => {
    const patientId = uuidDe(request, 'patientId');
    const sesion = request.sesion;
    if (patientId === null || sesion === undefined) {
      emisor.noEncontrado(response);
      return;
    }
    try {
      const conversacion = await service.abrir({ patientId, userId: sesion.userId });
      emisor.registrarResultado(response, 'ok', { conversationId: conversacion.conversationId });
      response.status(201).json(conversacion);
    } catch (error) {
      if (!(error instanceof ConversacionNoEncontradaError)) throw error;
      emisor.noEncontrado(response);
    }
  };
}

function manejadorDeLectura(
  service: ConversationService,
  emisor: EmisorDeConversacion,
): RequestHandler {
  return async (request, response) => {
    const conversationId = uuidDe(request, 'conversationId');
    if (conversationId === null) {
      emisor.noEncontrado(response);
      return;
    }
    try {
      const conversacion = await service.leer(conversationId);
      emisor.registrarResultado(response, 'ok', { conversationId });
      // Las respuestas de la conversación llevan datos clínicos: ni el navegador ni un intermedio las guardan.
      response.setHeader('Cache-Control', 'no-store');
      response.status(200).json(conversacion);
    } catch (error) {
      if (!(error instanceof ConversacionNoEncontradaError)) throw error;
      emisor.noEncontrado(response);
    }
  };
}

function manejadorDeTurno(
  service: ConversationService,
  emisor: EmisorDeConversacion,
): RequestHandler {
  return async (request, response) => {
    const conversationId = uuidDe(request, 'conversationId');
    if (conversationId === null) {
      emisor.noEncontrado(response);
      return;
    }
    const cuerpo = conversationTurnCreateSchema.safeParse(request.body);
    if (!cuerpo.success) {
      emisor.rechazar(response, CUERPO_INVALIDO, { conversationId });
      return;
    }
    try {
      const resultado = await service.crearTurno({
        traceId: traceIdDe(response),
        conversationId,
        peticion: cuerpo.data,
      });
      if (resultado.tipo === 'fallo') {
        emisor.rechazar(response, resultado.respuesta, { conversationId });
        return;
      }
      emisor.registrarResultado(response, 'ok', {
        conversationId,
        turnNumber: resultado.cuerpo.turnNumber,
      });
      response.setHeader('Cache-Control', 'no-store');
      response.status(201).json(resultado.cuerpo);
    } catch (error) {
      if (error instanceof ConversacionNoEncontradaError) {
        emisor.noEncontrado(response);
        return;
      }
      const rechazo = rechazoDe(error);
      if (rechazo === undefined) throw error;
      emisor.rechazar(response, rechazo, { conversationId });
    }
  };
}

/**
 * `POST …/patients/{patientId}/conversations`, `GET …/conversations/{conversationId}` y `POST …/turns` (se montan bajo
 * `/platform`, detrás del guard de sesión). Solo traducen HTTP ↔ service. Registran sus rutas en el `router` que
 * reciben (el del gateway de análisis, para que la raíz de composición vea un solo router del módulo). El log lleva
 * solo `conversationId`, `turnNumber`, `traceId` y códigos: nunca la pregunta ni la respuesta (RN-10).
 */
export function conversationController(
  dependencias: DependenciasDelControllerDeConversacion,
  router: Router = Router(),
): Router {
  const { service, traceIds, registrar } = dependencias;
  const emisor = crearEmisorDeConversacion(registrar);
  router.post(
    '/patients/:patientId/conversations',
    crearTraceIdMiddleware(traceIds),
    authorize('clinical:read'), // x-permission de createConversation
    manejadorDeApertura(service, emisor),
  );
  router.get(
    '/conversations/:conversationId',
    crearTraceIdMiddleware(traceIds),
    authorize('clinical:read'), // x-permission de getConversation
    manejadorDeLectura(service, emisor),
  );
  router.post(
    '/conversations/:conversationId/turns',
    crearTraceIdMiddleware(traceIds),
    authorize('clinical:read'), // x-permission de createConversationTurn
    express.json(),
    manejadorDeTurno(service, emisor),
    manejadorDeCuerpoIlegible(emisor),
  );
  return router;
}
