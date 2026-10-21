import type { AnalysisBasis } from '../../../../../packages/api-contracts/src/client/clinical-api/index.js';
import type {
  RagQueryInternalRequest,
  RagQueryInternalResponse,
} from '../../../../../packages/api-contracts/src/client/rag-orchestrator/index.js';
import type { AnalysisBasisBuilder } from './ports.js';

export interface ConfiguracionDeLaBase {
  /** `ANALYSIS_BASIS_S1_ASSUMPTION_TEXT`: supuesto fijo de la Base del análisis del S1 (`[S1 resp. 30]`). */
  textoDelSupuesto: string;
}

const FUENTES_EN_ORDEN = ['guias', 'ensayos', 'publicaciones'] as const;

/** Fuentes que el médico dejó seleccionadas, en el orden del contrato. */
function fuentesSeleccionadas(
  seleccion: RagQueryInternalRequest['sourcesSelected'],
): AnalysisBasis['sourcesConsulted']['selected'] {
  return FUENTES_EN_ORDEN.filter((fuente) => seleccion[fuente] === true);
}

/**
 * Supuestos de la Base: los que verificó el LLM (vienen sin origen en la respuesta interna) y, al final, el supuesto
 * fijo del S1 que impide leer las listas vacías como "no se usaron datos" ni "no faltan datos".
 */
function supuestosDeLaBase(
  respuesta: RagQueryInternalResponse,
  textoDelSupuesto: string,
): AnalysisBasis['assumptions'] {
  return [
    ...respuesta.assumptions.map(({ text }) => ({ text, origin: 'llm_verificado' as const })),
    { text: textoDelSupuesto, origin: 'regla_catalogo' as const },
  ];
}

/** Base del análisis del S2 (US-066): esqueleto; la implementación llega con su `feat`. */
export function crearBaseDelAnalisis(): AnalysisBasisBuilder {
  return {
    construir() {
      throw new Error('no implementado');
    },
  };
}

/**
 * `construirBaseS1()`: la Base del análisis mínima del S1, con la forma final del contrato y lo que ya devuelve
 * Backend 2. El detalle de datos usados y faltantes llega con US-066 (S2), que sustituye este adaptador.
 */
export function crearBaseDelAnalisisS1(config: ConfiguracionDeLaBase): AnalysisBasisBuilder {
  return {
    construir(request, respuesta, continueWithWarning) {
      return {
        patientDataUsed: [],
        missingCriticalData: [],
        continuedWithWarning: continueWithWarning,
        assumptions: supuestosDeLaBase(respuesta, config.textoDelSupuesto),
        sourcesConsulted: {
          selected: fuentesSeleccionadas(request.sourcesSelected),
          filters: request.filtersApplied,
          retrieved: respuesta.retrievalStats.retrieved,
          aboveThreshold: respuesta.retrievalStats.aboveThreshold,
        },
        sourcesNotIncluded: respuesta.meta.excludedSources,
        corpusCutoffDate: respuesta.meta.corpusCutoffDate,
        limitations: respuesta.limitations,
        priorAnalysesUsed: [],
        agentSteps: respuesta.agentSteps,
        omittedClaims: respuesta.omittedClaims,
      };
    },
  };
}
