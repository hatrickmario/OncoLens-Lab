import type { Clock } from '../../infrastructure/clock.js';
import type { GeneradorDeIds } from '../../infrastructure/ids.js';
import type { AnalisisRepository } from './evidence-analysis.repository.js';
import type { AnalysisBasisBuilder, AnalysisCompletion } from './ports.js';

export interface DependenciasDelCierre {
  analisis: AnalisisRepository;
  base: AnalysisBasisBuilder;
  reloj: Clock;
  /** Identificadores del `AIAnalysisRecord` (UUID); distintos del generador de `traceId`. */
  idsDeAnalisis: GeneradorDeIds;
  /** `AI_DISCLAIMER_TEXT` (literal de US-069). */
  disclaimer: string;
}

/**
 * Cierre del análisis (RN-06): valida la respuesta interna, persiste el `AIAnalysisRecord` y solo entonces
 * responde desde lo persistido.
 */
export function crearAnalysisCompletion(_dependencias: DependenciasDelCierre): AnalysisCompletion {
  return {
    async completar() {
      throw new Error('no implementado');
    },
  };
}
