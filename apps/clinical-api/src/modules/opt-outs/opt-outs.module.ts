import type { Registrar } from '../../infrastructure/logger.js';
import type { Consultador } from '../auth/auth.repository.js';
import { crearGuardiaDeOptOut } from './opt-out.guard.js';
import { createOptOutRepository } from './opt-outs.repository.js';
import { crearOptOutService, type OptOutService } from './opt-outs.service.js';
import type { GuardiaDeOptOut } from './rutas-genera-ia.js';

export interface ModuloDeOptOuts {
  /** La regla única de consentimiento (RN-15): la usan el guardia y `aiAnalysisAvailable` de la ficha. */
  readonly optOuts: OptOutService;
  /** Construye el guardia de una ruta `generaIA`; se lo pasan los controllers a `registrarRutaGeneraIA`. */
  readonly guardia: GuardiaDeOptOut;
}

/** Composición del módulo `opt-outs` sobre la conexión de `clinical-api` (único dueño de PostgreSQL). */
export function componerModuloDeOptOuts(dependencias: {
  db: Consultador;
  registrar: Registrar;
}): ModuloDeOptOuts {
  const repositorio = createOptOutRepository(dependencias.db);
  const optOuts = crearOptOutService({ optOuts: repositorio });
  return {
    optOuts,
    guardia: crearGuardiaDeOptOut({
      optOuts,
      ubicador: repositorio,
      registrar: dependencias.registrar,
    }),
  };
}
