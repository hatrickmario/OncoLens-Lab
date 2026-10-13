/** AC-7 [C-06, AC-11.4]: el análisis aparece en el timeline como evento derivado; la operación no escribe un evento analisis_ia. */
import { reporter } from '../lib/findings.mjs';
import { findOperation } from '../lib/operations.mjs';
import { missingFragments } from '../lib/text.mjs';
import { CLINICAL_API } from '../lib/specs.mjs';

const report = reporter('assertDerivedEventDescription', 'AC-7');

const ROUTE = '/platform/evidence-analyses';
const WRITES_ANALYSIS_EVENT = /evento\s+[`'"]?analisis_ia/i;

export function assertDerivedEventDescription(specs) {
  const { file, bundled } = specs[CLINICAL_API];
  const entry = findOperation(bundled, 'post', ROUTE);
  if (!entry) return [];
  const description = entry.operation.description ?? '';
  const found = [];
  if (missingFragments(description, ['evento derivado']).length > 0) {
    found.push(report(file, `${entry.pointer}/description`, 'POST /platform/evidence-analyses debe decir que el análisis aparece en el timeline como evento derivado'));
  }
  if (WRITES_ANALYSIS_EVENT.test(description)) {
    found.push(report(file, `${entry.pointer}/description`, 'POST /platform/evidence-analyses no debe mencionar la escritura de un evento analisis_ia'));
  }
  return found;
}
