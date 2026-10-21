import { createHash } from 'node:crypto';
import type {
  AnalysisBasis,
  AppliedFilters,
  DiscardedOption,
  EvidenceOption,
  PatientDataLink,
  SourceApplicability,
  Synthesis,
} from '../../../../../packages/api-contracts/src/client/clinical-api/index.js';
import type {
  ClinicalContext,
  DataClassification,
  RagQueryInternalRequest,
  RagQueryInternalResponse,
  SourcesSelected,
} from '../../../../../packages/api-contracts/src/client/rag-orchestrator/index.js';
import type { MapaDeDataRefs } from './ports.js';

/** Fila de `clinical.ai_analysis_record` de un análisis de evidencia, en camelCase (data-model.md §4.3). Inmutable. */
export interface RegistroDeAnalisis {
  id: string;
  patientId: string;
  episodeId: string;
  requestedBy: string;
  analysisType: 'analisis_evidencia';
  /** El `traceId` generado por clinical-api, nunca el `X-Trace-Id` entrante. */
  traceId: string;
  /** Pregunta en su versión desidentificada (RN-11). */
  queryText: string;
  questionTemplateId: string | null;
  queryLanguage: 'es' | 'en';
  responseLanguage: 'es' | 'en';
  sourcesSelected: SourcesSelected;
  filtersApplied: AppliedFilters;
  synthesis: Synthesis;
  applicability: SourceApplicability[];
  evidenceOptions: EvidenceOption[];
  discardedOptions: DiscardedOption[];
  caseSummary: null;
  analysisBasis: AnalysisBasis;
  agentSteps: AnalysisBasis['agentSteps'];
  omittedClaims: number;
  missingCriticalData: string[];
  continuedWithWarning: boolean;
  priorAnalysesUsed: string[];
  patientDataLinks: PatientDataLink[];
  /** Copiado de Backend 2 (RN-02): `null` cuando no hay evidencia, nunca `0`. */
  topRelevanceScore: number | null;
  status: 'con_evidencia' | 'sin_evidencia' | 'tipo_no_habilitado';
  /** Contexto enviado a Backend 2 en su versión desidentificada y SIN `pseudoPatientId` (RN-11). */
  clinicalContextSnapshot: Omit<ClinicalContext, 'pseudoPatientId'>;
  /** SHA-256 hexadecimal del JSON canónico (claves ordenadas) del snapshot. */
  contextFingerprint: string;
  rerunOfAnalysisId: null;
  dataClassification: DataClassification;
  llmProvider: string | null;
  llmModel: string | null;
  embeddingModel: string | null;
  rerankerModel: string | null;
  nliModel: string | null;
  promptVersion: string | null;
  corpusRelease: string | null;
  catalogVersion: string;
  retrievalParams: RagQueryInternalResponse['meta']['retrievalParams'] | null;
  createdAt: Date;
}

export interface EntradaDelRegistro {
  /** UUID del registro (generador inyectado). */
  id: string;
  /** Instante de creación (reloj inyectado). */
  creadoEn: Date;
  traceId: string;
  patientId: string;
  episodeId: string;
  userId: string;
  questionTemplateId: string | null;
  continueWithWarning: boolean;
  request: RagQueryInternalRequest;
  dataRefs: MapaDeDataRefs;
  respuesta: RagQueryInternalResponse;
  base: AnalysisBasis;
  topRelevanceScore: number | null;
}

/** JSON con las claves de los objetos ordenadas a cualquier profundidad: la misma información, la misma cadena. */
function jsonCanonico(valor: unknown): string {
  if (Array.isArray(valor)) return `[${valor.map(jsonCanonico).join(',')}]`;
  if (valor !== null && typeof valor === 'object') {
    const campos = Object.entries(valor)
      .sort(([uno], [otro]) => (uno < otro ? -1 : 1))
      .map(([clave, contenido]) => `${JSON.stringify(clave)}:${jsonCanonico(contenido)}`);
    return `{${campos.join(',')}}`;
  }
  return JSON.stringify(valor);
}

/** SHA-256 hexadecimal del JSON canónico del snapshot: detecta después si el contexto cambió (FR-12). */
export function huellaDelContexto(snapshot: unknown): string {
  return createHash('sha256').update(jsonCanonico(snapshot)).digest('hex');
}

/** Orden numérico de `r1…rN` (`r10` va después de `r2`). */
const numeroDeReferencia = (dataRef: string): number => Number(dataRef.slice(1));

function enlacesDeDatos(dataRefs: MapaDeDataRefs): PatientDataLink[] {
  return [...dataRefs.entries()]
    .sort(([uno], [otro]) => numeroDeReferencia(uno) - numeroDeReferencia(otro))
    .map(([dataRef, { tabla, id }]) => ({ dataRef, entityType: tabla, entityId: id }));
}

/** Snapshot del contexto enviado, sin el seudónimo de la consulta (RN-11). */
function snapshotSinSeudonimo(
  request: RagQueryInternalRequest,
): RegistroDeAnalisis['clinicalContextSnapshot'] {
  const { pseudoPatientId, ...snapshot } = request.clinicalContext;
  void pseudoPatientId; // el seudónimo es de la consulta: no se persiste (RN-11)
  return snapshot;
}

