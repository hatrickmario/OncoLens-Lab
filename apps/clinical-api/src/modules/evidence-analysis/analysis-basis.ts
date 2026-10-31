import type { AnalysisBasis } from '../../../../../packages/api-contracts/src/client/clinical-api/index.js';
import type {
  ClinicalContext,
  RagQueryInternalRequest,
  RagQueryInternalResponse,
} from '../../../../../packages/api-contracts/src/client/rag-orchestrator/index.js';
import { verbalizarDatoDelContexto, type DatoDelContexto } from './analysis-basis.verbalizacion.js';
import {
  EtiquetaDeDatoCriticoNoDisponibleError,
  type AnalysisBasisBuilder,
  type EtiquetaDeDatoCritico,
} from './ports.js';

/** Limitación estructural fija de un `tipo_no_habilitado` (como `contracts/examples/tipo-no-habilitado.json`). */
const LIMITACION_TIPO_NO_HABILITADO: AnalysisBasis['limitations'][number] = {
  text: 'El tipo de cáncer no está habilitado en este entorno.',
  origin: 'estructural',
};

const FUENTES_EN_ORDEN = ['guias', 'ensayos', 'publicaciones'] as const;

/** Fuentes que el médico dejó seleccionadas, en el orden del contrato. */
function fuentesSeleccionadas(
  seleccion: RagQueryInternalRequest['sourcesSelected'],
): AnalysisBasis['sourcesConsulted']['selected'] {
  return FUENTES_EN_ORDEN.filter((fuente) => seleccion[fuente] === true);
}

/**
 * Los datos del paciente con procedencia que viajan a Backend 2, en el orden en que `construirContextoPermitido()`
 * les asigna el `dataRef`: diagnóstico, biomarcadores, atributos, tratamientos previos y eventos. Las notas clínicas
 * viajan vacías en el S1 (`verificarDesidentificado()` lo exige) y las tendencias y los análisis previos no son datos
 * del paciente con procedencia.
 */
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
 * Inciso (a): una entrada por dato del contexto desidentificado que se envió a Backend 2, en el orden de `datosDelContexto()`.
 * Los ejes de revisión se copian de la procedencia; los rechazados y reemplazados nunca llegan al contexto (RN-07).
 */
function datosDelPacienteUsados(contexto: ClinicalContext): AnalysisBasis['patientDataUsed'] {
  return datosDelContexto(contexto).map((entrada) => ({
    label: verbalizarDatoDelContexto(entrada),
    reviewStatus: entrada.dato.provenance.reviewStatus,
    conflict: entrada.dato.provenance.conflict,
  }));
}

/** Supuestos que verificó el LLM; la respuesta interna no trae su origen. */
function supuestosVerificados(respuesta: RagQueryInternalResponse): AnalysisBasis['assumptions'] {
  return respuesta.assumptions.map(({ text }) => ({ text, origin: 'llm_verificado' as const }));
}

/**
 * Inciso (b) (FR-27, AC-T2.2): SOLO la lista que `clinical-api` calculó y envió en el request interno (l1d-98); nunca
 * lo que la IA diga de faltantes. Es la misma lista que se persiste en `missing_critical_data`.
 */
function faltantesDeLaBase(request: RagQueryInternalRequest): string[] {
  return [...request.clinicalContext.missingCriticalData];
}

/**
 * Etiqueta `label.es` del catálogo de cada clave, en el mismo orden (D3). Una clave sin etiqueta falla cerrado: nunca se
 * inventa una etiqueta ni se descarta la clave (RN-27).
 */
export function etiquetarFaltantes(
  claves: readonly string[],
  etiquetaDe: EtiquetaDeDatoCritico,
): string[] {
  return claves.map((clave) => {
    const etiqueta = etiquetaDe(clave);
    if (etiqueta === undefined) throw new EtiquetaDeDatoCriticoNoDisponibleError();
    return etiqueta;
  });
}

/** D-d (US-238): la Base declara el rescate de la reescritura de la consulta; la reformulación nunca sale de Backend 2. */
export function declararReescrituraEnLaBase(_respuesta: RagQueryInternalResponse): boolean {
  throw new Error('no implementado');
}

/**
 * Base del análisis del S2 (FR-27, US-066): determinista y sin E/S. Función pura de la petición interna, la respuesta
 * interna y `continueWithWarning`; la sustituye en la raíz de composición sin tocar el service.
 */
export function crearBaseDelAnalisis(dependencias: {
  etiquetaDe: EtiquetaDeDatoCritico;
}): AnalysisBasisBuilder {
  return {
    construir(request, respuesta, continueWithWarning) {
      const faltantes = faltantesDeLaBase(request);
      return {
        patientDataUsed: datosDelPacienteUsados(request.clinicalContext),
        missingCriticalData: faltantes,
        missingCriticalDataLabels: etiquetarFaltantes(faltantes, dependencias.etiquetaDe),
        continuedWithWarning: continueWithWarning,
        assumptions: supuestosVerificados(respuesta),
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
        optionsNotShown: respuesta.optionsNotShown,
        maxOptions: request.maxOptions,
      };
    },
  };
}

export interface EntradaDeLaBaseSinIA {
  sourcesSelected: RagQueryInternalRequest['sourcesSelected'];
  filters: RagQueryInternalRequest['filtersApplied'];
  /** El médico siguió adelante pese a los avisos (`continueWithWarning` de la petición). */
  continuedWithWarning: boolean;
  /** `CORPUS_EXCLUDED_SOURCES` (RN-21). */
  sourcesNotIncluded: readonly string[];
  /** `CORPUS_CUTOFF_DATE` (`AAAA-MM-DD`, RN-22). */
  corpusCutoffDate: string;
}

/** Base del análisis de un `tipo_no_habilitado` (US-043 D7): no se consultó el corpus ni se envió ningún dato. */
export function construirBaseTipoNoHabilitado(entrada: EntradaDeLaBaseSinIA): AnalysisBasis {
  return {
    patientDataUsed: [],
    missingCriticalData: [],
    missingCriticalDataLabels: [],
    continuedWithWarning: entrada.continuedWithWarning,
    assumptions: [],
    sourcesConsulted: {
      selected: fuentesSeleccionadas(entrada.sourcesSelected),
      filters: entrada.filters,
      retrieved: 0,
      aboveThreshold: 0,
    },
    sourcesNotIncluded: [...entrada.sourcesNotIncluded],
    corpusCutoffDate: entrada.corpusCutoffDate,
    limitations: [{ ...LIMITACION_TIPO_NO_HABILITADO }],
    priorAnalysesUsed: [],
    agentSteps: [],
    omittedClaims: 0,
  };
}
