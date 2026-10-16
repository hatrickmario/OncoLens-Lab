/** Specs empaquetados en memoria, leídos de forma síncrona (para los helpers de validación de respuestas y `bundle-json`). */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { buildContext } from './context.mjs';
import { DEFAULT_ROOT, PATHS } from './paths.mjs';
import { PROVIDERS } from './specs.mjs';

const cache = new Map();

function readSpec(root, name) {
  const file = PATHS.specs[name];
  return { file, raw: YAML.parse(readFileSync(path.join(root, file), 'utf8')) };
}

/**
 * Los specs con su versión empaquetada (`bundleSpec()`); falla si algún proveedor no se pudo empaquetar.
 * @returns {{ [name: string]: { file: string, raw: any, bundled: any } }}
 */
export function loadBundledSpecs(root = DEFAULT_ROOT) {
  if (cache.has(root)) return cache.get(root);
  const specs = Object.fromEntries(Object.keys(PATHS.specs).map((name) => [name, readSpec(root, name)]));
  const bundledSpecs = buildContext({ specs, examples: null, docs: null }).specs;
  for (const name of PROVIDERS) {
    if (!bundledSpecs[name].bundled) throw new Error(`${PATHS.specs[name]}: ${bundledSpecs[name].error}`);
  }
  cache.set(root, bundledSpecs);
  return bundledSpecs;
}
