import type { Router } from 'express';
import type { Clock } from '../../infrastructure/clock.js';
import type { GeneradorDeIds } from '../../infrastructure/ids.js';
import type { Registrar } from '../../infrastructure/logger.js';
import type { TraceIdGenerator } from '../../infrastructure/trace-id-generator.js';
import type { FuenteDeConexiones } from '../compartido/transaccion.js';
import type { ReconciliationService } from '../reconciliation/ports.js';
import { priorTreatmentsController } from './prior-treatments.controller.js';
import { createPriorTreatmentsRepository } from './prior-treatments.repository.js';
import { createPriorTreatmentsService } from './prior-treatments.service.js';

export interface DependenciasDelModulo {
  /** Pool de PostgreSQL: cada registro toma UNA conexión para su transacción. */
  readonly fuente: FuenteDeConexiones;
  /** `ReconciliationService` (l1d-84) cuyo log lleva el `traceId` de la petición; el módulo nunca asigna `mapping_status`. */
  readonly reconciliacionPara: (traceId: string) => ReconciliationService;
  readonly reloj: Clock;
  /** UUID de las filas creadas: inyectado, nunca `randomUUID()` en el service. */
  readonly generarId: GeneradorDeIds;
  readonly traceIds: TraceIdGenerator;
  readonly registrar: Registrar;
}

/** Composición del módulo `prior-treatments`: devuelve el router que se monta detrás del guard de sesión. */
export function componerModuloDeTratamientos(dependencias: DependenciasDelModulo): Router {
  const repositorio = createPriorTreatmentsRepository(dependencias.fuente);
  return priorTreatmentsController({
    servicioPara: (traceId) =>
      createPriorTreatmentsService({
        repositorio,
        reconciliacion: dependencias.reconciliacionPara(traceId),
        reloj: dependencias.reloj,
        generarId: dependencias.generarId,
      }),
    traceIds: dependencias.traceIds,
    registrar: dependencias.registrar,
  });
}
