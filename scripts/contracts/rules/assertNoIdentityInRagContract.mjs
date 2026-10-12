/**
 * AC-17 [RN-10, Pre-S1 resp. 29]: ninguna propiedad, parámetro ni cabecera del contrato de Backend 2 coincide con la
 * lista de identidad (IDENTIDAD_B2), ni ningún cuerpo de petición declara format uuid. Única excepción: identityFound en
 * la respuesta 200 de /documents/extract, por su puntero exacto.
 */
import { reporter } from '../lib/findings.mjs';
import { IDENTITY_B2, matchesIdentity } from '../lib/identity.mjs';
import { listOperations, listParameters, listResponses, requestBodyOf } from '../lib/operations.mjs';
import { pointerOf } from '../lib/pointer.mjs';
import { walkResolved } from '../lib/resolvedWalk.mjs';
import { walkJson } from '../lib/walk.mjs';
import { RAG_ORCHESTRATOR } from '../lib/specs.mjs';

const report = reporter('assertNoIdentityInRagContract', 'AC-17 · RN-10');

/** Respuesta donde `identityFound` está permitida (puntero exacto, design.md D13). */
const ALLOWED_ROOT = '#/paths/~1documents~1extract/post/responses/200/content/application~1json/schema';
const ALLOWED_PROPERTY = 'identityFound';
const EXAMPLE_ALLOWED_POINTER = '#/identityFound';

/** Cada schema de contenido de un cuerpo o de una respuesta, con su puntero físico. */
function* contentSchemas(message, isRequest) {
  for (const [mediaType, media] of Object.entries(message?.node?.content ?? {})) {
    if (media.schema) yield { schema: media.schema, pointer: `${message.pointer}/content/${pointerOf(mediaType).slice(2)}/schema`, isRequest };
  }
}

/** Cada schema de petición y de respuesta del spec. */
function* messageSchemas(spec) {
  for (const entry of listOperations(spec)) {
    yield* contentSchemas(requestBodyOf(spec, entry), true);
    for (const response of listResponses(spec, entry)) yield* contentSchemas(response, false);
  }
}

function checkParameters(file, spec) {
  return listParameters(spec)
    .filter(({ parameter }) => matchesIdentity(parameter.name ?? '', IDENTITY_B2))
    .map(({ parameter, pointer }) => report(file, pointer, `el parámetro ${parameter.name} (${parameter.in}) es identidad o un identificador enlazable`));
}

function checkMessage(file, spec, { schema, pointer, isRequest }) {
  const found = [];
  walkResolved(spec, schema, pointer, ({ schema: node, pointer: where, chain, viaProperty }) => {
    if (viaProperty === ALLOWED_PROPERTY && pointer === ALLOWED_ROOT && chain.length === 1) return false;
    if (viaProperty !== null && (matchesIdentity(viaProperty, IDENTITY_B2) || viaProperty === ALLOWED_PROPERTY)) {
      found.push(report(file, where, `la propiedad ${viaProperty} es identidad o un identificador enlazable: no puede cruzar a Backend 2`));
    }
    if (isRequest && node.format === 'uuid') found.push(report(file, where, 'un cuerpo de petición de Backend 2 no declara format uuid (referencias opacas)'));
    return undefined;
  });
  return found;
}

function checkExamples(examples) {
  return (examples.index?.examples ?? [])
    .filter((entry) => entry.spec === RAG_ORCHESTRATOR)
    .flatMap((entry) =>
      [...walkJson(examples.files?.[entry.file] ?? {})]
        .filter(({ key, pointer }) => key !== null && matchesIdentity(key, IDENTITY_B2) && !(entry.file === 'document-extract-response.json' && pointer.startsWith(`${EXAMPLE_ALLOWED_POINTER}/`)))
        .map(({ pointer, key }) => report(`${examples.dir}/${entry.file}`, pointer, `la clave ${key} es identidad o un identificador enlazable`)),
    );
}

export function assertNoIdentityInRagContract(specs, examples) {
  const { file, bundled } = specs[RAG_ORCHESTRATOR];
  if (!bundled) return [];
  const messages = [...messageSchemas(bundled)].flatMap((message) => checkMessage(file, bundled, message));
  return [...checkParameters(file, bundled), ...messages, ...checkExamples(examples)];
}
