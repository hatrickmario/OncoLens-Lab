import { Router, type RequestHandler, type Response } from 'express';
import { enviarError, type CodigoDeError } from '../../infrastructure/http-errores.js';
import type { Registrar } from '../../infrastructure/logger.js';
import { authorize } from '../../middleware/authorize.js';
import type { TraceIdGenerator } from '../evidence-analysis/ports.js';
import { crearTraceIdMiddleware } from '../evidence-analysis/trace-id.middleware.js';
import { ArchivoNoPdf } from './documents.errores.js';
import { leerCargaMultipart } from './documents.multipart.js';
import type { DocumentsService, TipoDeDocumento } from './documents.service.js';

export interface DependenciasDelController {
  service: DocumentsService;
  traceIds: TraceIdGenerator;
  registrar: Registrar;
}

const EVENTO = 'documents.carga';

interface Rechazo {
  status: number;
  codigo: CodigoDeError;
  resultado: string;
}

/** Errores del dominio → respuesta HTTP; `undefined` si no es uno de ellos (sigue al 500 genérico). */
function rechazoDe(error: unknown): Rechazo | undefined {
  if (error instanceof ArchivoNoPdf) {
    return { status: 422, codigo: 'ARCHIVO_NO_PDF', resultado: 'archivo_no_pdf' };
  }
  return undefined;
}

/**
 * `POST /patients/{patientId}/documents` (se monta bajo `/platform`, detrás del guard de sesión). Solo traduce
 * HTTP ↔ service. El log lleva únicamente evento, resultado, `traceId` y UUID del paciente y del documento: nunca el
 * nombre del archivo, su contenido ni la clave del objeto (RN-10).
 */
export function documentsController(dependencias: DependenciasDelController): Router {
  const { service, traceIds, registrar } = dependencias;
  const router = Router();

  const traceIdDe = (response: Response): string => response.locals.traceId ?? '';

  const cargar: RequestHandler = async (request, response) => {
    const sesion = request.sesion;
    const patientId = String(request.params['patientId']);
    const carga = await leerCargaMultipart(request);
    if (sesion === undefined || carga.archivo === undefined) {
      enviarError(response, 422, 'CUERPO_INVALIDO', traceIdDe(response));
      return;
    }
    try {
      const documento = await service.cargar({
        patientId,
        userId: sesion.userId,
        documentType: carga.documentType as TipoDeDocumento,
        nombreOriginal: carga.archivo.nombre,
        contenido: carga.archivo.contenido,
      });
      registrar({
        event: EVENTO,
        resultado: 'ok',
        traceId: traceIdDe(response),
        patientId,
        documentId: documento.id,
      });
      response.status(202).json(documento);
    } catch (error) {
      const rechazo = rechazoDe(error);
      if (rechazo === undefined) throw error;
      registrar({ event: EVENTO, resultado: rechazo.resultado, traceId: traceIdDe(response), patientId });
      enviarError(response, rechazo.status, rechazo.codigo, traceIdDe(response));
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
