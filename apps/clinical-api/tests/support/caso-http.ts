import type { Express } from 'express';
import { caseViewController } from '../../src/modules/case-view/case-view.controller.js';
import { createCaseViewRepository } from '../../src/modules/case-view/case-view.repository.js';
import { createCaseViewService } from '../../src/modules/case-view/case-view.service.js';
import type {
  CaseViewService,
  RepositorioDeLaVistaDeCaso,
} from '../../src/modules/case-view/ports.js';
import { appConAuth } from './app-auth.js';
import { servicioDeCompletitud, type OpcionesDeCompletitud } from './completitud-http.js';
import { AHORA, TRACE_ID_GENERADO, type MundoDeGateway } from './gateway.js';
import { loggerEnMemoria, relojFijo, tokensFijos, type LoggerEnMemoria } from './usuarios.js';

/**
 * Soporte de los tests de `GET /platform/patients/{id}/case` (L1D-74): la aplicación de producción (login → guard →
 * vista de caso) sobre la base del mundo, con el repositorio real salvo que el test pase uno (un fake que cumple el
 * puerto, nunca `vi.mock`). Todo dato es sintético (RN-13, RN-14).
 */

export interface OpcionesDeCaso extends OpcionesDeCompletitud {
  /** Repositorio de la vista; por defecto el real sobre la base del mundo. */
  repositorio?: RepositorioDeLaVistaDeCaso;
  /** Envuelve al servicio real (p. ej. para contar invocaciones): es un puerto, no un módulo propio. */
  envolverServicio?: (real: CaseViewService) => CaseViewService;
  logger?: LoggerEnMemoria;
}

export interface AppDeCaso {
  readonly app: Express;
  readonly logger: LoggerEnMemoria;
}

export function montarCaso(mundo: MundoDeGateway, opciones: OpcionesDeCaso = {}): AppDeCaso {
  const logger = opciones.logger ?? loggerEnMemoria();
  const real = createCaseViewService({
    repo: opciones.repositorio ?? createCaseViewRepository(mundo.cliente),
    completitud: servicioDeCompletitud(mundo, opciones),
  });
  const router = caseViewController({
    service: opciones.envolverServicio?.(real) ?? real,
    traceIds: { traceId: () => TRACE_ID_GENERADO },
    registrar: logger.registrar,
  });
  const app = appConAuth({
    cliente: mundo.cliente,
    espacio: mundo.espacio,
    tokens: tokensFijos('no-se-usa'),
    reloj: relojFijo(AHORA),
    registrar: logger.registrar,
    rutasProtegidas: [router],
  });
  return { app, logger };
}
