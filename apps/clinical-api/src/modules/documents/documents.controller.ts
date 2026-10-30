import { Router, type Request, type Response } from 'express';
import { enviarError, type CodigoDeError } from '../../infrastructure/http-errores.js';
import type { LineaDeLog, Registrar } from '../../infrastructure/logger.js';
import { authorize } from '../../middleware/authorize.js';
import type { TraceIdGenerator } from '../../infrastructure/trace-id-generator.js';
import type { SesionAutenticada } from '../auth/auth.service.js';
import { crearTraceIdMiddleware, traceIdDe } from '../../middleware/trace-id.middleware.js';
import { AlmacenNoDisponible } from './ports.js';
import {
  ArchivoDemasiadoGrande,
  ArchivoNoPdf,
  DocumentoDuplicado,
  PacienteNoEncontrado,
} from './documents.errores.js';
import {
  leerCargaMultipart,
  MultipartIlegible,
  type ArchivoRecibido,
  type CargaRecibida,
} from './documents.multipart.js';
import { contenidoExcedeElLimiteDeCarga, limiteDeLecturaDeCarga } from './documents.reglas.js';
import {
  idDePacienteSchema,
  tipoDeDocumentoSchema,
  type TipoDeDocumento,
} from './documents.schema.js';
import type { DocumentsService, SolicitudDeCarga } from './documents.service.js';

export interface DependenciasDelController {
  service: DocumentsService;
  traceIds: TraceIdGenerator;
  registrar: Registrar;
  /** `MAX_UPLOAD_MB` (RN-22). */
  maxUploadMb: number;
}

const EVENTO = 'documents.carga';

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
const ARCHIVO_DEMASIADO_GRANDE: Rechazo = {
  status: 422,
  codigo: 'ARCHIVO_DEMASIADO_GRANDE',
  resultado: 'archivo_demasiado_grande',
};
const PACIENTE_NO_ENCONTRADO: Rechazo = {
  status: 404,
  codigo: 'NO_ENCONTRADO',
  resultado: 'paciente_no_encontrado',
};

/** Errores del dominio → respuesta HTTP; `undefined` si no es uno de ellos (sigue al 500 genérico). */
function rechazoDe(error: unknown): Rechazo | undefined {
  if (error instanceof ArchivoNoPdf) {
    return { status: 422, codigo: 'ARCHIVO_NO_PDF', resultado: 'archivo_no_pdf' };
  }
  if (error instanceof ArchivoDemasiadoGrande) {
    return ARCHIVO_DEMASIADO_GRANDE;
  }
  if (error instanceof DocumentoDuplicado) {
    return { status: 409, codigo: 'DOCUMENTO_DUPLICADO', resultado: 'documento_duplicado' };
  }
  if (error instanceof PacienteNoEncontrado) return PACIENTE_NO_ENCONTRADO;
  if (error instanceof AlmacenNoDisponible) {
    return { status: 503, codigo: 'ALMACEN_NO_DISPONIBLE', resultado: 'almacen_no_disponible' };
  }
  return undefined;
}

/** El guard de sesión corre antes que este router: sin sesión es un montaje roto, no un error del cliente. */
const sesionDe = (request: Request): SesionAutenticada => {
  if (request.sesion === undefined) throw new Error('documents montado sin el guard de sesión');
  return request.sesion;
};

const contentLengthDe = (request: Request): number | undefined => {
  const declarado = request.headers['content-length'];
  return declarado === undefined ? undefined : Number(declarado);
};

interface Contexto extends DependenciasDelController {
  limiteDeLectura: number;
}

function registrarResultado(
  contexto: Contexto,
  response: Response,
  resultado: string,
  extra: LineaDeLog,
): void {
  contexto.registrar({ event: EVENTO, resultado, traceId: traceIdDe(response), ...extra });
}

function rechazar(
  contexto: Contexto,
  response: Response,
  rechazo: Rechazo,
  extra: LineaDeLog = {},
): void {
  registrarResultado(contexto, response, rechazo.resultado, extra);
  enviarError(response, rechazo.status, rechazo.codigo, traceIdDe(response));
}

