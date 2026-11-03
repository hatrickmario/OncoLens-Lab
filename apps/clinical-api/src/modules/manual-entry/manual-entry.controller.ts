import express, { Router, type Request, type Response } from 'express';
import { rechazarNoEncontrado } from '../../infrastructure/http-errores.js';
import type { Registrar } from '../../infrastructure/logger.js';
import type { TraceIdGenerator } from '../../infrastructure/trace-id-generator.js';
import { authorize } from '../../middleware/authorize.js';
import { crearTraceIdMiddleware, traceIdDe } from '../../middleware/trace-id.middleware.js';
import {
  CUERPO_INVALIDO,
  crearCuerpoIlegible,
  rechazar,
  rechazoComunDe,
  registrarResultado,
  sesionDe,
  type Rechazo,
} from '../compartido/http-escritura.js';
import { PacienteNoEncontradoError } from '../compartido/pacientes.errores.js';
import { idDePacienteSchema } from '../patients/patients.schema.js';
import { CuerpoIncompletoError, GradacionIncoherenteError } from './manual-entry.errores.js';
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

/** Errores de dominio → respuesta HTTP; `undefined` si no es uno de ellos (sigue al 500 genérico). */
function rechazoDe(error: unknown): Rechazo | undefined {
  const comun = rechazoComunDe(error);
  if (comun !== undefined) return comun;
  if (error instanceof GradacionIncoherenteError) {
    return { status: 422, codigo: 'GRADACION_INCOHERENTE', resultado: 'gradacion_incoherente' };
  }
  if (error instanceof CuerpoIncompletoError) return CUERPO_INVALIDO;
  return undefined;
}

interface Operacion<C, R> {
  readonly evento: string;
  readonly leerCuerpo: (cuerpo: unknown) => C | undefined;
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
    const cuerpo = operacion.leerCuerpo(request.body);
    if (cuerpo === undefined) {
      rechazarCon(CUERPO_INVALIDO, patientId.success ? patientId.data : undefined);
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
      rechazarCon(rechazo, patientId.data);
    }
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
