import express, { Router, type Request, type Response } from 'express';
import { rechazarNoEncontrado } from '../../infrastructure/http-errores.js';
import type { Registrar } from '../../infrastructure/logger.js';
import type { TraceIdGenerator } from '../../infrastructure/trace-id-generator.js';
import { authorize } from '../../middleware/authorize.js';
import { crearTraceIdMiddleware, traceIdDe } from '../../middleware/trace-id.middleware.js';
import {
  CUERPO_INVALIDO,
  crearCuerpoIlegible,
  cuerpoInvalidoDelCampo,
  rechazar,
  rechazoComunDe,
  registrarResultado,
  sesionDe,
  type Rechazo,
} from '../compartido/http-escritura.js';
import type { LecturaDeCuerpo } from '../compartido/cuerpo-de-registro.js';
import { PacienteNoEncontradoError } from '../compartido/pacientes.errores.js';
import { idDePacienteSchema } from '../patients/patients.schema.js';
import { CuerpoIncompletoError, GradacionIncoherenteError } from './manual-entry.errores.js';
import { campoDelError } from './manual-entry.reglas.js';
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
const EVENTO_OPCIONES = 'manual_entry.opciones';

function rechazoSinCampoDe(error: unknown): Rechazo | undefined {
  const comun = rechazoComunDe(error);
  if (comun !== undefined) return comun;
  if (error instanceof GradacionIncoherenteError) {
    return { status: 422, codigo: 'GRADACION_INCOHERENTE', resultado: 'gradacion_incoherente' };
  }
  if (error instanceof CuerpoIncompletoError) return CUERPO_INVALIDO;
  return undefined;
}

/** Errores de dominio → respuesta HTTP con su `field` (RN-10: el nombre, nunca el valor); `undefined` si no es uno de ellos (sigue al 500 genérico). */
function rechazoDe(error: unknown): Rechazo | undefined {
  const rechazo = rechazoSinCampoDe(error);
  const campo = campoDelError(error);
  return rechazo === undefined || campo === undefined ? rechazo : { ...rechazo, campo };
}

interface Operacion<C, R> {
  readonly evento: string;
  readonly leerCuerpo: (cuerpo: unknown) => LecturaDeCuerpo<C>;
  readonly ejecutar: (
    servicio: ManualEntryService,
    solicitud: SolicitudDeRegistro<C>,
  ) => Promise<R>;
}

function crearRegistro<C, R>(dependencias: DependenciasDelController, operacion: Operacion<C, R>) {
  const { registrar, servicioPara } = dependencias;
  return async (request: Request, response: Response): Promise<void> => {
    const rechazarCon = (rechazo: Rechazo, patientId?: string): void =>
      rechazar(registrar, operacion.evento, response, rechazo, patientId);
    const patientId = idDePacienteSchema.safeParse(request.params['patientId']);
    const lectura = operacion.leerCuerpo(request.body);
    if (!lectura.valido) {
      rechazarCon(
        cuerpoInvalidoDelCampo(lectura.campo),
        patientId.success ? patientId.data : undefined,
      );
      return;
    }
    if (!patientId.success) {
      rechazarNoEncontrado(response, registrar, operacion.evento);
      return;
    }
    try {
      const creado = await operacion.ejecutar(servicioPara(traceIdDe(response)), {
        patientId: patientId.data,
        userId: sesionDe(request, 'manual-entry').userId,
        cuerpo: lectura.cuerpo,
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
      rechazarCon(rechazo, patientId.data);
    }
  };
}

function crearOpciones({ registrar, servicioPara }: DependenciasDelController) {
  return async (request: Request, response: Response): Promise<void> => {
    const patientId = idDePacienteSchema.safeParse(request.params['patientId']);
    if (!patientId.success) {
      rechazarNoEncontrado(response, registrar, EVENTO_OPCIONES);
      return;
    }
    try {
      const opciones = await servicioPara(traceIdDe(response)).opciones(patientId.data);
      registrarResultado(registrar, EVENTO_OPCIONES, response, patientId.data, 'ok');
      response.setHeader('Cache-Control', 'no-store');
      response.status(200).json(opciones);
    } catch (error) {
      if (!(error instanceof PacienteNoEncontradoError)) throw error;
      rechazarNoEncontrado(response, registrar, EVENTO_OPCIONES);
    }
  };
}

/**
 * `POST /platform/patients/{id}/biomarkers` y `…/diagnoses` y `GET …/manual-entry-options` (se montan bajo `/platform`, detrás del guard). Solo traducen
 * HTTP ↔ service: `authorize` corre antes de leer el cuerpo (403 sin efectos) y el log nunca lleva valores clínicos.
 */
export function manualEntryController(dependencias: DependenciasDelController): Router {
  const router = Router();
  const alRegistrar = [
    crearTraceIdMiddleware(dependencias.traceIds),
    authorize('clinical:write'), // x-permission de createManualBiomarker y createManualDiagnosis
    express.json(),
  ];
  router.get(
    '/patients/:patientId/manual-entry-options',
    crearTraceIdMiddleware(dependencias.traceIds),
    authorize('clinical:read'), // x-permission de getManualEntryOptions
    crearOpciones(dependencias),
  );
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
