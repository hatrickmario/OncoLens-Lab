/**
 * AC-13 [FR-31, Pre-S1 resp. 14, 19, 23, 29]: preguntas de seguimiento ancladas a un análisis en clinical-api
 * y endpoint propio, sin estado, en rag-orchestrator. La parte de datos la revisa assertDataModelDocument.
 */
import { errorCodes } from '../lib/errors.mjs';
import { reporter } from '../lib/findings.mjs';
import { findOperation, findResponse, jsonSchemaOf, labelOf } from '../lib/operations.mjs';
import { lacking, sameMembers } from '../lib/sets.mjs';
import { missingFragments } from '../lib/text.mjs';
import { selectExamples, targetsSchema } from '../lib/examples.mjs';
import { CLINICAL_API, RAG_ORCHESTRATOR, fileOf, schemaOf, schemaPointer } from '../lib/specs.mjs';

const report = reporter('assertFollowUpContract', 'AC-13');

const FOLLOW_UPS = '/platform/evidence-analyses/{analysisId}/follow-ups';
const TURN_FIELDS = ['id', 'analysisId', 'turnNumber', 'question', 'status', 'answer', 'citedSources', 'omittedClaims', 'patientDataLinks', 'disclaimer', 'createdAt'];
const REQUEST_FIELDS = ['traceId', 'dataClassification', 'catalogVersion', 'question', 'clinicalContext', 'analysisMemory', 'filtersApplied'];
const RESPONSE_FIELDS = ['status', 'answer', 'citedSources', 'omittedClaims', 'topRelevanceScore', 'meta'];
const FOLLOW_UP_STATUS = ['con_evidencia', 'sin_evidencia', 'fuera_de_contexto'];
const RN_12 = 'con datos reales solo se usan modelos locales, sin fallback a la nube (RN-12)';
const OPERATION_PHRASES = ['no guarda turnos ni memoria', 'sin estado entre turnos', 'nuevos en cada turno', 'question llega enmascarada', RN_12];
const LIMIT_MESSAGE = 'Este análisis alcanzó el máximo de preguntas de seguimiento configurado. Una pregunta distinta puede formularse en un análisis nuevo.';

/** Respuestas de error de POST …/follow-ups y los códigos que cada una debe distinguir. */
const POST_ERRORS = [
  [401, ['NO_AUTENTICADO']],
  [403, ['PERMISO_DENEGADO', 'OPT_OUT_ANALISIS_IA']],
  [404, ['NO_ENCONTRADO']],
  [409, ['LIMITE_SEGUIMIENTO']],
  [422, ['CUERPO_INVALIDO', 'PACIENTE_EGRESADO', 'ANALISIS_SIN_EVIDENCIA']],
  [429, ['LIMITE_SOLICITUDES', 'COLA_INFERENCIA_LLENA']],
  [502, ['ERROR_SERVICIO_IA']],
  [503, ['LOCAL_LLM_UNAVAILABLE']],
  [504, ['DEADLINE_VENCIDO']],
];
const GET_ERRORS = [
  [401, ['NO_AUTENTICADO']],
  [403, ['PERMISO_DENEGADO']],
  [404, ['NO_ENCONTRADO']],
];


function checkErrors(bundled, file, entry, expectations) {
  return expectations.flatMap(([status, codes]) => {
    const response = findResponse(bundled, entry, status);
    const pointer = `${entry.pointer}/responses/${status}`;
    if (!response) return [report(file, pointer, `${labelOf(entry)} debe declarar ${status}`)];
    const declared = errorCodes(bundled, jsonSchemaOf(bundled, response)?.node);
    if (declared === null) return [report(file, pointer, `el ${status} de ${labelOf(entry)} debe tener un código de error cerrado`)];
    return lacking(declared, codes).map((code) => report(file, pointer, `el ${status} de ${labelOf(entry)} debe distinguir ${code}`));
  });
}

