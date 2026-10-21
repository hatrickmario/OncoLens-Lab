import type { AnalysisBasis } from '../../../../../packages/api-contracts/src/client/clinical-api/index.js';
import type {
  ClinicalContext,
  RagQueryInternalRequest,
  RagQueryInternalResponse,
} from '../../../../../packages/api-contracts/src/client/rag-orchestrator/index.js';
import { verbalizarDatoDelContexto, type DatoDelContexto } from './analysis-basis.verbalizacion.js';
import type { AnalysisBasisBuilder } from './ports.js';

/**
 * Supuesto declarado mientras el inciso (b) no se calcule (US-128, S3/S4): sin él, `missingCriticalData = []` se
 * leería como "no falta nada". US-128 lo retira. Texto fijo del builder, no configurable (design 4).
 */
export const SUPUESTO_FALTANTES_NO_CALCULADOS: AnalysisBasis['assumptions'][number] = {
  text: 'Los faltantes críticos aún no se calculan en esta versión',
  origin: 'regla_catalogo',
};

const FUENTES_EN_ORDEN = ['guias', 'ensayos', 'publicaciones'] as const;

/** Fuentes que el médico dejó seleccionadas, en el orden del contrato. */
function fuentesSeleccionadas(
  seleccion: RagQueryInternalRequest['sourcesSelected'],
): AnalysisBasis['sourcesConsulted']['selected'] {
  return FUENTES_EN_ORDEN.filter((fuente) => seleccion[fuente] === true);
}

/** `r12` → 12: la referencia opaca que asigna `construirContextoPermitido()` es correlativa por petición. */
function posicionDeDataRef(dataRef: string): number {
  return Number(/^r(\d+)$/.exec(dataRef)?.[1] ?? Number.MAX_SAFE_INTEGER);
}

function datosDelContexto(contexto: ClinicalContext): DatoDelContexto[] {
  return [
    ...(contexto.diagnosis === null
      ? []
      : [{ tipo: 'diagnostico' as const, dato: contexto.diagnosis }]),
    ...contexto.biomarkers.map((dato) => ({ tipo: 'biomarcador' as const, dato })),
    ...contexto.attributes.map((dato) => ({ tipo: 'atributo' as const, dato })),
    ...contexto.priorTreatments.map((dato) => ({ tipo: 'tratamiento' as const, dato })),
    ...contexto.events.map((dato) => ({ tipo: 'evento' as const, dato })),
  ];
}

/**
 * Inciso (a): una entrada por dato del contexto desidentificado que se envió a Backend 2, en el orden de su `dataRef`.
 * Los ejes de revisión se copian de la procedencia; los rechazados y reemplazados nunca llegan al contexto (RN-07).
 */
function datosDelPacienteUsados(contexto: ClinicalContext): AnalysisBasis['patientDataUsed'] {
  return datosDelContexto(contexto)
    .sort((a, b) => posicionDeDataRef(a.dato.dataRef) - posicionDeDataRef(b.dato.dataRef))
    .map((entrada) => ({
      label: verbalizarDatoDelContexto(entrada),
      reviewStatus: entrada.dato.provenance.reviewStatus,
      conflict: entrada.dato.provenance.conflict,
    }));
}

/** Supuestos que verificó el LLM (la respuesta interna no trae su origen) tras el supuesto declarado del builder. */
function supuestosVerificados(respuesta: RagQueryInternalResponse): AnalysisBasis['assumptions'] {
  return respuesta.assumptions.map(({ text }) => ({ text, origin: 'llm_verificado' as const }));
}

/**
 * Base del análisis del S2 (FR-27, US-066): determinista y sin E/S. Función pura de la petición interna, la respuesta
 * interna y `continueWithWarning`; la sustituye en la raíz de composición sin tocar el service.
 */
export function crearBaseDelAnalisis(): AnalysisBasisBuilder {
  return {
    construir(request, respuesta, continueWithWarning) {
      return {
        patientDataUsed: datosDelPacienteUsados(request.clinicalContext),
        missingCriticalData: [],
        continuedWithWarning: continueWithWarning,
        assumptions: [{ ...SUPUESTO_FALTANTES_NO_CALCULADOS }, ...supuestosVerificados(respuesta)],
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
