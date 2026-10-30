import { readFileSync } from 'node:fs';
import type { Express } from 'express';
import { componerCompletitud } from '../../src/modules/completeness/completeness.module.js';
import { completenessController } from '../../src/modules/completeness/completeness.controller.js';
import type { CompletenessService } from '../../src/modules/completeness/ports.js';
import { crearTiposHabilitados } from '../../src/modules/evidence-analysis/tipos-habilitados.js';
import { appConAuth } from './app-auth.js';
import { RUTA_CATALOGO_TEST_1_0_0, leerTexto } from './completitud.js';
import { AHORA, TRACE_ID_GENERADO, type MundoDeGateway } from './gateway.js';
import { loggerEnMemoria, relojFijo, tokensFijos, type LoggerEnMemoria } from './usuarios.js';

/**
 * Soporte de los tests de `GET /platform/patients/{id}/completeness` (L1D-95): la aplicación de producción (login →
 * guard → completitud) sobre la base del mundo. Todo dato es sintético (RN-13, RN-14).
 */

export const TIPOS_DE_TEST = ['mama', 'prostata'] as const;

export interface OpcionesDeCompletitud {
  /** Catálogo montado (`CLINICAL_CATALOG_PATH`); por defecto el fixture FX-04-a `test-1.0.0`. */
  rutaDelCatalogo?: string;
  /** `ENABLED_CANCER_TYPES` de la prueba; por defecto los dos tipos del catálogo. */
  habilitados?: readonly string[];
  /** Envuelve al servicio real (p. ej. para contar invocaciones): es un puerto, no un módulo propio. */
  envolver?: (real: CompletenessService) => CompletenessService;
}

export interface AppDeCompletitud {
  readonly app: Express;
  readonly logger: LoggerEnMemoria;
  readonly servicio: CompletenessService;
}

export function servicioDeCompletitud(
  mundo: MundoDeGateway,
  opciones: OpcionesDeCompletitud = {},
): CompletenessService {
  return componerCompletitud({
    db: mundo.cliente,
    rutaDelCatalogo: opciones.rutaDelCatalogo ?? RUTA_CATALOGO_TEST_1_0_0,
    leerArchivo: leerTexto,
    tiposHabilitados: crearTiposHabilitados(opciones.habilitados ?? TIPOS_DE_TEST, TIPOS_DE_TEST),
  });
}

export function montarCompletitud(
  mundo: MundoDeGateway,
  opciones: OpcionesDeCompletitud = {},
): AppDeCompletitud {
  const logger = loggerEnMemoria();
  const real = servicioDeCompletitud(mundo, opciones);
  const servicio = opciones.envolver?.(real) ?? real;
  const router = completenessController({
    service: servicio,
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
  return { app, logger, servicio };
}

/** `label.es` de cada ítem del `datos-criticos.json` de un tipo del catálogo de test: la fuente de las etiquetas esperadas. */
export function etiquetasDelCatalogo(
  tipo: 'mama' | 'prostata',
  ruta: string = RUTA_CATALOGO_TEST_1_0_0,
): Record<string, string> {
  const archivo = JSON.parse(readFileSync(`${ruta}/${tipo}/datos-criticos.json`, 'utf8')) as {
    items: { key: string; label: { es: string } }[];
  };
  return Object.fromEntries(archivo.items.map((item) => [item.key, item.label.es]));
}
