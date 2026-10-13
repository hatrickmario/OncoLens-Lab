/** Dónde vive cada entrada y cada salida del tooling de contratos, relativo a la raíz del repositorio. Sin E/S. */

export const PATHS = {
  specs: {
    'clinical-api': 'apps/clinical-api/openapi.yaml',
    'rag-orchestrator': 'apps/rag-orchestrator/openapi.yaml',
  },
};

/** Esqueleto (rojo de DPR-5): todavía no arma la cabecera desde PATHS. */
export function generatedHeader(provider, comment = '//') {
  return '';
}
