import type { Express } from 'express';
import type { Client } from 'pg';
import { crearProveedorDeCatalogo } from '../../src/infrastructure/catalogo/catalog-version.provider.js';
import { crearCatalogoTerminologico } from '../../src/infrastructure/catalogo/catalogo-terminologico.js';
import { createCaseViewRepository } from '../../src/modules/case-view/case-view.repository.js';
import { caseViewController } from '../../src/modules/case-view/case-view.controller.js';
import { createCaseViewService } from '../../src/modules/case-view/case-view.service.js';
import type { FuenteDeConexiones } from '../../src/modules/compartido/transaccion.js';
import { componerModuloDeTratamientos } from '../../src/modules/prior-treatments/prior-treatments.module.js';
import { createReconciliationService } from '../../src/modules/reconciliation/reconciliation.service.js';
import { appConAuth } from './app-auth.js';
import { RUTA_CATALOGO_FX01BB } from './catalogo-terminologico.js';
import { servicioDeCompletitud } from './completitud-http.js';
import { leerTexto } from './completitud.js';
import { AHORA, TRACE_ID_GENERADO, type MundoDeGateway } from './gateway.js';
import { loggerEnMemoria, relojFijo, tokensFijos, type LoggerEnMemoria } from './usuarios.js';

/**
 * Soporte de los tests del registro manual de tratamientos previos y atributos clínicos (L1D-80): la aplicación de
 * producción (login → guard → módulos de registro y vista de caso) sobre la base del mundo, con el
 * `ReconciliationService` REAL sobre el catálogo montado (no hay borde arquitectónico que fingir). Todo dato es
 * sintético (RN-13, RN-14).
 */

export interface AppDeRegistroClinico {
  readonly app: Express;
  readonly logger: LoggerEnMemoria;
}

export interface OpcionesDeRegistroClinico {
  /** Catálogo montado; por defecto el fixture FX-01b-b `test-normalizacion-1.0.0`. */
  rutaDelCatalogo?: string;
  /** Fuente de conexiones; por defecto la conexión única del mundo (BEGIN/COMMIT caen en la sesión del test). */
  fuente?: FuenteDeConexiones;
}

function fuenteUnica(mundo: MundoDeGateway): FuenteDeConexiones {
  return {
    connect: () =>
      Promise.resolve({
        query: (sql, valores) => mundo.cliente.query(sql, valores),
        release: () => undefined,
      }),
  };
}

export function montarRegistroClinico(
  mundo: MundoDeGateway,
  opciones: OpcionesDeRegistroClinico = {},
): AppDeRegistroClinico {
  const ruta = opciones.rutaDelCatalogo ?? RUTA_CATALOGO_FX01BB;
  const logger = loggerEnMemoria();
  const proveedor = crearProveedorDeCatalogo(ruta, leerTexto);
  const terminologia = crearCatalogoTerminologico(ruta, leerTexto, proveedor);
  const reloj = relojFijo(AHORA);
  const traceIds = { traceId: () => TRACE_ID_GENERADO };
  const fuente = opciones.fuente ?? fuenteUnica(mundo);
  const tratamientos = componerModuloDeTratamientos({
    fuente,
    reconciliacionPara: () =>
      createReconciliationService({ catalogo: terminologia, registrar: logger.registrar }),
    reloj,
    generarId: mundo.ids,
    traceIds,
    registrar: logger.registrar,
  });
  const caso = caseViewController({
    service: createCaseViewService({
      repo: createCaseViewRepository(mundo.cliente),
      completitud: servicioDeCompletitud(mundo),
    }),
    traceIds,
    registrar: logger.registrar,
  });
  const app = appConAuth({
    cliente: mundo.cliente,
    espacio: mundo.espacio,
    tokens: tokensFijos('no-se-usa'),
    reloj,
    registrar: logger.registrar,
    rutasProtegidas: [tratamientos, caso],
  });
  return { app, logger };
}

/** Filas de `clinical.prior_treatment` del paciente: los tests de «no crea filas» comparan antes y después. */
export async function contarTratamientos(cliente: Client, patientId: string): Promise<number> {
  const { rows } = await cliente.query<{ n: number }>(
    'SELECT count(*)::int AS n FROM clinical.prior_treatment WHERE patient_id = $1',
    [patientId],
  );
  return rows[0]?.n ?? 0;
}
