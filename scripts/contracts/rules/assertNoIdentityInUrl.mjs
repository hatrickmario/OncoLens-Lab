/**
 * AC-17 [RN-10, Pre-S1 resp. 22]: ningún parámetro de query, de ruta o de cabecera de Backend 1 coincide con la lista de
 * identidad (IDENTIDAD_PII); la identidad viaja solo en el cuerpo. Los UUID en la ruta ({patientId}) están permitidos.
 */
import { reporter } from '../lib/findings.mjs';
import { IDENTITY_PII, matchesIdentity } from '../lib/identity.mjs';
import { listOperations, listParameters } from '../lib/operations.mjs';
import { CLINICAL_API } from '../lib/specs.mjs';

const report = reporter('assertNoIdentityInUrl', 'AC-17 · RN-10');

/** Cabeceras que no se someten a revisión (privacy M-11). */
const ALLOWED_HEADERS = ['idempotency-key', 'x-trace-id', 'x-request-deadline'];
const URL_LOCATIONS = ['query', 'path', 'header'];

const isReviewed = (parameter) =>
  URL_LOCATIONS.includes(parameter.in) && !(parameter.in === 'header' && ALLOWED_HEADERS.includes(String(parameter.name).toLowerCase()));

function checkRouteVariables(file, spec) {
  return listOperations(spec).flatMap((entry) =>
    [...entry.route.matchAll(/\{([^}]+)\}/g)]
      .map((match) => match[1])
      .filter((name) => matchesIdentity(name, IDENTITY_PII))
      .map((name) => report(file, entry.pointer, `la variable de ruta {${name}} es identidad: debe viajar en el cuerpo`)),
  );
}

export function assertNoIdentityInUrl(specs) {
  const { file, bundled } = specs[CLINICAL_API];
  if (!bundled) return [];
  const parameters = listParameters(bundled)
    .filter(({ parameter }) => isReviewed(parameter) && matchesIdentity(parameter.name ?? '', IDENTITY_PII))
    .map(({ parameter, pointer }) => report(file, pointer, `el parámetro ${parameter.name} (${parameter.in}) es identidad: debe viajar en el cuerpo de POST /platform/patients/search`));
  return [...parameters, ...checkRouteVariables(file, bundled)];
}
