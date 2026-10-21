import type { Router } from 'express';
import type { Clock } from '../../infrastructure/clock.js';
import type { GeneradorDeIds } from '../../infrastructure/ids.js';
import type { Registrar } from '../../infrastructure/logger.js';
import type { Consultador } from '../auth/auth.repository.js';
import type { TraceIdGenerator } from '../evidence-analysis/ports.js';
import { documentsController } from './documents.controller.js';
import { createDocumentsRepository } from './documents.repository.js';
import { crearDocumentsService } from './documents.service.js';
import type { AlmacenDeDocumentos } from './ports.js';

export interface ConfiguracionDeDocumentos {
  /** `MAX_UPLOAD_MB` (RN-22). */
  maxUploadMb: number;
}

export interface DependenciasDelModulo {
  db: Consultador;
  almacen: AlmacenDeDocumentos;
  reloj: Clock;
  /** UUID de los `Document` (y parte de la clave del objeto): inyectado, nunca `randomUUID()` en el service. */
  ids: GeneradorDeIds;
  traceIds: TraceIdGenerator;
  registrar: Registrar;
  config: ConfiguracionDeDocumentos;
}

/** Composición del módulo `documents`: devuelve el router que se monta detrás del guard de sesión. */
export function componerModuloDeDocumentos(dependencias: DependenciasDelModulo): Router {
  const service = crearDocumentsService({
    repo: createDocumentsRepository(dependencias.db),
    almacen: dependencias.almacen,
    reloj: dependencias.reloj,
    ids: dependencias.ids,
    registrar: dependencias.registrar,
    maxUploadMb: dependencias.config.maxUploadMb,
  });
  return documentsController({
    service,
    traceIds: dependencias.traceIds,
    registrar: dependencias.registrar,
    maxUploadMb: dependencias.config.maxUploadMb,
  });
}
