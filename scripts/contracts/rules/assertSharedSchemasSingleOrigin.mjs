/**
 * AC-8 [NFR-13, Pre-S1 resp. 25]: los ocho schemas compartidos se definen solo en evidence.yaml y ambos specs, crudos,
 * los referencian con $ref. Un schema local no puede llamarse como uno de evidence.yaml (colisión), y ninguna $ref
 * externa puede quedar sin empaquetar (el empaquetado solo internaliza components/schemas de evidence.yaml).
 */
import { reporter } from '../lib/findings.mjs';
import { EVIDENCE, PROVIDERS, SHARED_SCHEMAS, schemaPointer } from '../lib/specs.mjs';

const report = reporter('assertSharedSchemasSingleOrigin', 'AC-8');

const sharedRefOf = (name) => new RegExp(`evidence\\.yaml#/components/schemas/${name}$`);

function checkHost({ file, raw }) {
  return SHARED_SCHEMAS.flatMap((name) => {
    const declared = raw.components?.schemas?.[name];
    if (declared === undefined) return [report(file, schemaPointer(name), `falta ${name}: debe ser un $ref a contracts/schemas/evidence.yaml`)];
    if (!sharedRefOf(name).test(declared.$ref ?? '')) {
      return [report(file, schemaPointer(name), `${name} está definido en línea: debe ser un $ref a contracts/schemas/evidence.yaml (un solo origen)`)];
    }
    return [];
  });
}

/** Schemas locales con el nombre de un schema de evidence.yaml que no es uno de los ocho (los ocho ya los revisa checkHost). */
function checkCollisions({ file, raw }, evidence) {
  const shared = Object.keys(evidence?.components?.schemas ?? {}).filter((name) => !SHARED_SCHEMAS.includes(name));
  return shared
    .filter((name) => raw.components?.schemas?.[name] !== undefined && !sharedRefOf(name).test(raw.components.schemas[name].$ref ?? ''))
    .map((name) => report(file, schemaPointer(name), `colisión de nombres: ${name} es un schema de contracts/schemas/evidence.yaml y el spec define otro local con el mismo nombre`));
}

/** Cada $ref externa que el empaquetado dejó sin resolver. */
const checkExternalRefs = ({ file, externalRefs }) =>
  (externalRefs ?? []).map(({ pointer, ref }) => report(file, pointer, `ref externa sin empaquetar: ${ref} (el empaquetado solo internaliza components/schemas de evidence.yaml)`));

function checkOrigin({ file, raw }) {
  const defined = raw.components?.schemas ?? {};
  const missing = SHARED_SCHEMAS.filter((name) => defined[name] === undefined)
    .map((name) => report(file, schemaPointer(name), `evidence.yaml debe definir ${name}`));
  const provenance = defined.Provenance === undefined ? [] : [report(file, schemaPointer('Provenance'), 'Provenance no es compartido: cada proveedor declara la suya')];
  return [...missing, ...provenance];
}

export function assertSharedSchemasSingleOrigin(specs) {
  const hosts = PROVIDERS.filter((name) => specs[name].raw).flatMap((name) => [
    ...checkHost(specs[name]),
    ...checkCollisions(specs[name], specs[EVIDENCE].raw),
    ...checkExternalRefs(specs[name]),
  ]);
  return specs[EVIDENCE].raw ? [...hosts, ...checkOrigin(specs[EVIDENCE])] : hosts;
}
