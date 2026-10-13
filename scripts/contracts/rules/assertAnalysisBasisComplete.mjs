/** AC-4 [FR-27, AC-T2.1]: AnalysisBasis exige sus once campos, aunque varios se llenen en sprints posteriores, y filters es cerrado con publishedFromYear. */
import { reporter } from '../lib/findings.mjs';
import { lacking } from '../lib/sets.mjs';
import { CLINICAL_API, fileOf, schemaOf, schemaPointer } from '../lib/specs.mjs';

const report = reporter('assertAnalysisBasisComplete', 'AC-4');

export const BASIS_FIELDS = [
  'patientDataUsed',
  'missingCriticalData',
  'continuedWithWarning',
  'assumptions',
  'sourcesConsulted',
  'sourcesNotIncluded',
  'corpusCutoffDate',
  'limitations',
  'priorAnalysesUsed',
  'agentSteps',
  'omittedClaims',
];

export const APPLIED_FILTERS_FIELDS = [
  'historiaCompleta',
  'soloBiomarcadoresRelevantes',
  'ultimosSeisMeses',
  'antecedentesFamiliares',
  'publishedFromYear',
];

function checkFilters(specs) {
  const pointer = schemaPointer('AppliedFilters');
  const file = fileOf(specs, CLINICAL_API, pointer);
  const filters = schemaOf(specs, CLINICAL_API, 'AppliedFilters');
  if (!filters) return [report(file, pointer, 'falta el schema AppliedFilters (sourcesConsulted.filters)')];
  const found = lacking(filters.required, APPLIED_FILTERS_FIELDS).map((name) => report(file, `${pointer}/required`, `AppliedFilters debe exigir ${name}`));
  for (const name of lacking(Object.keys(filters.properties ?? {}), APPLIED_FILTERS_FIELDS)) {
    found.push(report(file, `${pointer}/properties`, `AppliedFilters debe declarar ${name}`));
  }
  if (filters.additionalProperties !== false) found.push(report(file, pointer, 'AppliedFilters debe ser cerrado (additionalProperties: false)'));
  return found;
}

export function assertAnalysisBasisComplete(specs) {
  const pointer = schemaPointer('AnalysisBasis');
  const file = fileOf(specs, CLINICAL_API, pointer);
  const basis = schemaOf(specs, CLINICAL_API, 'AnalysisBasis');
  if (!basis) return [report(file, pointer, 'falta el schema AnalysisBasis')];
  const found = lacking(basis.required, BASIS_FIELDS).map((name) => report(file, `${pointer}/required`, `AnalysisBasis debe exigir ${name}`));
  for (const name of lacking(Object.keys(basis.properties ?? {}), BASIS_FIELDS)) {
    found.push(report(file, `${pointer}/properties`, `AnalysisBasis debe declarar ${name}`));
  }
  const consulted = basis.properties?.sourcesConsulted;
  const filtersRef = consulted?.properties?.filters?.$ref;
  if (!consulted?.required?.includes('filters') || filtersRef !== schemaPointer('AppliedFilters')) {
    found.push(report(file, `${pointer}/properties/sourcesConsulted/properties/filters`, 'sourcesConsulted.filters debe ser un AppliedFilters requerido'));
  }
  return [...found, ...checkFilters(specs)];
}
