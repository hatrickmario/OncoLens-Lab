import { Router } from 'express';
import type { Clock } from '../../infrastructure/clock.js';
import type { GeneradorDeIds } from '../../infrastructure/ids.js';
import type { Registrar } from '../../infrastructure/logger.js';
import type { TraceIdGenerator } from '../../infrastructure/trace-id-generator.js';
import type { FuenteDeConexiones } from '../compartido/transaccion.js';
import type { CatalogoDeAtributos } from './ports.js';

export interface DependenciasDelModulo {
  /** Pool de PostgreSQL: cada operación toma UNA conexión para su transacción. */
  readonly fuente: FuenteDeConexiones;
  /** `atributos.json` del catálogo montado (RN-29): la única lista de atributos y valores del sistema. */
  readonly catalogo: CatalogoDeAtributos;
  readonly reloj: Clock;
  /** UUID de las filas creadas: inyectado, nunca `randomUUID()` en el service. */
  readonly generarId: GeneradorDeIds;
  readonly traceIds: TraceIdGenerator;
  readonly registrar: Registrar;
}

/** Composición del módulo `clinical-attributes`: devuelve el router que se monta detrás del guard de sesión. */
export function componerModuloDeAtributos(_dependencias: DependenciasDelModulo): Router {
  const router = Router();
  const noImplementado = (): never => {
    throw new Error('no implementado');
  };
  router.post('/patients/:patientId/clinical-attributes', noImplementado);
  router.get('/patients/:patientId/clinical-attributes', noImplementado);
  return router;
}
