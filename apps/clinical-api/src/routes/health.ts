import { Router } from 'express';

/** Lo que `/health` expone de la configuración: solo nombres de claves y la versión, nunca valores (RN-14). */
export interface InformacionDeSalud {
  readonly configKeys: readonly string[];
  readonly serviceVersion: string;
  /** Versión del catálogo clínico montado (`manifest.json`); sin ruta ni contenido. Ausente si no se inyecta. */
  readonly catalogVersion?: string;
}

/** Sin información inyectada (`createApp({})`): ninguna clave y versión desconocida, pero siempre las dos propiedades. */
export const SALUD_POR_DEFECTO: InformacionDeSalud = {
  configKeys: [],
  serviceVersion: 'desconocida',
};

/**
 * `GET /health` (contrato: getHealth). Solo indica que el proceso está listo.
 * No consulta a rag-orchestrator: con el LLM caído sigue respondiendo 200 (US-034 AC-4).
 */
export function createHealthRouter(salud: InformacionDeSalud = SALUD_POR_DEFECTO): Router {
  const router = Router();
  router.get('/health', (_request, response) => {
    response.json({
      status: 'ok',
      configKeys: salud.configKeys,
      serviceVersion: salud.serviceVersion,
      ...(salud.catalogVersion !== undefined && { catalogVersion: salud.catalogVersion }),
    });
  });
  return router;
}
