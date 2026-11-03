import express, { Router, type ErrorRequestHandler, type Request, type Response } from 'express';
import {
  enviarError,
  esErrorDeCuerpoDelCliente,
  rechazarNoEncontrado,
  type CodigoDeError,
} from '../../infrastructure/http-errores.js';
import type { Registrar } from '../../infrastructure/logger.js';
import type { TraceIdGenerator } from '../../infrastructure/trace-id-generator.js';
import { authorize } from '../../middleware/authorize.js';
import { crearTraceIdMiddleware, traceIdDe } from '../../middleware/trace-id.middleware.js';
import type { SesionAutenticada } from '../auth/auth.service.js';
import { PacienteNoEncontradoError } from '../compartido/pacientes.errores.js';
import { idDePacienteSchema } from '../patients/patients.schema.js';
import {
  CuerpoIncompletoError,
  GradacionIncoherenteError,
  PacienteEgresadoError,
  ValorFueraDeCatalogoError,
} from './manual-entry.errores.js';
import { leerCuerpoDeBiomarcador, leerCuerpoDeDiagnostico } from './manual-entry.schema.js';
import type { ManualEntryService, SolicitudDeRegistro } from './manual-entry.service.js';

export interface DependenciasDelController {
  /** El service de UNA petición: recibe el `traceId` para que el log de la normalización lo lleve (P3-1 de l1d-84). */
  servicioPara: (traceId: string) => ManualEntryService;
  traceIds: TraceIdGenerator;
  registrar: Registrar;
}

const EVENTO_BIOMARCADOR = 'manual_entry.biomarcador';
const EVENTO_DIAGNOSTICO = 'manual_entry.diagnostico';

interface Rechazo {
  readonly status: number;
  readonly codigo: CodigoDeError;
  readonly resultado: string;
}

const CUERPO_INVALIDO: Rechazo = {
  status: 422,
  codigo: 'CUERPO_INVALIDO',
  resultado: 'cuerpo_invalido',
};

/** Errores de dominio → respuesta HTTP; `undefined` si no es uno de ellos (sigue al 500 genérico). */
function rechazoDe(error: unknown): Rechazo | undefined {
  if (error instanceof PacienteEgresadoError) {
    return { status: 422, codigo: 'PACIENTE_EGRESADO', resultado: 'paciente_egresado' };
  }
  if (error instanceof ValorFueraDeCatalogoError) {
    return { status: 422, codigo: 'VALOR_FUERA_DE_CATALOGO', resultado: 'valor_fuera_de_catalogo' };
  }
  if (error instanceof GradacionIncoherenteError) {
    return { status: 422, codigo: 'GRADACION_INCOHERENTE', resultado: 'gradacion_incoherente' };
  }
  if (error instanceof CuerpoIncompletoError) return CUERPO_INVALIDO;
  return undefined;
}

/** El guard de sesión corre antes que este router: sin sesión es un montaje roto, no un error del cliente. */
const sesionDe = (request: Request): SesionAutenticada => {
  if (request.sesion === undefined) throw new Error('manual-entry montado sin el guard de sesión');
  return request.sesion;
};

interface Operacion<C, R> {
  readonly evento: string;
  readonly leerCuerpo: (cuerpo: unknown) => C | undefined;
  readonly ejecutar: (
    servicio: ManualEntryService,
    solicitud: SolicitudDeRegistro<C>,
  ) => Promise<R>;
}

/** Línea de log: solo evento, resultado, `traceId` y `patientId` (UUID); nunca el cuerpo ni sus valores (RN-10). */
function registrarResultado(
  registrar: Registrar,
  evento: string,
  response: Response,
  patientId: string | undefined,
  resultado: string,
): void {
  registrar({
    event: evento,
    resultado,
    traceId: traceIdDe(response),
    ...(patientId !== undefined && { patientId }),
  });
}

function crearRegistro<C, R>(dependencias: DependenciasDelController, operacion: Operacion<C, R>) {
  const { registrar, servicioPara } = dependencias;
  return async (request: Request, response: Response): Promise<void> => {
    const rechazar = (rechazo: Rechazo, patientId?: string): void => {
      registrarResultado(registrar, operacion.evento, response, patientId, rechazo.resultado);
      enviarError(response, rechazo.status, rechazo.codigo, traceIdDe(response));
    };
    const patientId = idDePacienteSchema.safeParse(request.params['patientId']);
    const cuerpo = operacion.leerCuerpo(request.body);
    if (cuerpo === undefined) {
      rechazar(CUERPO_INVALIDO, patientId.success ? patientId.data : undefined);
      return;
    }
    if (!patientId.success) {
      rechazarNoEncontrado(response, registrar, operacion.evento);
      return;
    }
    try {
      const creado = await operacion.ejecutar(servicioPara(traceIdDe(response)), {
        patientId: patientId.data,
        userId: sesionDe(request).userId,
        cuerpo,
      });
      registrarResultado(registrar, operacion.evento, response, patientId.data, 'ok');
      response.setHeader('Cache-Control', 'no-store');
      response.status(201).json(creado);
    } catch (error) {
      if (error instanceof PacienteNoEncontradoError) {
        rechazarNoEncontrado(response, registrar, operacion.evento);
        return;
      }
      const rechazo = rechazoDe(error);
      if (rechazo === undefined) throw error;
      rechazar(rechazo, patientId.data);
    }
  };
}

/** JSON malformado o cuerpo excesivo: el mismo 422 del contrato, sin eco del error del parser. */
function crearCuerpoIlegible(registrar: Registrar, evento: string): ErrorRequestHandler {
  return (error: unknown, _request, response, next) => {
    if (!esErrorDeCuerpoDelCliente(error)) {
      next(error);
      return;
    }
    registrarResultado(registrar, evento, response, undefined, CUERPO_INVALIDO.resultado);
    enviarError(response, CUERPO_INVALIDO.status, CUERPO_INVALIDO.codigo, traceIdDe(response));
  };
}

/**
 * `POST /platform/patients/{id}/biomarkers` y `…/diagnoses` (se montan bajo `/platform`, detrás del guard). Solo traducen
 * HTTP ↔ service: `authorize` corre antes de leer el cuerpo (403 sin efectos) y el log nunca lleva valores clínicos.
 */
export function manualEntryController(dependencias: DependenciasDelController): Router {
  const router = Router();
  const alRegistrar = [
    crearTraceIdMiddleware(dependencias.traceIds),
    authorize('clinical:write'), // x-permission de createManualBiomarker y createManualDiagnosis
    express.json(),
  ];
  router.post(
    '/patients/:patientId/biomarkers',
    ...alRegistrar,
    crearRegistro(dependencias, {
      evento: EVENTO_BIOMARCADOR,
      leerCuerpo: leerCuerpoDeBiomarcador,
      ejecutar: (servicio, solicitud) => servicio.registrarBiomarcador(solicitud),
    }),
    crearCuerpoIlegible(dependencias.registrar, EVENTO_BIOMARCADOR),
  );
  router.post(
    '/patients/:patientId/diagnoses',
    ...alRegistrar,
    crearRegistro(dependencias, {
      evento: EVENTO_DIAGNOSTICO,
      leerCuerpo: leerCuerpoDeDiagnostico,
      ejecutar: (servicio, solicitud) => servicio.registrarDiagnostico(solicitud),
    }),
    crearCuerpoIlegible(dependencias.registrar, EVENTO_DIAGNOSTICO),
  );
  return router;
}
