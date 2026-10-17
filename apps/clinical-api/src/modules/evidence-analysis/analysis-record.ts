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
  RagQueryInternalResponse,
  SourcesSelected,
} from '../../../../../packages/api-contracts/src/client/rag-orchestrator/index.js';

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
  status: 'con_evidencia' | 'sin_evidencia';
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
