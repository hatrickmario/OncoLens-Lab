/** AC-1 [ADR-26]: EvidenceAnalysis declara los bloques congelados, aunque vayan vacíos, y el enum de status exacto. */
import { reporter } from '../lib/findings.mjs';
import { lacking, sameMembers } from '../lib/sets.mjs';
import { schemaOf, schemaPointer, CLINICAL_API } from '../lib/specs.mjs';

const report = reporter('assertEvidenceAnalysisShape', 'AC-1');

/** Campos `required` de EvidenceAnalysis (design.md D7). */
export const FROZEN_FIELDS = [
  'id',
  'traceId',
  'queryText',
  'questionTemplateId',
  'queryLanguage',
  'status',
  'synthesis',
  'applicability',
  'evidenceOptions',
  'discardedOptions',
  'analysisBasis',
  'topRelevanceScore',
  'staleness',
  'rerunOfAnalysisId',
  'patientDataLinks',
  'disclaimer',
  'createdAt',
];

const STATUS_VALUES = ['con_evidencia', 'sin_evidencia', 'tipo_no_habilitado'];

export function assertEvidenceAnalysisShape(specs) {
  const file = specs[CLINICAL_API].file;
  const schema = schemaOf(specs, CLINICAL_API, 'EvidenceAnalysis');
  const pointer = schemaPointer('EvidenceAnalysis');
  if (!schema) return [report(file, pointer, 'falta el schema EvidenceAnalysis')];
  const found = [];
  for (const field of lacking(schema.required, FROZEN_FIELDS)) {
    found.push(report(file, `${pointer}/required`, `EvidenceAnalysis debe exigir ${field} (bloque de ADR-26, obligatorio aunque vaya vacío)`));
  }
  const status = schema.properties?.status?.enum ?? [];
  if (!sameMembers(status, STATUS_VALUES)) {
    found.push(report(file, `${pointer}/properties/status/enum`, `status debe ser exactamente ${STATUS_VALUES.join(' | ')}`));
  }
  const score = schema.properties?.topRelevanceScore?.type;
  if (!Array.isArray(score) || !score.includes('null') || !score.includes('number')) {
    found.push(report(file, `${pointer}/properties/topRelevanceScore/type`, 'topRelevanceScore debe ser number | null (RN-02)'));
  }
  return found;
}
