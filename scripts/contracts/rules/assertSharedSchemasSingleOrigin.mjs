/** AC-8 [NFR-13, Pre-S1 resp. 25]: los ocho schemas compartidos se definen solo en evidence.yaml y ambos specs, crudos, los referencian con $ref. */
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

function checkOrigin({ file, raw }) {
  const defined = raw.components?.schemas ?? {};
  const missing = SHARED_SCHEMAS.filter((name) => defined[name] === undefined)
    .map((name) => report(file, schemaPointer(name), `evidence.yaml debe definir ${name}`));
  const provenance = defined.Provenance === undefined ? [] : [report(file, schemaPointer('Provenance'), 'Provenance no es compartido: cada proveedor declara la suya')];
  return [...missing, ...provenance];
}

export function assertSharedSchemasSingleOrigin(specs) {
  const hosts = PROVIDERS.filter((name) => specs[name].raw).flatMap((name) => checkHost(specs[name]));
  return specs[EVIDENCE].raw ? [...hosts, ...checkOrigin(specs[EVIDENCE])] : hosts;
}
