import type { Router } from 'express';
import type { Clock } from '../../infrastructure/clock.js';
import type { GeneradorDeIds } from '../../infrastructure/ids.js';
import type { Registrar } from '../../infrastructure/logger.js';
import type { TiposDeCancerHabilitados } from '../../infrastructure/tipos-de-cancer-habilitados.js';
import type { TraceIdGenerator } from '../../infrastructure/trace-id-generator.js';
import type { ReconciliationService } from '../reconciliation/ports.js';
import { manualEntryController } from './manual-entry.controller.js';
import { createManualEntryRepository, type FuenteDeConexiones } from './manual-entry.repository.js';
import { createManualEntryService } from './manual-entry.service.js';
import type { CatalogoDeEscalas } from './ports.js';

export interface DependenciasDelModulo {
  /** Pool de PostgreSQL: cada registro toma UNA conexión para su transacción. */
  readonly fuente: FuenteDeConexiones;
  /** `ReconciliationService` (l1d-84) cuyo log lleva el `traceId` de la petición; el módulo nunca asigna `mapping_status`. */
  readonly reconciliacionPara: (traceId: string) => ReconciliationService;
  readonly escalas: CatalogoDeEscalas;
  /** `ENABLED_CANCER_TYPES` validada contra el catálogo (RN-20, RN-22). */
  readonly tiposHabilitados: TiposDeCancerHabilitados;
  readonly reloj: Clock;
  /** UUID de las filas creadas: inyectado, nunca `randomUUID()` en el service. */
  readonly generarId: GeneradorDeIds;
  readonly traceIds: TraceIdGenerator;
  readonly registrar: Registrar;
}

/** Composición del módulo `manual-entry`: devuelve el router que se monta detrás del guard de sesión. */
export function componerModuloDeRegistroManual(dependencias: DependenciasDelModulo): Router {
  const repositorio = createManualEntryRepository(dependencias.fuente);
  return manualEntryController({
    servicioPara: (traceId) =>
      createManualEntryService({
        repositorio,
        reconciliacion: dependencias.reconciliacionPara(traceId),
        escalas: dependencias.escalas,
        tiposHabilitados: dependencias.tiposHabilitados,
        reloj: dependencias.reloj,
        generarId: dependencias.generarId,
      }),
    traceIds: dependencias.traceIds,
    registrar: dependencias.registrar,
  });
}
