#!/usr/bin/env node
/**
 * `node scripts/ci/bundle-specs.mjs <raíz> <directorio-de-salida>`: escribe `<proveedor>.json` con el spec empaquetado
 * (con los `$ref` a `contracts/schemas/` internalizados) de cada proveedor, leído de `<raíz>`. Lo usa
 * `contracts-breaking.sh` para que `oasdiff` compare base y HEAD sin resolver referencias relativas.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadBundledSpecs } from '../contracts/lib/bundledSpecs.mjs';
import { PROVIDERS } from '../contracts/lib/specs.mjs';

const [raiz, salida] = process.argv.slice(2);
if (!raiz || !salida) {
  console.error('uso: node scripts/ci/bundle-specs.mjs <raíz> <directorio-de-salida>');
  process.exit(2);
}
const especificaciones = loadBundledSpecs(path.resolve(raiz));
mkdirSync(salida, { recursive: true });
for (const proveedor of PROVIDERS) {
  writeFileSync(path.join(salida, `${proveedor}.json`), JSON.stringify(especificaciones[proveedor].bundled));
}
