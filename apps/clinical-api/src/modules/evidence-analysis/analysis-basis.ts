import type { AnalysisBasisBuilder } from './ports.js';

export interface ConfiguracionDeLaBase {
  /** `ANALYSIS_BASIS_S1_ASSUMPTION_TEXT`: supuesto fijo de la Base del análisis del S1 (`[S1 resp. 30]`). */
  textoDelSupuesto: string;
}

/** Adaptador S1 de `AnalysisBasisBuilder` (US-066 lo sustituye en el S2). */
export function crearBaseDelAnalisisS1(_config: ConfiguracionDeLaBase): AnalysisBasisBuilder {
  return {
    construir() {
      throw new Error('no implementado');
    },
  };
}
