import type { Router } from 'express';
import type { Registrar } from '../../infrastructure/logger.js';
import type { Consultador } from '../auth/auth.repository.js';
import type { TiposDeCancerHabilitados, TraceIdGenerator } from '../evidence-analysis/ports.js';
import type { IdentityService } from './identity.service.js';
import { patientsController } from './patients.controller.js';
import { createPatientsRepository } from './patients.repository.js';
import { crearPatientsService } from './patients.service.js';

export interface ConfiguracionDePacientes {
  /** `PATIENTS_PAGE_SIZE` (RN-22). */
  pageSize: number;
}

export interface DependenciasDelModulo {
  db: Consultador;
  identidad: IdentityService;
  tiposHabilitados: TiposDeCancerHabilitados;
  traceIds: TraceIdGenerator;
  registrar: Registrar;
  config: ConfiguracionDePacientes;
}

/** Composición del módulo `patients`: devuelve el router que se monta detrás del guard de sesión. */
export function componerModuloDePacientes(dependencias: DependenciasDelModulo): Router {
  const service = crearPatientsService({
    repo: createPatientsRepository(dependencias.db),
    identidad: dependencias.identidad,
    tiposHabilitados: dependencias.tiposHabilitados,
    pageSize: dependencias.config.pageSize,
  });
  return patientsController({
    service,
    traceIds: dependencias.traceIds,
    registrar: dependencias.registrar,
  });
}