function checkPlatformOperations(bundled, file) {
  const post = findOperation(bundled, 'post', FOLLOW_UPS);
  const get = findOperation(bundled, 'get', FOLLOW_UPS);
  const found = [];
  if (!post) found.push(report(file, `#/paths/${FOLLOW_UPS.replaceAll('/', '~1')}/post`, `falta POST ${FOLLOW_UPS}`));
  else {
    const created = findResponse(bundled, post, 201);
    if (jsonSchemaOf(bundled, created)?.pointer !== schemaPointer('FollowUpTurn')) found.push(report(file, `${post.pointer}/responses/201`, 'POST …/follow-ups debe responder 201 con FollowUpTurn'));
    found.push(...checkErrors(bundled, file, post, POST_ERRORS));
  }
  if (!get) found.push(report(file, `#/paths/${FOLLOW_UPS.replaceAll('/', '~1')}/get`, `falta GET ${FOLLOW_UPS}`));
  else found.push(...checkErrors(bundled, file, get, GET_ERRORS));
  return found;
}

function checkTurn(specs, file) {
  const turn = schemaOf(specs, CLINICAL_API, 'FollowUpTurn');
  const pointer = schemaPointer('FollowUpTurn');
  if (!turn) return [report(file, pointer, 'falta el schema FollowUpTurn')];
  const found = lacking(turn.required, TURN_FIELDS).map((name) => report(file, `${pointer}/required`, `FollowUpTurn debe exigir ${name}`));
  if (!sameMembers(turn.properties?.status?.enum, FOLLOW_UP_STATUS)) found.push(report(file, `${pointer}/properties/status`, `status debe ser ${FOLLOW_UP_STATUS.join(' | ')}`));
  if (missingFragments(turn.properties?.question?.description, ['enmascarada']).length > 0) found.push(report(file, `${pointer}/properties/question`, 'question debe describirse como enmascarada (RN-11)'));
  const cited = schemaOf(specs, CLINICAL_API, 'FollowUpCitedSource');
  const flagged = (cited?.allOf ?? []).some((member) => member.properties?.isNewSource?.type === 'boolean' && (member.required ?? []).includes('isNewSource'));
  if (!flagged) found.push(report(file, `${schemaPointer('FollowUpCitedSource')}/allOf`, 'cada cita de FollowUpTurn debe declarar isNewSource booleano requerido (lo calcula clinical-api)'));
  return found;
}

function checkPlatformExamples(examples) {
  const byFile = (name) => (examples.index?.examples ?? []).find((entry) => entry.file === name);
  const found = [];
  const limit = selectExamples(examples, (entry) => entry.file === 'error-limite-seguimiento.json')[0];
  if (!limit) found.push(report(`${examples.dir}/index.json`, '#', 'falta el ejemplo error-limite-seguimiento.json del 409'));
  else if (limit.data.message !== LIMIT_MESSAGE || /ANALYSIS_FOLLOWUP_MAX/.test(limit.data.message)) {
    found.push(report(limit.file, '#/message', 'el mensaje del 409 debe ser el texto acordado, sin imperativos ni claves de configuración'));
  }
  if (!byFile('error-opt-out.json')) found.push(report(`${examples.dir}/index.json`, '#', 'falta el ejemplo error-opt-out.json del 403'));
  for (const example of selectExamples(examples, targetsSchema(CLINICAL_API, 'FollowUpTurn')).filter(({ data }) => data.status === 'fuera_de_contexto')) {
    if (example.data.answer.length > 0 || example.data.citedSources.length > 0) found.push(report(example.file, '#/answer', 'un turno fuera_de_contexto no lleva afirmaciones ni citas'));
  }
  return found;
}

