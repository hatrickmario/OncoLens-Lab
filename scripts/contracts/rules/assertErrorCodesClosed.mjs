/** AC-17 [D11]: cada respuesta de error referencia un schema con error cerrado; cada código tiene ejemplo; los 403 se describen como RBAC u opt-out. */
import { errorCodes } from '../lib/errors.mjs';
import { reporter } from '../lib/findings.mjs';
import { listOperations, listResponses, jsonSchemaOf, labelOf } from '../lib/operations.mjs';
import { missingFragments, normalizeText } from '../lib/text.mjs';
import { CLINICAL_API, PROVIDERS } from '../lib/specs.mjs';

const report = reporter('assertErrorCodesClosed', 'AC-17');

const isError = (status) => Number(status) >= 400;

/** Respuestas de error de un spec: cada una con su operación, su puntero declarado y su schema resuelto. */
function errorResponses(spec) {
  return listOperations(spec).flatMap((entry) =>
    listResponses(spec, entry)
      .filter(({ status }) => isError(status))
      .map((response) => ({ entry, status: response.status, response, declared: `${entry.pointer}/responses/${response.status}` })),
  );
}

function checkResponses(specName, { file, bundled }, examples) {
  const pending = (examples.index?.pendingExamples ?? []).filter((item) => item.spec === specName).map((item) => item.target);
  const codes = new Set();
  const found = [];
  for (const { entry, status, response, declared } of errorResponses(bundled)) {
    if (response.node?.['x-pending-owner']) {
      if (!pending.includes(declared)) found.push(report(file, declared, `${labelOf(entry)} ${status} está pendiente de su dueño pero no figura como pendingExample en index.json`));
      continue;
    }
    const schema = jsonSchemaOf(bundled, response);
    const closed = schema ? errorCodes(bundled, schema.node) : null;
    if (closed === null) found.push(report(file, declared, `el ${status} de ${labelOf(entry)} debe referenciar un schema con error restringido por const o enum`));
    else closed.forEach((code) => codes.add(code));
    if (status === '403' && specName === CLINICAL_API) found.push(...checkForbiddenDescription(file, declared, response.node));
  }
  return { found, codes };
}

function checkForbiddenDescription(file, pointer, response) {
  const missing = missingFragments(response?.description, ['RBAC', 'opt-out']);
  const wrong = normalizeText(response?.description ?? '').includes('equipo tratante');
  return [
    ...(missing.length > 0 ? [report(file, pointer, 'el 403 debe describirse como RBAC u opt-out')] : []),
    ...(wrong ? [report(file, pointer, 'el 403 no se describe como equipo tratante (Post-MVP, B-03)')] : []),
  ];
}

function checkExampleCoverage(specName, file, codes, examples) {
  const exemplified = new Set((examples.index?.examples ?? []).filter((entry) => entry.spec === specName).map((entry) => examples.files?.[entry.file]?.error).filter(Boolean));
  return [...codes].filter((code) => !exemplified.has(code)).map((code) => report(file, '#/components/schemas', `el código ${code} no tiene ejemplo en index.json ni figura como pendingExample`));
}

export function assertErrorCodesClosed(specs, examples) {
  return PROVIDERS.filter((name) => specs[name].bundled).flatMap((name) => {
    const { found, codes } = checkResponses(name, specs[name], examples);
    return [...found, ...checkExampleCoverage(name, specs[name].file, codes, examples)];
  });
}
