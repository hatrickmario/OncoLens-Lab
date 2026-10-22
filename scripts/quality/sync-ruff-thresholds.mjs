// Sincroniza los umbrales de Ruff de rag-orchestrator con quality-thresholds.json (L1D-263, tarea 2.2, RN-22).
// Sin argumentos reescribe apps/rag-orchestrator/pyproject.toml; con `--check` solo verifica (lo usa la CI).

/** Devuelve el pyproject con el bloque de umbrales generado desde `umbrales`. Pura: sin E/S. */
export function sincronizarPyproject() {
  throw new Error('no implementado');
}

/** `true` si el pyproject ya contiene exactamente el bloque que generarían `umbrales`. */
export function estaSincronizado() {
  throw new Error('no implementado');
}
