import { Router, type Request, type RequestHandler, type Response } from 'express';
import { enviarError, type CodigoDeError } from '../../infrastructure/http-errores.js';
import type { LineaDeLog, Registrar } from '../../infrastructure/logger.js';
import { authorize } from '../../middleware/authorize.js';
import type { TraceIdGenerator } from '../evidence-analysis/ports.js';
import { crearTraceIdMiddleware } from '../evidence-analysis/trace-id.middleware.js';
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
  type CargaRecibida,
} from './documents.multipart.js';
import { contenidoExcedeElLimiteDeCarga, limiteDeLecturaDeCarga } from './documents.reglas.js';
import { idDePacienteSchema, tipoDeDocumentoSchema } from './documents.schema.js';
import type { DocumentsService } from './documents.service.js';

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

const contentLengthDe = (request: Request): number | undefined => {
  const declarado = request.headers['content-length'];
  return declarado === undefined ? undefined : Number(declarado);
};

/**
 * `POST /patients/{patientId}/documents` (se monta bajo `/platform`, detrás del guard de sesión). Solo traduce
 * HTTP ↔ service. El log lleva únicamente evento, resultado, `traceId` y UUID del paciente y del documento: nunca el
 * nombre del archivo, su contenido ni la clave del objeto (RN-10).
 */
export function documentsController(dependencias: DependenciasDelController): Router {
  const { service, traceIds, registrar, maxUploadMb } = dependencias;
  const limiteDeLectura = limiteDeLecturaDeCarga(maxUploadMb);
  const router = Router();

  const traceIdDe = (response: Response): string => response.locals.traceId ?? '';

  function registrarResultado(response: Response, resultado: string, extra: LineaDeLog): void {
    registrar({ event: EVENTO, resultado, traceId: traceIdDe(response), ...extra });
  }

  function rechazar(response: Response, rechazo: Rechazo, extra: LineaDeLog = {}): void {
    registrarResultado(response, rechazo.resultado, extra);
    enviarError(response, rechazo.status, rechazo.codigo, traceIdDe(response));
  }

  /** Rechaza sin esperar al resto del cuerpo: la conexión se cierra para no seguir recibiéndolo. */
  function rechazarYCerrar(response: Response, rechazo: Rechazo, deteccion: string): void {
    response.setHeader('Connection', 'close');
    rechazar(response, rechazo, { deteccion });
  }

  async function leerCarga(request: Request): Promise<CargaRecibida | undefined> {
    try {
      return await leerCargaMultipart(request, limiteDeLectura);
    } catch (error) {
      if (error instanceof MultipartIlegible) return undefined;
      throw error;
    }
  }

  const cargar: RequestHandler = async (request, response) => {
    const sesion = request.sesion;
    if (contenidoExcedeElLimiteDeCarga(contentLengthDe(request), maxUploadMb)) {
      rechazarYCerrar(response, ARCHIVO_DEMASIADO_GRANDE, 'content_length');
      return;
    }
    const carga = await leerCarga(request);
    if (carga?.excedeElLimite === true) {
      rechazarYCerrar(response, ARCHIVO_DEMASIADO_GRANDE, 'limite_de_lectura');
      return;
    }
    const tipo = tipoDeDocumentoSchema.safeParse(carga?.documentType);
    if (sesion === undefined || carga?.archivo === undefined || !tipo.success) {
      rechazar(response, CUERPO_INVALIDO);
      return;
    }
    const paciente = idDePacienteSchema.safeParse(request.params['patientId']);
    if (!paciente.success) {
      rechazar(response, PACIENTE_NO_ENCONTRADO);
      return;
    }
    const patientId = paciente.data;
    try {
      const documento = await service.cargar({
        patientId,
        userId: sesion.userId,
        documentType: tipo.data,
        nombreOriginal: carga.archivo.nombre,
        contenido: carga.archivo.contenido,
      });
      registrarResultado(response, 'ok', { patientId, documentId: documento.id });
      response.status(202).json(documento);
    } catch (error) {
      const rechazo = rechazoDe(error);
      if (rechazo === undefined) throw error;
      rechazar(response, rechazo, { patientId });
    }
  };

  router.post(
    '/patients/:patientId/documents',
    crearTraceIdMiddleware(traceIds),
    authorize('documents:upload'), // x-permission de uploadDocument; el rol no se mira
    cargar,
  );
  return router;
}
