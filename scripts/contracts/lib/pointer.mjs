/** Punteros JSON (RFC 6901) sobre documentos OpenAPI ya parseados, con resolución de `$ref` internos. */

const escapeSegment = (segment) => String(segment).replaceAll('~', '~0').replaceAll('/', '~1');
const unescapeSegment = (segment) => segment.replaceAll('~1', '/').replaceAll('~0', '~');

/** Construye `#/a/b~1c` desde segmentos. */
export function pointerOf(...segments) {
  return `#/${segments.map(escapeSegment).join('/')}`;
}

/** Descompone `#/a/b~1c` en segmentos sin escapar. */
export function segmentsOf(pointer) {
  return pointer
    .replace(/^#\/?/, '')
    .split('/')
    .filter((segment) => segment !== '')
    .map(unescapeSegment);
}

/**
 * Sigue la cadena de `$ref` internos de un nodo.
 * @returns {{ node: any, pointer: string }} nodo resuelto y el puntero físico donde vive
 *   (el de partida si el nodo no era un `$ref`)
 */
export function followRefs(doc, node, startPointer) {
  let current = node;
  let pointer = startPointer;
  while (typeof current?.$ref === 'string' && current.$ref.startsWith('#/')) {
    pointer = current.$ref;
    current = segmentsOf(pointer).reduce((parent, segment) => parent?.[segment], doc);
  }
  return { node: current, pointer };
}

/**
 * Resuelve un puntero atravesando los `$ref` internos del camino (por ejemplo, una respuesta
 * declarada en `components.responses`).
 * @returns {{ node: any, pointer: string } | undefined} nodo final y su puntero físico canónico
 */
export function resolvePointer(doc, pointer) {
  let current = doc;
  let canonical = '#';
  for (const segment of segmentsOf(pointer)) {
    const followed = followRefs(doc, current, canonical);
    current = followed.node?.[segment];
    canonical = `${followed.pointer}/${escapeSegment(segment)}`;
    if (current === undefined) return undefined;
  }
  return followRefs(doc, current, canonical);
}
