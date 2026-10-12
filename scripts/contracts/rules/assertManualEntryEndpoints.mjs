/** AC-10 [§15 resp. 4, Q-03, ADR-33]: el registro manual de biomarcadores y diagnósticos está declarado con sus respuestas. */
import { reporter } from '../lib/findings.mjs';
import { findOperation, findResponse, jsonSchemaOf, labelOf } from '../lib/operations.mjs';
import { missingFragments } from '../lib/text.mjs';
import { CLINICAL_API, schemaPointer } from '../lib/specs.mjs';

const report = reporter('assertManualEntryEndpoints', 'AC-10');

/** Cada endpoint: la ruta, el schema de su 201 y lo que su descripción debe fijar. */
const ENDPOINTS = [
  { route: '/platform/patients/{patientId}/biomarkers', created: 'Biomarker', mustSay: ['entry_method = manual'] },
  { route: '/platform/patients/{patientId}/diagnoses', created: 'Diagnosis', mustSay: ['manual_correction', 'reemplazado'] },
];
const ERROR_STATUSES = [401, 403, 404, 422];

function checkEndpoint(spec, file, endpoint) {
  const entry = findOperation(spec, 'post', endpoint.route);
  if (!entry) return [report(file, `#/paths/${endpoint.route.replaceAll('/', '~1')}`, `falta POST ${endpoint.route}`)];
  const found = [];
  const created = findResponse(spec, entry, 201);
  const schema = created && jsonSchemaOf(spec, created);
  if (schema?.pointer !== schemaPointer(endpoint.created)) {
    found.push(report(file, `${entry.pointer}/responses/201`, `${labelOf(entry)} debe responder 201 con ${endpoint.created}`));
  }
  for (const status of ERROR_STATUSES.filter((code) => !findResponse(spec, entry, code))) {
    found.push(report(file, `${entry.pointer}/responses/${status}`, `${labelOf(entry)} debe declarar ${status}`));
  }
  for (const fragment of missingFragments(entry.operation.description, endpoint.mustSay)) {
    found.push(report(file, `${entry.pointer}/description`, `la descripción de ${labelOf(entry)} debe fijar "${fragment}"`));
  }
  return found;
}

export function assertManualEntryEndpoints(specs) {
  const { file, bundled } = specs[CLINICAL_API];
  return bundled ? ENDPOINTS.flatMap((endpoint) => checkEndpoint(bundled, file, endpoint)) : [];
}
