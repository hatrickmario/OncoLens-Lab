/**
 * Empaquetado en memoria de un spec con los schemas compartidos de `contracts/schemas/evidence.yaml`.
 * Nunca se escribe en el repositorio. Solo internaliza los `$ref` a `evidence.yaml#/components/schemas/<Nombre>`
 * (sus `components.schemas` coinciden con los de `@redocly/openapi-core`; lo verifica un test). Cualquier otra
 * `$ref` externa (una respuesta o un parámetro de evidence.yaml, una subruta de un schema, otro archivo) queda
 * sin empaquetar y el empaquetado falla cerrado: `bundleOrFail` devuelve el error del spec.
 */
import { walkJson } from './walk.mjs';

const SHARED_REF = /evidence\.yaml#\/components\/schemas\/([^/]+)$/;
const INTERNAL_SCHEMA_REF = /^#\/components\/schemas\/([^/]+)$/;

/** Llama a `visit(objeto)` para cada objeto del árbol, incluido el de partida. */
function visitObjects(node, visit) {
  if (Array.isArray(node)) {
    node.forEach((item) => visitObjects(item, visit));
  } else if (node && typeof node === 'object') {
    visit(node);
    Object.values(node).forEach((child) => visitObjects(child, visit));
  }
}

/** Reescribe los `$ref` al archivo compartido como `$ref` internos y devuelve los nombres referenciados. */
function internalizeSharedRefs(spec) {
  const names = new Set();
  visitObjects(spec, (node) => {
    const match = typeof node.$ref === 'string' ? node.$ref.match(SHARED_REF) : null;
    if (match) {
      names.add(match[1]);
      node.$ref = `#/components/schemas/${match[1]}`;
    }
  });
  return names;
}

const isSelfReference = (schema, name) => schema?.$ref === `#/components/schemas/${name}`;

/** Nombres de schemas internos que `schema` referencia. */
function referencedSchemaNames(schema) {
  const names = new Set();
  visitObjects(schema, (node) => {
    const match = typeof node.$ref === 'string' ? node.$ref.match(INTERNAL_SCHEMA_REF) : null;
    if (match) names.add(match[1]);
  });
  return names;
}

/**
 * @param {object | null} host spec crudo (`apps/<proveedor>/openapi.yaml` parseado)
 * @param {object | null} evidence `contracts/schemas/evidence.yaml` parseado
 * @returns {object | null} el spec con los schemas compartidos definidos en su `components.schemas`
 */
export function bundleSpec(host, evidence) {
  if (!host) return null;
  const bundled = structuredClone(host);
  const schemas = ((bundled.components ??= {}).schemas ??= {});
  const shared = evidence?.components?.schemas ?? {};
  const pending = [...internalizeSharedRefs(bundled)];
  while (pending.length > 0) {
    const name = pending.pop();
    const missing = schemas[name] === undefined || isSelfReference(schemas[name], name);
    if (missing && shared[name] !== undefined) {
      schemas[name] = structuredClone(shared[name]);
      pending.push(...referencedSchemaNames(schemas[name]));
    }
  }
  return bundled;
}

/**
 * Las `$ref` externas (no empiezan por `#`) que quedan en el spec empaquetado, con el puntero del objeto que las declara.
 * @returns {{ pointer: string, ref: string }[]}
 */
export function externalRefsLeft(bundled) {
  return [...walkJson(bundled)]
    .filter(({ key, value }) => key === '$ref' && typeof value === 'string' && !value.startsWith('#'))
    .map(({ pointer, value }) => ({ pointer: pointer.replace(/\/\$ref$/, ''), ref: value }));
}

/**
 * Empaqueta y falla cerrado: si queda alguna `$ref` externa, no hay spec empaquetado sino un error.
 * @returns {{ bundled: object | null, error?: string, externalRefs: { pointer: string, ref: string }[] }}
 */
export function bundleOrFail(host, evidence) {
  const bundled = bundleSpec(host, evidence);
  const externalRefs = bundled ? externalRefsLeft(bundled) : [];
  if (externalRefs.length === 0) return { bundled, externalRefs };
  return { bundled: null, error: `ref externa sin empaquetar: ${externalRefs.map((item) => item.ref).join(', ')}`, externalRefs };
}
