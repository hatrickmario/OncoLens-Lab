import type { AnalysisCompletion } from './ports.js';

/**
 * Adaptador PROVISIONAL de `AnalysisCompletion` (hasta L1D-104): no muestra resultados. Sin persistir el
 * `AIAnalysisRecord` no se puede responder `200` (RN-06), así que cierra siempre como `502 ERROR_SERVICIO_IA` genérico.
 */
export function crearCierreProvisional(): AnalysisCompletion {
  return {
    async completar() {
      return { tipo: 'error_servicio_ia' };
    },
  };
}