function checkRagOperation(bundled, file) {
  const entry = findOperation(bundled, 'post', '/rag/follow-up');
  if (!entry) return [report(file, '#/paths/~1rag~1follow-up', 'falta POST /rag/follow-up')];
  const found = missingFragments(entry.operation.description, OPERATION_PHRASES)
    .map((phrase) => report(file, `${entry.pointer}/description`, `la descripción de /rag/follow-up debe decir "${phrase}"`));
  const unavailable = findResponse(bundled, entry, 503);
  if (missingFragments(unavailable?.node?.description, [RN_12]).length > 0) found.push(report(file, `${entry.pointer}/responses/503`, `el 503 de /rag/follow-up debe decir "${RN_12}"`));
  const codes = [['422', ['TIPO_NO_HABILITADO', 'CUERPO_INVALIDO']], ['409', ['CATALOG_VERSION_MISMATCH']]];
  for (const [status, expected] of codes) {
    const declared = errorCodes(bundled, jsonSchemaOf(bundled, findResponse(bundled, entry, status))?.node) ?? [];
    for (const code of lacking(declared, expected)) found.push(report(file, `${entry.pointer}/responses/${status}`, `el ${status} de /rag/follow-up debe distinguir ${code}`));
  }
  return found;
}

function checkRagSchemas(specs, file) {
  const request = schemaOf(specs, RAG_ORCHESTRATOR, 'RagFollowUpRequest');
  const response = schemaOf(specs, RAG_ORCHESTRATOR, 'RagFollowUpResponse');
  const found = [];
  for (const name of lacking(request?.required, REQUEST_FIELDS)) found.push(report(file, `${schemaPointer('RagFollowUpRequest')}/required`, `RagFollowUpRequest debe exigir ${name}`));
  for (const name of lacking(response?.required, RESPONSE_FIELDS)) found.push(report(file, `${schemaPointer('RagFollowUpResponse')}/required`, `RagFollowUpResponse debe exigir ${name}`));
  if (!sameMembers(response?.properties?.status?.enum, FOLLOW_UP_STATUS)) found.push(report(file, `${schemaPointer('RagFollowUpResponse')}/properties/status`, `status debe ser ${FOLLOW_UP_STATUS.join(' | ')}`));
  if (request?.properties?.analysisMemory?.items?.$ref !== schemaPointer('PriorAnalysisMemory')) found.push(report(file, `${schemaPointer('RagFollowUpRequest')}/properties/analysisMemory`, 'analysisMemory debe ser un arreglo de PriorAnalysisMemory'));
  const memory = schemaOf(specs, RAG_ORCHESTRATOR, 'PriorAnalysisMemory');
  if (memory?.properties?.citable?.const !== false) found.push(report(file, `${schemaPointer('PriorAnalysisMemory')}/properties/citable`, 'la memoria del análisis nunca es citable: citable debe ser const false (RN-24)'));
  if (memory?.properties?.source?.const !== 'analisis_previo_ia') found.push(report(file, `${schemaPointer('PriorAnalysisMemory')}/properties/source`, 'source debe ser const analisis_previo_ia (RN-24)'));
  return found;
}

function checkMeta(specs, file) {
  const meta = schemaOf(specs, RAG_ORCHESTRATOR, 'RagMeta');
  const found = [];
  if (!(meta?.required ?? []).includes('catalogVersion')) found.push(report(file, `${schemaPointer('RagMeta')}/required`, 'RagMeta debe exigir catalogVersion'));
  for (const name of ['RagQueryInternalResponse', 'RagFollowUpResponse', 'CaseSummaryInternalResponse']) {
    if (schemaOf(specs, RAG_ORCHESTRATOR, name)?.properties?.meta?.$ref !== schemaPointer('RagMeta')) {
      found.push(report(file, `${schemaPointer(name)}/properties/meta`, `${name}.meta debe ser el bloque compartido RagMeta`));
    }
  }
  return found;
}

export function assertFollowUpContract(specs, examples) {
  const platform = specs[CLINICAL_API];
  const rag = specs[RAG_ORCHESTRATOR];
  const platformFindings = platform.bundled
    ? [...checkPlatformOperations(platform.bundled, platform.file), ...checkTurn(specs, fileOf(specs, CLINICAL_API, schemaPointer('FollowUpTurn'))), ...checkPlatformExamples(examples)]
    : [];
  const ragFindings = rag.bundled
    ? [...checkRagOperation(rag.bundled, rag.file), ...checkRagSchemas(specs, rag.file), ...checkMeta(specs, rag.file)]
    : [];
  return [...platformFindings, ...ragFindings];
}
