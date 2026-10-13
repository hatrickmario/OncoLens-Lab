/** AC-8 y AC-16 [NFR-13, Pre-S1 resp. 20]: los tipos generados de los ocho schemas compartidos son textualmente idénticos en ambos proveedores. */
import { reporter } from '../lib/findings.mjs';
import { typesPath } from '../lib/paths.mjs';
import { PROVIDERS, SHARED_SCHEMAS } from '../lib/specs.mjs';

const report = reporter('assertSharedTypesIdenticalAcrossProviders', 'AC-8 · AC-16');

/** La declaración `export type <name> = …;` del archivo generado, con los espacios normalizados. */
function declarationOf(text, name) {
  const match = text.match(new RegExp(`^export type ${name} = [\\s\\S]*?;(?:\\n\\n|\\n?$)`, 'm'));
  return match ? match[0].replace(/\s+/g, ' ').trim() : null;
}

export function assertSharedTypesIdenticalAcrossProviders(specs, examples, docs) {
  const generated = docs.generatedTypes ?? {};
  const missing = PROVIDERS.filter((provider) => !generated[provider])
    .map((provider) => report(typesPath(provider), '#', 'falta lo generado: ejecutar npm run contracts:generate'));
  if (missing.length > 0) return missing;
  const [first, second] = PROVIDERS.map((provider) => generated[provider]);
  return SHARED_SCHEMAS.flatMap((name) => {
    const left = declarationOf(first.text, name);
    const right = declarationOf(second.text, name);
    if (left !== null && left === right) return [];
    return [report(second.file, `export type ${name}`, `el tipo generado de ${name} debe ser idéntico en ${first.file} y ${second.file} (un solo origen)`)];
  });
}