type CamposBase = Pick<
  RegistroDeAnalisis,
  | 'id'
  | 'patientId'
  | 'episodeId'
  | 'requestedBy'
  | 'analysisType'
  | 'traceId'
  | 'questionTemplateId'
  | 'caseSummary'
  | 'analysisBasis'
  | 'missingCriticalData'
  | 'continuedWithWarning'
  | 'priorAnalysesUsed'
  | 'rerunOfAnalysisId'
  | 'createdAt'
>;

/** Lo que comparten el registro con IA y el de `tipo_no_habilitado`: identidad, trazabilidad y los vacíos del S2. */
function registroBase(
  entrada: Pick<
    EntradaDelRegistro,
    | 'id'
    | 'patientId'
    | 'episodeId'
    | 'userId'
    | 'traceId'
    | 'questionTemplateId'
    | 'base'
    | 'continueWithWarning'
    | 'creadoEn'
  >,
): CamposBase {
  return {
    id: entrada.id,
    patientId: entrada.patientId,
    episodeId: entrada.episodeId,
    requestedBy: entrada.userId,
    analysisType: 'analisis_evidencia',
    traceId: entrada.traceId,
    questionTemplateId: entrada.questionTemplateId,
    caseSummary: null,
    analysisBasis: entrada.base,
    missingCriticalData: [],
    continuedWithWarning: entrada.continueWithWarning,
    priorAnalysesUsed: [],
    rerunOfAnalysisId: null,
    createdAt: entrada.creadoEn,
  };
}

/**
 * Función pura: arma el `AIAnalysisRecord` (data-model.md §4.3) con lo enviado a Backend 2, lo recibido y la Base del
 * análisis. Reloj e identificador llegan inyectados.
 */
export function armarRegistro(entrada: EntradaDelRegistro): RegistroDeAnalisis {
  const { request, respuesta } = entrada;
  const snapshot = snapshotSinSeudonimo(request);
  const { meta } = respuesta;
  return {
    ...registroBase(entrada),
    queryText: request.query,
    queryLanguage: meta.queryLanguage,
    responseLanguage: meta.responseLanguage,
    sourcesSelected: request.sourcesSelected,
    filtersApplied: request.filtersApplied,
    synthesis: respuesta.synthesis,
    applicability: respuesta.applicability,
    evidenceOptions: respuesta.evidenceOptions,
    discardedOptions: respuesta.discardedOptions,
    agentSteps: respuesta.agentSteps,
    omittedClaims: respuesta.omittedClaims,
    patientDataLinks: enlacesDeDatos(entrada.dataRefs),
    topRelevanceScore: entrada.topRelevanceScore,
    status: respuesta.status,
    clinicalContextSnapshot: snapshot,
    contextFingerprint: huellaDelContexto(snapshot),
    dataClassification: request.dataClassification,
    llmProvider: meta.llmProvider,
    llmModel: meta.llmModel,
    embeddingModel: meta.embeddingModel,
    rerankerModel: meta.rerankerModel,
    nliModel: meta.nliModel,
    promptVersion: meta.promptVersion,
    corpusRelease: meta.corpusRelease,
    catalogVersion: meta.catalogVersion,
    retrievalParams: meta.retrievalParams,
  };
}

export interface EntradaDelRegistroSinIA {
  /** UUID del registro (generador inyectado). */
  id: string;
  /** Instante de creación (reloj inyectado). */
  creadoEn: Date;
  traceId: string;
  patientId: string;
  episodeId: string;
  userId: string;
  questionTemplateId: string | null;
  continueWithWarning: boolean;
  /** Pregunta ya desidentificada (RN-11). */
  query: string;
  sourcesSelected: SourcesSelected;
  filtersApplied: AppliedFilters;
  dataClassification: DataClassification;
  catalogVersion: string;
  /** Contexto sin datos del paciente (nada se envió): lo único que se guarda como snapshot. */
  contextoVacio: RegistroDeAnalisis['clinicalContextSnapshot'];
  base: AnalysisBasis;
}

/**
 * Registro de un `tipo_no_habilitado` (US-043, RN-06): no hubo llamada a Backend 2, así que no hay modelos, versión de
 * prompt, release del corpus ni parámetros de recuperación, y el puntaje es `null` (RN-02). Los idiomas son los del
 * producto (español): sin Backend 2 no hay detección de idioma.
 */
export function armarRegistroTipoNoHabilitado(
  entrada: EntradaDelRegistroSinIA,
): RegistroDeAnalisis {
  return {
    ...registroBase(entrada),
    queryText: entrada.query,
    queryLanguage: 'es',
    responseLanguage: 'es',
    sourcesSelected: entrada.sourcesSelected,
    filtersApplied: entrada.filtersApplied,
    synthesis: { agreements: [], discrepancies: [] },
    applicability: [],
    evidenceOptions: [],
    discardedOptions: [],
    agentSteps: [],
    omittedClaims: 0,
    patientDataLinks: [],
    topRelevanceScore: null,
    status: 'tipo_no_habilitado',
    clinicalContextSnapshot: entrada.contextoVacio,
    contextFingerprint: huellaDelContexto(entrada.contextoVacio),
    dataClassification: entrada.dataClassification,
    llmProvider: null,
    llmModel: null,
    embeddingModel: null,
    rerankerModel: null,
    nliModel: null,
    promptVersion: null,
    corpusRelease: null,
    catalogVersion: entrada.catalogVersion,
    retrievalParams: null,
  };
}
