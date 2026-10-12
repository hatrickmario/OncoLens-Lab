/** AC-1: ambos specs y el archivo compartido existen, son OpenAPI 3.1 con versión semántica y el spec de clinical-api trae las operaciones del S1. */
import { reporter } from '../lib/findings.mjs';
import { findOperation } from '../lib/operations.mjs';
import { CLINICAL_API, EVIDENCE, PROVIDERS } from '../lib/specs.mjs';

const report = reporter('assertSpecVersions', 'AC-1');

const OPENAPI_3_1 = /^3\.1\.\d+$/;
const SEMANTIC_VERSION = /^\d+\.\d+\.\d+$/;

/** Operaciones que `clinical-api` declara antes de la primera implementación del S1. */
export const S1_OPERATIONS = [
  ['post', '/platform/auth/login'],
  ['post', '/platform/auth/logout'],
  ['get', '/platform/patients'],
  ['post', '/platform/patients/search'],
  ['get', '/platform/patients/{patientId}'],
  ['post', '/platform/patients/{patientId}/documents'],
  ['post', '/platform/evidence-analyses'],
];

function checkFile(spec) {
  if (!spec.raw) return [report(spec.file, '#', spec.error ?? 'archivo ausente')];
  const found = [];
  if (!OPENAPI_3_1.test(String(spec.raw.openapi))) {
    found.push(report(spec.file, '#/openapi', `debe declarar OpenAPI 3.1.x y declara ${spec.raw.openapi}`));
  }
  if (!SEMANTIC_VERSION.test(String(spec.raw.info?.version))) {
    found.push(report(spec.file, '#/info/version', `info.version debe ser semántico (x.y.z) y es ${JSON.stringify(spec.raw.info?.version)}`));
  }
  return found;
}

function checkS1Operations(spec) {
  if (!spec.bundled) return [];
  return S1_OPERATIONS.filter(([method, route]) => !findOperation(spec.bundled, method, route)).map(([method, route]) =>
    report(spec.file, `#/paths/${route.replaceAll('/', '~1')}`, `falta la operación ${method.toUpperCase()} ${route} del S1`),
  );
}

export function assertSpecVersions(specs) {
  return [...PROVIDERS, EVIDENCE].flatMap((name) => checkFile(specs[name])).concat(checkS1Operations(specs[CLINICAL_API]));
}
