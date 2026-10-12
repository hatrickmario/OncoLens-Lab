/** AC-9 [§15 resp. 3, RN-20]: /rag/query declara el 422 como oneOf (TIPO_NO_HABILITADO | validación) y el enum de status no cambia. */
import { errorCodes } from '../lib/errors.mjs';
import { reporter } from '../lib/findings.mjs';
import { findOperation, findResponse, jsonSchemaOf } from '../lib/operations.mjs';
import { RAG_ORCHESTRATOR, schemaOf, schemaPointer } from '../lib/specs.mjs';

const report = reporter('assertRagTipoNoHabilitado', 'AC-9');

const STATUS_VALUES = ['con_evidencia', 'sin_evidencia'];

function checkUnprocessable(spec, file) {
  const entry = findOperation(spec, 'post', '/rag/query');
  if (!entry) return [report(file, '#/paths/~1rag~1query', 'falta POST /rag/query')];
  const response = findResponse(spec, entry, 422);
  if (!response) return [report(file, `${entry.pointer}/responses`, 'POST /rag/query debe declarar la respuesta 422')];
  const schema = jsonSchemaOf(spec, response);
  if (!Array.isArray(schema?.node?.oneOf)) return [report(file, `${entry.pointer}/responses/422`, 'el 422 debe ser un oneOf de TIPO_NO_HABILITADO y CUERPO_INVALIDO')];
  const codes = errorCodes(spec, schema.node) ?? [];
  return ['TIPO_NO_HABILITADO', 'CUERPO_INVALIDO']
    .filter((code) => !codes.includes(code))
    .map((code) => report(file, `${entry.pointer}/responses/422`, `el oneOf del 422 debe distinguir ${code}`));
}

function checkStatusEnum(specs, file) {
  const status = schemaOf(specs, RAG_ORCHESTRATOR, 'RagQueryInternalResponse')?.properties?.status?.enum ?? [];
  const unchanged = JSON.stringify([...status].sort()) === JSON.stringify([...STATUS_VALUES].sort());
  return unchanged ? [] : [report(file, `${schemaPointer('RagQueryInternalResponse')}/properties/status/enum`, `status de /rag/query debe seguir siendo ${STATUS_VALUES.join(' | ')}`)];
}

function checkRequestHasNoFollowUp(specs, file) {
  const request = schemaOf(specs, RAG_ORCHESTRATOR, 'RagQueryInternalRequest');
  const found = Object.hasOwn(request?.properties ?? {}, 'followUp');
  return found ? [report(file, `${schemaPointer('RagQueryInternalRequest')}/properties/followUp`, '/rag/query no cambia: el seguimiento es POST /rag/follow-up')] : [];
}

export function assertRagTipoNoHabilitado(specs) {
  const { file, bundled } = specs[RAG_ORCHESTRATOR];
  if (!bundled) return [];
  return [...checkUnprocessable(bundled, file), ...checkStatusEnum(specs, file), ...checkRequestHasNoFollowUp(specs, file)];
}
