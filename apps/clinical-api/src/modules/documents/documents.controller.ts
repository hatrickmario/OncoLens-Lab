import { Router, type Request, type RequestHandler, type Response } from 'express';
import { enviarError, type CodigoDeError } from '../../infrastructure/http-errores.js';
import type { LineaDeLog, Registrar } from '../../infrastructure/logger.js';
import { authorize } from '../../middleware/authorize.js';
import type { TraceIdGenerator } from '../evidence-analysis/ports.js';
import { crearTraceIdMiddleware } from '../evidence-analysis/trace-id.middleware.js';
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
import { bytesMaximosDeCarga } from './documents.reglas.js';
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
    return {
      status: 422,
      codigo: 'ARCHIVO_DEMASIADO_GRANDE',
      resultado: 'archivo_demasiado_grande',
    };
  }
  if (error instanceof DocumentoDuplicado) {
    return { status: 409, codigo: 'DOCUMENTO_DUPLICADO', resultado: 'documento_duplicado' };
  }
  if (error instanceof PacienteNoEncontrado) return PACIENTE_NO_ENCONTRADO;
  return undefined;
}

/**
 * `POST /patients/{patientId}/documents` (se monta bajo `/platform`, detrás del guard de sesión). Solo traduce
 * HTTP ↔ service. El log lleva únicamente evento, resultado, `traceId` y UUID del paciente y del documento: nunca el
 * nombre del archivo, su contenido ni la clave del objeto (RN-10).
 */
export function documentsController(dependencias: DependenciasDelController): Router {
  const { service, traceIds, registrar, maxUploadMb } = dependencias;
  // Un byte más que el máximo permite distinguir "mide justo el máximo" de "lo excede" sin leer el resto.
  const limiteDeLectura = bytesMaximosDeCarga(maxUploadMb) + 1;
  const router = Router();

  const traceIdDe = (response: Response): string => response.locals.traceId ?? '';

  function registrarResultado(response: Response, resultado: string, extra: LineaDeLog): void {
    registrar({ event: EVENTO, resultado, traceId: traceIdDe(response), ...extra });
  }

  function rechazar(response: Response, rechazo: Rechazo, extra: LineaDeLog = {}): void {
    registrarResultado(response, rechazo.resultado, extra);
    enviarError(response, rechazo.status, rechazo.codigo, traceIdDe(response));
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
    const carga = await leerCarga(request);
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
