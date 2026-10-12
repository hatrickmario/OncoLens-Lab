/** Códigos de error declarados por un schema de respuesta de error. */
import { followRefs } from './pointer.mjs';

const resolveNode = (spec, node) => followRefs(spec, node, null).node;

/**
 * Los códigos que admite `properties.error` del schema (`const` o `enum`), con `oneOf` incluido.
 * @returns {string[] | null} `null` si el código está abierto (un `string` sin `const` ni `enum`)
 */
export function errorCodes(spec, schema) {
  const node = resolveNode(spec, schema);
  if (Array.isArray(node?.oneOf)) {
    const lists = node.oneOf.map((member) => errorCodes(spec, member));
    return lists.includes(null) ? null : lists.flat();
  }
  const error = resolveNode(spec, node?.properties?.error);
  if (error?.const !== undefined) return [error.const];
  return Array.isArray(error?.enum) ? error.enum : null;
}
