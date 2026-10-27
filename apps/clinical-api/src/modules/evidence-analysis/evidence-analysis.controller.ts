import express, {
  Router,
  type ErrorRequestHandler,
  type RequestHandler,
  type Response,
} from 'express';
import {
  enviarError,
  esErrorDeCuerpoDelCliente,
  type CodigoDeError,
} from '../../infrastructure/http-errores.js';
import type { LineaDeLog, Registrar } from '../../infrastructure/logger.js';
import { authorize } from '../../middleware/authorize.js';
import { FalloDePersistenciaError } from './analysis-completion.js';
import { TipoCancerNoRegistradoError } from './case-guards.js';
import { DesidentificacionNoDisponible } from './deidentification/context-deidentifier.js';
import { EntornoNoSintetico } from './deidentification/entorno-sintetico.guard.js';
import { evidenceAnalysisRequestSchema } from './evidence-analysis.schema.js';
import {
  PacienteNoEncontradoError,
  type EvidenceAnalysisService,
} from './evidence-analysis.service.js';
import { ChecklistNoDisponibleError, type TraceIdGenerator } from './ports.js';
import { crearTraceIdMiddleware } from './trace-id.middleware.js';

export interface DependenciasDelController {
  service: EvidenceAnalysisService;
  traceIds: TraceIdGenerator;
  registrar: Registrar;
}

const EVENTO = 'evidence_analysis.solicitud';

interface Rechazo {
  status: number;
  codigo: CodigoDeError;
  resultado: string;
  extra?: LineaDeLog;
}

const PERMISO_DENEGADO: Rechazo = {
  status: 403,
  codigo: 'PERMISO_DENEGADO',
  resultado: 'permiso_denegado',
};
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
const DESIDENTIFICACION_NO_DISPONIBLE: Rechazo = {
  status: 503,
  codigo: 'DESIDENTIFICACION_NO_DISPONIBLE',
  resultado: 'desidentificacion_no_disponible',
};
const ERROR_SERVICIO_IA: Rechazo = {
  status: 502,
  codigo: 'ERROR_SERVICIO_IA',
  resultado: 'error_servicio_ia',
};

/** Errores del dominio → respuesta HTTP; `undefined` si no es uno de ellos (sigue al 500 genérico). */
function rechazoDe(error: unknown): Rechazo | undefined {
  if (error instanceof PacienteNoEncontradoError) {
    return { status: 404, codigo: 'NO_ENCONTRADO', resultado: 'paciente_no_encontrado' };
  }
  if (error instanceof TipoCancerNoRegistradoError) {
    return {
      status: 422,
      codigo: 'TIPO_CANCER_NO_REGISTRADO',
      resultado: 'tipo_cancer_no_registrado',
    };
  }
  if (error instanceof FalloDePersistenciaError) return ERROR_INTERNO;
  if (error instanceof ChecklistNoDisponibleError) {
    return { ...ERROR_INTERNO, resultado: 'checklist_no_disponible' };
  }
  if (error instanceof DesidentificacionNoDisponible) return DESIDENTIFICACION_NO_DISPONIBLE;
  if (error instanceof EntornoNoSintetico) {
    return {
      ...ERROR_SERVICIO_IA,
      resultado: 'desidentificacion_rechazada',
      extra: { motivo: error.motivo },
    };
  }
  return undefined;
}

/**
 * `POST /evidence-analyses` (se monta bajo `/platform`, detrás del guard de sesión). Solo traduce HTTP ↔ service. El
 * log lleva únicamente evento, resultado, `traceId`, `traceIdEntrante` (si cumple el patrón), el UUID del paciente y
 * códigos: nunca la pregunta, el contexto ni identidad (RN-10).
 */
export function evidenceAnalysisController(dependencias: DependenciasDelController): Router {
  const { service, traceIds, registrar } = dependencias;
  const router = Router();

  function traceIdDe(response: Response): string {
    return response.locals.traceId ?? '';
  }

  function registrarResultado(response: Response, resultado: string, extra: LineaDeLog = {}): void {
    const { traceIdEntrante } = response.locals;
    registrar({
      event: EVENTO,
      resultado,
      traceId: traceIdDe(response),
      ...(traceIdEntrante !== undefined && { traceIdEntrante }),
      ...extra,
    });
  }

  function rechazar(response: Response, rechazo: Rechazo, extra: LineaDeLog = {}): void {
    registrarResultado(response, rechazo.resultado, { ...extra, ...rechazo.extra });
    enviarError(response, rechazo.status, rechazo.codigo, traceIdDe(response));
  }

  const solicitar: RequestHandler = async (request, response) => {
    const sesion = request.sesion;
    if (sesion === undefined) {
      rechazar(response, PERMISO_DENEGADO); // cerrado ante un guard mal montado
      return;
    }
    const cuerpo = evidenceAnalysisRequestSchema.safeParse(request.body);
    if (!cuerpo.success) {
      rechazar(response, CUERPO_INVALIDO);
      return;
    }
    const peticion = cuerpo.data;
    const trazaDelPaciente = { patientId: peticion.patientId };
    try {
      const resultado = await service.solicitar({
        traceId: traceIdDe(response),
        userId: sesion.userId,
        peticion,
      });
      if (resultado.tipo === 'completado') {
        registrarResultado(response, 'ok', trazaDelPaciente);
        response.status(200).json(resultado.cuerpo);
        return;
      }
      rechazar(response, resultado.respuesta, trazaDelPaciente);
    } catch (error) {
      const rechazo = rechazoDe(error);
      if (rechazo === undefined) throw error;
      rechazar(response, rechazo, trazaDelPaciente);
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
    '/evidence-analyses',
    crearTraceIdMiddleware(traceIds),
    authorize('ai_analysis:create'), // x-permission de createEvidenceAnalysis; el rol no se mira
    express.json(),
    solicitar,
    cuerpoIlegible,
  );
  return router;
}
