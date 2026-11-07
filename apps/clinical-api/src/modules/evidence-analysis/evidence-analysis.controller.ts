import express, { Router, type RequestHandler } from 'express';
import type { Registrar } from '../../infrastructure/logger.js';
import { authorize } from '../../middleware/authorize.js';
import { FalloDePersistenciaError } from './analysis-completion.js';
import { TipoCancerNoRegistradoError } from './case-guards.js';
import { evidenceAnalysisRequestSchema } from './evidence-analysis.schema.js';
import {
  PacienteNoEncontradoError,
  type EvidenceAnalysisService,
} from './evidence-analysis.service.js';
import {
  ChecklistNoDisponibleError,
  EtiquetaDeDatoCriticoNoDisponibleError,
  type TraceIdGenerator,
} from './ports.js';
import {
  CUERPO_INVALIDO,
  ERROR_INTERNO,
  crearEmisor,
  manejadorDeCuerpoIlegible,
  rechazoDeDesidentificacion,
  type Rechazo,
} from './rechazos-http.js';
import { crearTraceIdMiddleware, traceIdDe } from '../../middleware/trace-id.middleware.js';
import {
  registrarRutaGeneraIA,
  type FabricaDeGuardiaDeOptOut,
} from '../opt-outs/rutas-genera-ia.js';

export interface DependenciasDelController {
  service: EvidenceAnalysisService;
  traceIds: TraceIdGenerator;
  registrar: Registrar;
  /** Guardia de opt-out de `analisis_ia` de las rutas `generaIA` (RN-15, US-148). */
  fabricaDeGuardia: FabricaDeGuardiaDeOptOut;
}

const EVENTO = 'evidence_analysis.solicitud';

const PERMISO_DENEGADO: Rechazo = {
  status: 403,
  codigo: 'PERMISO_DENEGADO',
  resultado: 'permiso_denegado',
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
  if (error instanceof EtiquetaDeDatoCriticoNoDisponibleError) {
    return { ...ERROR_INTERNO, resultado: 'etiqueta_de_dato_critico_no_disponible' };
  }
  return rechazoDeDesidentificacion(error);
}

/**
 * `POST /evidence-analyses` (se monta bajo `/platform`, detrás del guard de sesión). Solo traduce HTTP ↔ service. El
 * log lleva únicamente evento, resultado, `traceId`, `traceIdEntrante` (si cumple el patrón), el UUID del paciente y
 * códigos: nunca la pregunta, el contexto ni identidad (RN-10).
 */
export function evidenceAnalysisController(dependencias: DependenciasDelController): Router {
  const { service, traceIds, registrar, fabricaDeGuardia } = dependencias;
  const router = Router();

  const emisor = crearEmisor(registrar, EVENTO);
  const { registrarResultado, rechazar } = emisor;

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

  registrarRutaGeneraIA(
    router,
    'createEvidenceAnalysis',
    fabricaDeGuardia,
    [
      crearTraceIdMiddleware(traceIds),
      authorize('ai_analysis:create'), // x-permission de createEvidenceAnalysis; el rol no se mira
      express.json(),
    ],
    solicitar,
    manejadorDeCuerpoIlegible(emisor),
  );
  return router;
}
