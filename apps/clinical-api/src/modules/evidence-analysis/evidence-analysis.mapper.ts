import type { EvidenceAnalysis } from '../../../../../packages/api-contracts/src/client/clinical-api/index.js';
import type { RegistroDeAnalisis } from './analysis-record.js';

/**
 * `EvidenceAnalysis` de la respuesta `200`, construido desde lo persistido (no desde la respuesta de Backend 2): lo que
 * el oncólogo ve es, por construcción, lo que quedó registrado (RN-06). La vigencia de un análisis nuevo es neutra;
 * el detector de vigencia la calcula después.
 */
export function aEvidenceAnalysis(
  registro: RegistroDeAnalisis,
  disclaimer: string,
): EvidenceAnalysis {
  return {
    id: registro.id,
    traceId: registro.traceId,
    queryText: registro.queryText,
    questionTemplateId: registro.questionTemplateId,
    queryLanguage: registro.queryLanguage,
    status: registro.status,
    synthesis: registro.synthesis,
    applicability: registro.applicability,
    evidenceOptions: registro.evidenceOptions,
    discardedOptions: registro.discardedOptions,
    analysisBasis: registro.analysisBasis,
    topRelevanceScore: registro.topRelevanceScore,
    staleness: { patientData: false, changedData: [], newerEvidenceOrCatalog: false },
    rerunOfAnalysisId: registro.rerunOfAnalysisId,
    patientDataLinks: registro.patientDataLinks,
    disclaimer,
    createdAt: registro.createdAt.toISOString(),
  };
}
