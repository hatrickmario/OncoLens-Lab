import type { Router } from 'express';
import type { Clock } from '../../infrastructure/clock.js';
import type { Registrar } from '../../infrastructure/logger.js';
import type { Consultador } from '../auth/auth.repository.js';
import type { TiposDeCancerHabilitados, TraceIdGenerator } from '../evidence-analysis/ports.js';
import { patientsController } from './patients.controller.js';
import type { IdentityService } from './identity.service.js';
import { crearPatientsService } from './patients.service.js';

export interface ConfiguracionDePacientes {
  /** `PATIENTS_PAGE_SIZE` (RN-22). */
  pageSize: number;
}

export interface DependenciasDelModulo {
  db: Consultador;
  identidad: IdentityService;
  tiposHabilitados: TiposDeCancerHabilitados;
  reloj: Clock;
  traceIds: TraceIdGenerator;
  registrar: Registrar;
  config: ConfiguracionDePacientes;
}

/** Composición del módulo `patients`: devuelve el router que se monta detrás del guard de sesión. */
export function componerModuloDePacientes(_dependencias: DependenciasDelModulo): Router {
  return patientsController({ service: crearPatientsService() });
}
