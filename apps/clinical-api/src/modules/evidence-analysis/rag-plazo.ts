/**
 * Plazo de una llamada a rag-orchestrator (RN-22): aborta la llamada al vencer `ragTimeoutMs`. El temporizador se limpia
 * siempre, también cuando la llamada falla.
 */
export async function llamarConPlazo<T>(
  ragTimeoutMs: number,
  llamada: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controlador = new AbortController();
  const temporizador = setTimeout(() => {
    controlador.abort();
  }, ragTimeoutMs);
  try {
    return await llamada(controlador.signal);
  } finally {
    clearTimeout(temporizador);
  }
}
