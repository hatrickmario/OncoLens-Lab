import type { Router } from 'express';
import type { Clock } from '../../infrastructure/clock.js';
import type { GeneradorDeIds } from '../../infrastructure/ids.js';
import type { Registrar } from '../../infrastructure/logger.js';
import type { TraceIdGenerator } from '../../infrastructure/trace-id-generator.js';
import type { FuenteDeConexiones } from '../compartido/transaccion.js';
import type { CatalogoDeAtributos } from '../clinical-attributes/ports.js';
import type { ReconciliationService } from '../reconciliation/ports.js';
import { correctionsController } from './corrections.controller.js';
import { createCorrectionsRepository } from './corrections.repository.js';
import { createCorrectionsService, type LimitesDeCorreccion } from './corrections.service.js';

export interface DependenciasDelModulo {
  /** Pool de PostgreSQL: cada corrección toma UNA conexión para su transacción. */
  readonly fuente: FuenteDeConexiones;
  /** `ReconciliationService` (l1d-84) cuyo log lleva el `traceId` de la petición; este módulo nunca asigna `mapping_status`. */
  readonly reconciliacionPara: (traceId: string) => ReconciliationService;
  /** `atributos.json` del catálogo montado (RN-29): el MISMO que usa el registro manual de atributos. */
  readonly catalogoDeAtributos: CatalogoDeAtributos;
  readonly limites: LimitesDeCorreccion;
  readonly reloj: Clock;
  /** UUID de las filas creadas: inyectado, nunca `randomUUID()` en el service. */
  readonly generarId: GeneradorDeIds;
  readonly traceIds: TraceIdGenerator;
  readonly registrar: Registrar;
}

/** Composición del módulo `corrections`: devuelve el router que se monta detrás del guard de sesión. */
export function componerModuloDeCorrecciones(dependencias: DependenciasDelModulo): Router {
  const repositorio = createCorrectionsRepository(dependencias.fuente);
  return correctionsController({
    servicioPara: (traceId) =>
      createCorrectionsService({
        repositorio,
        reconciliacion: dependencias.reconciliacionPara(traceId),
        catalogoDeAtributos: dependencias.catalogoDeAtributos,
        limites: dependencias.limites,
        reloj: dependencias.reloj,
        generarId: dependencias.generarId,
      }),
    traceIds: dependencias.traceIds,
    registrar: dependencias.registrar,
  });
}
