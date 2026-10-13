/** Recorridos de schemas OpenAPI/JSON Schema y de valores JSON. */
import { listOperations } from './operations.mjs';
import { pointerOf } from './pointer.mjs';
import { SCHEMA_KEYWORDS, SCHEMA_LIST_KEYWORDS, SCHEMA_MAP_KEYWORDS } from './schemaKeywords.mjs';

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

/**
 * Cada (sub)schema de `schema`, con su puntero y la palabra clave del padre que lo contiene.
 * @returns {Generator<{ schema: any, pointer: string, parentKeyword: string | null }>}
 */
export function* walkSchema(schema, pointer, parentKeyword = null) {
  if (!isObject(schema)) return;
  yield { schema, pointer, parentKeyword };
  for (const keyword of SCHEMA_MAP_KEYWORDS) {
    for (const [name, child] of Object.entries(schema[keyword] ?? {})) {
      yield* walkSchema(child, `${pointer}/${keyword}/${pointerOf(name).slice(2)}`, keyword);
    }
  }
  for (const keyword of SCHEMA_LIST_KEYWORDS) {
    for (const [index, child] of (schema[keyword] ?? []).entries()) {
      yield* walkSchema(child, `${pointer}/${keyword}/${index}`, keyword);
    }
  }
  for (const keyword of SCHEMA_KEYWORDS) {
    yield* walkSchema(schema[keyword], `${pointer}/${keyword}`, keyword);
  }
}

/** Schemas de una respuesta o cuerpo: los de su contenido y los de sus cabeceras. */
function* schemasOfMessage(message, pointer) {
  for (const [mediaType, media] of Object.entries(message?.content ?? {})) {
    if (media?.schema) yield { schema: media.schema, pointer: `${pointer}/content/${pointerOf(mediaType).slice(2)}/schema` };
  }
  for (const [name, header] of Object.entries(message?.headers ?? {})) {
    if (header?.schema) yield { schema: header.schema, pointer: `${pointer}/headers/${pointerOf(name).slice(2)}/schema` };
  }
}

/**
 * Cada schema "raíz" de un documento OpenAPI: los de `components`, los de los parámetros, los de los
 * cuerpos y los de las respuestas (declaradas en línea o en `components`).
 * @returns {Generator<{ schema: any, pointer: string }>}
 */
export function* schemaRoots(doc) {
  const components = doc?.components ?? {};
  for (const [name, schema] of Object.entries(components.schemas ?? {})) {
    yield { schema, pointer: pointerOf('components', 'schemas', name) };
  }
  for (const [name, parameter] of Object.entries(components.parameters ?? {})) {
    if (parameter?.schema) yield { schema: parameter.schema, pointer: pointerOf('components', 'parameters', name, 'schema') };
  }
  for (const [name, response] of Object.entries(components.responses ?? {})) {
    yield* schemasOfMessage(response, pointerOf('components', 'responses', name));
  }
  for (const [name, body] of Object.entries(components.requestBodies ?? {})) {
    yield* schemasOfMessage(body, pointerOf('components', 'requestBodies', name));
  }
  for (const entry of listOperations(doc)) {
    for (const [index, parameter] of (entry.operation.parameters ?? []).entries()) {
      if (parameter?.schema) yield { schema: parameter.schema, pointer: `${entry.pointer}/parameters/${index}/schema` };
    }
    yield* schemasOfMessage(entry.operation.requestBody, `${entry.pointer}/requestBody`);
    for (const [status, response] of Object.entries(entry.operation.responses ?? {})) {
      yield* schemasOfMessage(response, `${entry.pointer}/responses/${status}`);
    }
  }
}

/** Todos los (sub)schemas de un documento OpenAPI. */
export function* allSchemas(doc) {
  for (const root of schemaRoots(doc)) yield* walkSchema(root.schema, root.pointer);
}

/**
 * Cada nodo de un valor JSON (contenedores y primitivos) con su puntero, su clave y su padre.
 * @returns {Generator<{ value: any, pointer: string, key: string | null }>}
 */
export function* walkJson(value, pointer = '#', key = null) {
  yield { value, pointer, key };
  if (Array.isArray(value)) {
    for (const [index, child] of value.entries()) yield* walkJson(child, `${pointer}/${index}`, String(index));
  } else if (isObject(value)) {
    for (const [childKey, child] of Object.entries(value)) {
      yield* walkJson(child, `${pointer}/${pointerOf(childKey).slice(2)}`, childKey);
    }
  }
}
