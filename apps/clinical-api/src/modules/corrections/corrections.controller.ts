import express, { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { rechazarNoEncontrado } from '../../infrastructure/http-errores.js';
import type { Registrar } from '../../infrastructure/logger.js';
import type { TraceIdGenerator } from '../../infrastructure/trace-id-generator.js';
import { authorize } from '../../middleware/authorize.js';
import { crearTraceIdMiddleware, traceIdDe } from '../../middleware/trace-id.middleware.js';
import { ValorFueraDeCatalogoError } from '../compartido/errores-de-registro.js';
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
import {
  CorreccionInvalidaError,
  DatoNoEncontradoError,
  DatoNoVigenteError,
} from './corrections.errores.js';
import {
  leerCorreccionDeBiomarcador,
  leerCorreccionDeNota,
  type LecturaDeCuerpo,
} from './corrections.schema.js';
import type { CorrectionsService } from './corrections.service.js';

export interface DependenciasDelController {
  /** El service de UNA petición: recibe el `traceId` para que el log de la normalización lo lleve. */
  servicioPara: (traceId: string) => CorrectionsService;
  traceIds: TraceIdGenerator;
  registrar: Registrar;
}

const EVENTO_BIOMARCADOR = 'corrections.biomarcador';
const EVENTO_NOTA = 'corrections.nota';
const EVENTO_HISTORIAL = 'corrections.historial';
const EVENTO_NOTAS = 'corrections.notas';

/** `biomarkerId` y `noteId` de la ruta: un UUID; cualquier otra cosa es un 404 sin consultar la BD. */
const idDeDatoSchema = z.uuid();

const DATO_NO_VIGENTE: Rechazo = {
  status: 409,
  codigo: 'DATO_NO_VIGENTE',
  resultado: 'dato_no_vigente',
};

/** Errores de dominio → respuesta HTTP; `undefined` si no es uno de ellos (sigue al 500 genérico). */
function rechazoDe(error: unknown): Rechazo | undefined {
  if (error instanceof DatoNoVigenteError) return DATO_NO_VIGENTE;
  if (error instanceof CorreccionInvalidaError) {
    return { ...CUERPO_INVALIDO, ...(error.campo !== undefined && { campo: error.campo }) };
  }
  const comun = rechazoComunDe(error);
  if (comun !== undefined && error instanceof ValorFueraDeCatalogoError) {
    return { ...comun, campo: error.campo };
  }
  return comun;
}

const esNoEncontrado = (error: unknown): boolean =>
  error instanceof PacienteNoEncontradoError || error instanceof DatoNoEncontradoError;

interface Identificadores {
  readonly patientId: string;
  readonly datoId: string;
}

/** Los ids de la ruta, o `undefined` si alguno no es un UUID (404). */
function identificadoresDe(
  request: Request,
  parametroDelDato: string,
): Identificadores | undefined {
  const patientId = idDePacienteSchema.safeParse(request.params['patientId']);
  const datoId = idDeDatoSchema.safeParse(request.params[parametroDelDato]);
  return patientId.success && datoId.success
    ? { patientId: patientId.data, datoId: datoId.data }
    : undefined;
}

interface Correccion<C> {
  readonly evento: string;
  readonly parametroDelDato: string;
  readonly leerCuerpo: (cuerpo: unknown) => LecturaDeCuerpo<C>;
  readonly ejecutar: (
    servicio: CorrectionsService,
    solicitud: { patientId: string; userId: string; datoId: string; cuerpo: C },
  ) => Promise<unknown>;
}

function crearCorreccion<C>(dependencias: DependenciasDelController, operacion: Correccion<C>) {
  const { registrar, servicioPara } = dependencias;
  return async (request: Request, response: Response): Promise<void> => {
    const ids = identificadoresDe(request, operacion.parametroDelDato);
    const rechazarCon = (rechazo: Rechazo): void =>
      rechazar(registrar, operacion.evento, response, rechazo, ids?.patientId);
    const lectura = operacion.leerCuerpo(request.body);
    if (!lectura.valido) {
      rechazarCon({
        ...CUERPO_INVALIDO,
        ...(lectura.campo !== undefined && { campo: lectura.campo }),
      });
      return;
    }
    if (ids === undefined) {
      rechazarNoEncontrado(response, registrar, operacion.evento);
      return;
    }
    try {
      const corregido = await operacion.ejecutar(servicioPara(traceIdDe(response)), {
        ...ids,
        userId: sesionDe(request, 'corrections').userId,
        cuerpo: lectura.cuerpo,
      });
      registrarResultado(registrar, operacion.evento, response, ids.patientId, 'ok');
      response.setHeader('Cache-Control', 'no-store');
      response.status(201).json(corregido);
    } catch (error) {
      if (esNoEncontrado(error)) {
        rechazarNoEncontrado(response, registrar, operacion.evento);
        return;
      }
      const rechazo = rechazoDe(error);
      if (rechazo === undefined) throw error;
      rechazarCon(rechazo);
    }
  };
}

/** Una lectura: qué ids exige la ruta (`undefined` = 404), cómo se lee y de qué paciente es (para el log). */
interface Lectura<O> {
  readonly evento: string;
  readonly identificar: (request: Request) => O | undefined;
  readonly pacienteDe: (objetivo: O) => string;
  readonly leer: (servicio: CorrectionsService, objetivo: O) => Promise<unknown>;
}

function crearLectura<O>(dependencias: DependenciasDelController, lectura: Lectura<O>) {
  const { registrar, servicioPara } = dependencias;
  return async (request: Request, response: Response): Promise<void> => {
    const objetivo = lectura.identificar(request);
    if (objetivo === undefined) {
      rechazarNoEncontrado(response, registrar, lectura.evento);
      return;
    }
    try {
      const cuerpo = await lectura.leer(servicioPara(traceIdDe(response)), objetivo);
      registrarResultado(registrar, lectura.evento, response, lectura.pacienteDe(objetivo), 'ok');
      response.setHeader('Cache-Control', 'no-store');
      response.status(200).json(cuerpo);
    } catch (error) {
      if (!esNoEncontrado(error)) throw error;
      rechazarNoEncontrado(response, registrar, lectura.evento);
    }
  };
}

/** Lectura de un dato (histórico): el paciente y el dato de la ruta. */
const delDato = (evento: string, parametroDelDato: string) => ({
  evento,
  identificar: (request: Request) => identificadoresDe(request, parametroDelDato),
  pacienteDe: (ids: Identificadores) => ids.patientId,
});

type Permiso = 'clinical:write' | 'clinical:read';

/** Trazas y autorización: `authorize` corre antes de leer el cuerpo (403 sin efectos). */
const alTraer = (dependencias: DependenciasDelController, permiso: Permiso) => [
  crearTraceIdMiddleware(dependencias.traceIds),
  authorize(permiso),
];

function montarCorrecciones(router: Router, dependencias: DependenciasDelController): void {
  const alCorregir = [...alTraer(dependencias, 'clinical:write'), express.json()];
  router.post(
    '/patients/:patientId/biomarkers/:biomarkerId/corrections',
    ...alCorregir, // x-permission de correctBiomarker
    crearCorreccion(dependencias, {
      evento: EVENTO_BIOMARCADOR,
      parametroDelDato: 'biomarkerId',
      leerCuerpo: leerCorreccionDeBiomarcador,
      ejecutar: (servicio, solicitud) => servicio.corregirBiomarcador(solicitud),
    }),
    crearCuerpoIlegible(dependencias.registrar, EVENTO_BIOMARCADOR),
  );
  router.post(
    '/patients/:patientId/clinical-notes/:noteId/corrections',
    ...alCorregir, // x-permission de correctClinicalNote
    crearCorreccion(dependencias, {
      evento: EVENTO_NOTA,
      parametroDelDato: 'noteId',
      leerCuerpo: leerCorreccionDeNota,
      ejecutar: (servicio, solicitud) => servicio.corregirNota(solicitud),
    }),
    crearCuerpoIlegible(dependencias.registrar, EVENTO_NOTA),
  );
}

function montarLecturas(router: Router, dependencias: DependenciasDelController): void {
  const alLeer = alTraer(dependencias, 'clinical:read');
  router.get(
    '/patients/:patientId/biomarkers/:biomarkerId/history',
    ...alLeer, // x-permission de getBiomarkerHistory
    crearLectura(dependencias, {
      ...delDato(EVENTO_HISTORIAL, 'biomarkerId'),
      leer: (servicio, ids) => servicio.historialDeBiomarcador(ids),
    }),
  );
  router.get(
    '/patients/:patientId/clinical-notes',
    ...alLeer, // x-permission de listClinicalNotes
    crearLectura(dependencias, {
      evento: EVENTO_NOTAS,
      identificar: (request) => {
        const patientId = idDePacienteSchema.safeParse(request.params['patientId']);
        return patientId.success ? patientId.data : undefined;
      },
      pacienteDe: (patientId) => patientId,
      leer: (servicio, patientId) => servicio.notasVigentes(patientId),
    }),
  );
  router.get(
    '/patients/:patientId/clinical-notes/:noteId/history',
    ...alLeer, // x-permission de getClinicalNoteHistory
    crearLectura(dependencias, {
      ...delDato(EVENTO_HISTORIAL, 'noteId'),
      leer: (servicio, ids) => servicio.historialDeNota(ids),
    }),
  );
}

/**
 * `POST …/corrections` y `GET …/history|clinical-notes` (se montan bajo `/platform`, detrás del guard). Solo traducen
 * HTTP ↔ service: el log nunca lleva valores clínicos ni el texto de una nota (RN-10).
 */
export function correctionsController(dependencias: DependenciasDelController): Router {
  const router = Router();
  montarCorrecciones(router, dependencias);
  montarLecturas(router, dependencias);
  return router;
}