/** Rechaza sin esperar al resto del cuerpo: la conexión se cierra para no seguir recibiéndolo. */
function rechazarYCerrar(
  contexto: Contexto,
  response: Response,
  rechazo: Rechazo,
  deteccion: string,
): void {
  response.setHeader('Connection', 'close');
  rechazar(contexto, response, rechazo, { deteccion });
}

async function leerCarga(request: Request, limite: number): Promise<CargaRecibida | undefined> {
  try {
    return await leerCargaMultipart(request, limite);
  } catch (error) {
    if (error instanceof MultipartIlegible) return undefined;
    throw error;
  }
}

interface CuerpoValido {
  tipo: TipoDeDocumento;
  archivo: ArchivoRecibido;
}

/** Lee y valida el multipart. Si lo rechaza, ya respondió (y registró) y devuelve `undefined`. */
async function recibirCuerpo(
  contexto: Contexto,
  request: Request,
  response: Response,
): Promise<CuerpoValido | undefined> {
  if (contenidoExcedeElLimiteDeCarga(contentLengthDe(request), contexto.maxUploadMb)) {
    rechazarYCerrar(contexto, response, ARCHIVO_DEMASIADO_GRANDE, 'content_length');
    return undefined;
  }
  const carga = await leerCarga(request, contexto.limiteDeLectura);
  if (carga?.excedeElLimite === true) {
    rechazarYCerrar(contexto, response, ARCHIVO_DEMASIADO_GRANDE, 'limite_de_lectura');
    return undefined;
  }
  const tipo = tipoDeDocumentoSchema.safeParse(carga?.documentType);
  if (carga?.archivo === undefined || !tipo.success) {
    rechazar(contexto, response, CUERPO_INVALIDO);
    return undefined;
  }
  return { tipo: tipo.data, archivo: carga.archivo };
}

/** Entrega la carga al service y traduce sus errores de dominio; el resto sigue al 500 genérico. */
async function encolarCarga(
  contexto: Contexto,
  response: Response,
  solicitud: SolicitudDeCarga,
): Promise<void> {
  try {
    const documento = await contexto.service.cargar(solicitud);
    registrarResultado(contexto, response, 'ok', {
      patientId: solicitud.patientId,
      documentId: documento.id,
    });
    response.status(202).json(documento);
  } catch (error) {
    const rechazo = rechazoDe(error);
    if (rechazo === undefined) throw error;
    rechazar(contexto, response, rechazo, { patientId: solicitud.patientId });
  }
}

async function procesarCarga(
  contexto: Contexto,
  request: Request,
  response: Response,
): Promise<void> {
  const sesion = sesionDe(request);
  const cuerpo = await recibirCuerpo(contexto, request, response);
  if (cuerpo === undefined) return;
  const paciente = idDePacienteSchema.safeParse(request.params['patientId']);
  if (!paciente.success) {
    rechazar(contexto, response, PACIENTE_NO_ENCONTRADO);
    return;
  }
  await encolarCarga(contexto, response, {
    traceId: traceIdDe(response),
    patientId: paciente.data,
    userId: sesion.userId,
    documentType: cuerpo.tipo,
    nombreOriginal: cuerpo.archivo.nombreOriginal,
    contenido: cuerpo.archivo.contenido,
  });
}

/**
 * `POST /patients/{patientId}/documents` (se monta bajo `/platform`, detrás del guard de sesión). Solo traduce
 * HTTP ↔ service. El log lleva únicamente evento, resultado, `traceId` y UUID del paciente y del documento: nunca el
 * nombre del archivo, su contenido ni la clave del objeto (RN-10).
 */
export function documentsController(dependencias: DependenciasDelController): Router {
  const contexto: Contexto = {
    ...dependencias,
    limiteDeLectura: limiteDeLecturaDeCarga(dependencias.maxUploadMb),
  };
  const router = Router();
  router.post(
    '/patients/:patientId/documents',
    crearTraceIdMiddleware(dependencias.traceIds),
    authorize('documents:upload'), // x-permission de uploadDocument; el rol no se mira
    (request, response) => procesarCarga(contexto, request, response),
  );
  return router;
}
