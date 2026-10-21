import { Router, type RequestHandler } from 'express';
import { enviarError } from '../../infrastructure/http-errores.js';
import { authorize } from '../../middleware/authorize.js';
import type { DocumentsService } from './documents.service.js';

export interface DependenciasDelController {
  service: DocumentsService;
}

/** `POST /patients/{patientId}/documents` (se monta bajo `/platform`, detrás del guard de sesión). */
export function documentsController(dependencias: DependenciasDelController): Router {
  void dependencias.service;
  const router = Router();
  // Esqueleto (no implementado): responde con un error declarado en el contrato para que el rojo falle en la aserción.
  const cargar: RequestHandler = (_request, response) => {
    enviarError(response, 422, 'CUERPO_INVALIDO', 'req_noimplementado');
  };
  router.post('/patients/:patientId/documents', authorize('documents:upload'), cargar);
  return router;
}
