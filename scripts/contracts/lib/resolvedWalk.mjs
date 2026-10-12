/** Recorrido de un schema siguiendo los `$ref` internos: cada propiedad se visita donde vive físicamente. */
import { followRefs, pointerOf } from './pointer.mjs';

const MAP_KEYWORDS = ['properties', 'patternProperties'];
const LIST_KEYWORDS = ['allOf', 'anyOf', 'oneOf'];
const SINGLE_KEYWORDS = ['items', 'not', 'if', 'then', 'else', 'additionalProperties', 'unevaluatedProperties'];

/**
 * @typedef {object} ResolvedVisit
 * @property {any} schema el schema ya resuelto (sin `$ref` al frente)
 * @property {string} pointer puntero físico donde vive
 * @property {string[]} chain nombres de las propiedades recorridas desde la raíz
 * @property {string | null} viaProperty nombre de la propiedad por la que se llegó, si se llegó por una
 */

/**
 * Visita `root` y todo lo que cuelga de él, resolviendo los `$ref` internos y evitando ciclos.
 * Si `visit` devuelve `false`, no desciende por ese nodo.
 * @param {any} spec documento que contiene los `$ref`
 * @param {any} root schema de partida (puede ser un `$ref`)
 * @param {string} rootPointer puntero (lógico) de la raíz, para informar
 * @param {(visit: ResolvedVisit) => boolean | void} visit
 */
export function walkResolved(spec, root, rootPointer, visit) {
  const descend = (schema, pointer, chain, viaProperty, ancestors) => {
    const resolved = followRefs(spec, schema, pointer);
    if (!resolved.node || typeof resolved.node !== 'object' || ancestors.has(resolved.pointer)) return;
    if (visit({ schema: resolved.node, pointer: resolved.pointer, chain, viaProperty }) === false) return;
    const path = new Set(ancestors).add(resolved.pointer);
    const node = resolved.node;
    for (const keyword of MAP_KEYWORDS) {
      for (const [name, child] of Object.entries(node[keyword] ?? {})) {
        const next = keyword === 'properties' ? [...chain, name] : chain;
        descend(child, `${resolved.pointer}/${keyword}/${pointerOf(name).slice(2)}`, next, keyword === 'properties' ? name : null, path);
      }
    }
    for (const keyword of LIST_KEYWORDS) {
      (node[keyword] ?? []).forEach((child, index) => descend(child, `${resolved.pointer}/${keyword}/${index}`, chain, null, path));
    }
    for (const keyword of SINGLE_KEYWORDS) {
      if (node[keyword] && typeof node[keyword] === 'object') descend(node[keyword], `${resolved.pointer}/${keyword}`, chain, null, path);
    }
  };
  descend(root, rootPointer, [], null, new Set());
}
