import type { Router } from 'express';
import type { Registrar } from '../../infrastructure/logger.js';
import type { Consultador } from '../auth/auth.repository.js';
import type { CompletenessService } from '../completeness/ports.js';
import type { TiposDeCancerHabilitados } from '../../infrastructure/tipos-de-cancer-habilitados.js';
import type { TraceIdGenerator } from '../../infrastructure/trace-id-generator.js';
import type { IdentityService } from './identity.service.js';
import { patientsController } from './patients.controller.js';
import { createFichaRepository } from './ficha.repository.js';
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
  /** Checklist de datos críticos para el contador de la ficha: la misma instancia del endpoint y del análisis. */
  completitud: CompletenessService;
  traceIds: TraceIdGenerator;
  registrar: Registrar;
  config: ConfiguracionDePacientes;
}

/** Composición del módulo `patients`: devuelve el router que se monta detrás del guard de sesión. */
export function componerModuloDePacientes(dependencias: DependenciasDelModulo): Router {
  const service = crearPatientsService({
    repo: createPatientsRepository(dependencias.db),
    ficha: createFichaRepository(dependencias.db),
    identidad: dependencias.identidad,
    tiposHabilitados: dependencias.tiposHabilitados,
    completitud: dependencias.completitud,
    pageSize: dependencias.config.pageSize,
  });
  return patientsController({
    service,
    traceIds: dependencias.traceIds,
    registrar: dependencias.registrar,
  });
}
