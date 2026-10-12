/**
 * Empaquetado en memoria de un spec con los schemas compartidos de `contracts/schemas/evidence.yaml`.
 * Nunca se escribe en el repositorio. El resultado es equivalente al de `@redocly/openapi-core`
 * (lo verifica un test) para los `$ref` externos que usan los dos specs.
 */

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
