/** AC-14 [FR-27, Pre-S1 resp. 15, E-02]: publishedFromYear existe en ambas peticiones y en AnalysisBasis, nullable, requerido en Backend 2. */
import { reporter } from '../lib/findings.mjs';
import { missingFragments } from '../lib/text.mjs';
import { CLINICAL_API, RAG_ORCHESTRATOR, fileOf, schemaOf, schemaPointer } from '../lib/specs.mjs';

const report = reporter('assertPublishedFromYear', 'AC-14');

/** `[spec, schema, requerido]`: dónde vive el filtro y si la petición lo exige. */
const LOCATIONS = [
  [CLINICAL_API, 'EvidenceAnalysisFilters', false],
  [CLINICAL_API, 'AppliedFilters', true],
  [RAG_ORCHESTRATOR, 'RagFiltersApplied', true],
];
const REQUESTS_WITH_FILTERS = [
  [RAG_ORCHESTRATOR, 'RagQueryInternalRequest'],
  [RAG_ORCHESTRATOR, 'RagFollowUpRequest'],
];

const isNullableInteger = (property) => Array.isArray(property?.type) && property.type.includes('integer') && property.type.includes('null');

function checkLocation(specs, [spec, schemaName, mustBeRequired]) {
  const schema = schemaOf(specs, spec, schemaName);
  const pointer = `${schemaPointer(schemaName)}/properties/publishedFromYear`;
  const file = fileOf(specs, spec, pointer);
  const property = schema?.properties?.publishedFromYear;
  if (!property) return [report(file, pointer, `${schemaName} debe declarar publishedFromYear`)];
  const found = [];
  if (!isNullableInteger(property)) found.push(report(file, pointer, 'publishedFromYear debe ser integer | null (null = toda la evidencia)'));
  if (mustBeRequired && !(schema.required ?? []).includes('publishedFromYear')) found.push(report(file, `${schemaPointer(schemaName)}/required`, `${schemaName} debe exigir publishedFromYear (valor efectivo)`));
  return found;
}

function checkDefaultDescription(specs) {
  const property = schemaOf(specs, CLINICAL_API, 'EvidenceAnalysisFilters')?.properties?.publishedFromYear;
  const pointer = `${schemaPointer('EvidenceAnalysisFilters')}/properties/publishedFromYear/description`;
  return missingFragments(property?.description, ['EVIDENCE_DEFAULT_YEARS']).length === 0
    ? []
    : [report(specs[CLINICAL_API].file, pointer, 'la descripción debe remitir a EVIDENCE_DEFAULT_YEARS (valor por defecto cuando la petición no lo trae)')];
}

function checkRequests(specs) {
  return REQUESTS_WITH_FILTERS.filter(([spec, name]) => !(schemaOf(specs, spec, name)?.required ?? []).includes('filtersApplied'))
    .map(([spec, name]) => report(specs[spec].file, `${schemaPointer(name)}/required`, `${name} debe exigir filtersApplied (valor efectivo de publishedFromYear)`));
}

export function assertPublishedFromYear(specs) {
  if (!specs[CLINICAL_API].bundled || !specs[RAG_ORCHESTRATOR].bundled) return [];
  return [...LOCATIONS.flatMap((location) => checkLocation(specs, location)), ...checkDefaultDescription(specs), ...checkRequests(specs)];
}
