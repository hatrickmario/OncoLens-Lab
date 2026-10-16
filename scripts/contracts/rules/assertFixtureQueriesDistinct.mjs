/** US-034 AC-6 [S1 resp. 7]: el modo fake elige sin ambigüedad: cada respuesta RagQueryInternalResponse declara su request y las query de esos requests son distintas. */
import { reporter } from '../lib/findings.mjs';
import { selectExamples, targetsSchema } from '../lib/examples.mjs';
import { RAG_ORCHESTRATOR } from '../lib/specs.mjs';

const report = reporter('assertFixtureQueriesDistinct', 'AC-6');

const queryOf = (examples, requestFile) => {
  const query = examples.files?.[requestFile]?.query;
  return typeof query === 'string' ? query.trim() : null;
};

/** Hallazgos de una respuesta de fixture: sin request, request ausente o sin query. */
function checkDeclaredRequest(examples, indexFile, response) {
  const request = response.entry.request;
  const where = `#/examples/${response.entry.file}`;
  if (!request) return [report(indexFile, where, `${response.entry.file} debe declarar request (pregunta de fixture del modo fake)`)];
  if (queryOf(examples, request) === null) return [report(indexFile, where, `el request ${request} no existe o no tiene query`)];
  return [];
}

/** Hallazgos de duplicados: dos respuestas con el mismo request o dos requests con la misma query. */
function checkUniqueness(examples, indexFile, responses) {
  const seenRequests = new Map();
  const seenQueries = new Map();
  return responses.flatMap((response) => {
    const request = response.entry.request;
    const query = request ? queryOf(examples, request) : null;
    if (!request || query === null) return [];
    const found = [];
    if (seenRequests.has(request)) found.push(report(indexFile, `#/examples/${response.entry.file}`, `el request ${request} ya está asociado a ${seenRequests.get(request)}`));
    else if (seenQueries.has(query)) found.push(report(indexFile, `#/examples/${response.entry.file}`, `la query de ${request} repite la de ${seenQueries.get(query)}`));
    seenRequests.set(request, response.entry.file);
    seenQueries.set(query, request);
    return found;
  });
}

export function assertFixtureQueriesDistinct(_specs, examples) {
  const indexFile = `${examples.dir}/index.json`;
  const responses = selectExamples(examples, targetsSchema(RAG_ORCHESTRATOR, 'RagQueryInternalResponse'));
  return [...responses.flatMap((response) => checkDeclaredRequest(examples, indexFile, response)), ...checkUniqueness(examples, indexFile, responses)];
}
