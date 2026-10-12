/** Operaciones, respuestas y cuerpos de un spec OpenAPI empaquetado. */
import { pointerOf, resolvePointer } from './pointer.mjs';

const METHODS = ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace'];

/** @typedef {{ method: string, route: string, pointer: string, operation: any }} OperationEntry */
/** @typedef {{ node: any, pointer: string }} Resolved nodo resuelto y su puntero físico canónico */

/** Todas las operaciones del spec, con el puntero de cada una. @returns {OperationEntry[]} */
export function listOperations(spec) {
  const entries = [];
  for (const [route, pathItem] of Object.entries(spec?.paths ?? {})) {
    for (const method of METHODS) {
      if (pathItem?.[method]) {
        entries.push({ method, route, pointer: pointerOf('paths', route, method), operation: pathItem[method] });
      }
    }
  }
  return entries;
}

/** La operación `METHOD /ruta`, o `undefined`. @returns {OperationEntry | undefined} */
export function findOperation(spec, method, route) {
  return listOperations(spec).find((entry) => entry.method === method.toLowerCase() && entry.route === route);
}

/** Etiqueta legible de una operación: `POST /platform/auth/login`. */
export const labelOf = (entry) => `${entry.method.toUpperCase()} ${entry.route}`;

/**
 * Respuestas de una operación, ya resueltas (las de `components.responses` incluidas).
 * @returns {(Resolved & { status: string })[]}
 */
export function listResponses(spec, entry) {
  return Object.keys(entry.operation.responses ?? {}).map((status) => ({
    status,
    ...resolvePointer(spec, `${entry.pointer}/responses/${status}`),
  }));
}

/** La respuesta `status` de la operación, o `undefined`. */
export function findResponse(spec, entry, status) {
  return listResponses(spec, entry).find((item) => item.status === String(status));
}

/** Schema JSON (`application/json`) de una respuesta o de un cuerpo de petición. @returns {Resolved | undefined} */
export function jsonSchemaOf(spec, holder) {
  if (!holder?.node?.content?.['application/json']?.schema) return undefined;
  return resolvePointer(spec, `${holder.pointer}/content/application~1json/schema`);
}

/** Cuerpo de petición de una operación. @returns {Resolved | undefined} */
export function requestBodyOf(spec, entry) {
  return resolvePointer(spec, `${entry.pointer}/requestBody`);
}
