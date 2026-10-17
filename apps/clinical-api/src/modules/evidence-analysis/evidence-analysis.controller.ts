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
import type { SesionAutenticada } from '../auth/auth.service.js';
import { TipoCancerNoRegistradoError } from './case-guards.js';
import { DesidentificacionProvisionalRechazada } from './context-deidentifier.provisional.js';
import { evidenceAnalysisRequestSchema } from './evidence-analysis.schema.js';
import {
  PacienteNoEncontradoError,
  type EvidenceAnalysisService,
} from './evidence-analysis.service.js';
import type { IdGenerator } from './ports.js';
import { crearTraceIdMiddleware } from './trace-id.middleware.js';

export interface DependenciasDelController {
  service: EvidenceAnalysisService;
  ids: IdGenerator;
  registrar: Registrar;
}

const EVENTO = 'evidence_analysis.solicitud';

/** La sesión no tiene el rol que exige la acción. */
export class PermisoDenegadoError extends Error {
  constructor() {
    super('Permiso denegado');
    this.name = 'PermisoDenegadoError';
  }
}

/**
 * En el S1 solo el rol `doctor` solicita análisis; `admin` no lee datos clínicos ni análisis (mínimo privilegio, PRD
 * E-04, `[S1 resp. 14c]`). US-045 (S2) lo reemplaza por el permiso `ai_analysis:create`.
 */
export function exigirRolDoctor(sesion: SesionAutenticada | undefined): SesionAutenticada {
  if (sesion?.rol !== 'doctor') throw new PermisoDenegadoError();
  return sesion;
}

interface Rechazo {
  status: number;
  codigo: CodigoDeError;
  resultado: string;
  extra?: LineaDeLog;
}

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
  if (error instanceof DesidentificacionProvisionalRechazada) {
    return {
      status: 502,
      codigo: 'ERROR_SERVICIO_IA',
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
  const { service, ids, registrar } = dependencias;
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

  const soloDoctor: RequestHandler = (request, response, next) => {
    try {
      exigirRolDoctor(request.sesion);
    } catch (error) {
      if (!(error instanceof PermisoDenegadoError)) throw error;
      rechazar(response, {
        status: 403,
        codigo: 'PERMISO_DENEGADO',
        resultado: 'permiso_denegado',
      });
      return;
    }
    next();
  };

  const solicitar: RequestHandler = async (request, response) => {
    const sesion = exigirRolDoctor(request.sesion);
    const cuerpo = evidenceAnalysisRequestSchema.safeParse(request.body);
    if (!cuerpo.success) {
      rechazar(response, { status: 422, codigo: 'CUERPO_INVALIDO', resultado: 'cuerpo_invalido' });
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
      rechazar(
        response,
        { status: 502, codigo: 'ERROR_SERVICIO_IA', resultado: 'error_servicio_ia' },
        trazaDelPaciente,
      );
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
    rechazar(response, { status: 422, codigo: 'CUERPO_INVALIDO', resultado: 'cuerpo_invalido' });
  };

  router.post(
    '/evidence-analyses',
    crearTraceIdMiddleware(ids),
    soloDoctor,
    express.json(),
    solicitar,
    cuerpoIlegible,
  );
  return router;
}
