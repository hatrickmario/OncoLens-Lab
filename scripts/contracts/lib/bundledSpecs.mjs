/**
 * Specs empaquetados en memoria. El empaquetado de Redocly es asíncrono: `prepararSpecsEmpaquetados()` lo calcula una
 * vez (los CLIs lo esperan; en Vitest lo hace `vitest/globalSetup.mjs` y `vitest/setupFile.mjs` lo registra) y `getBundledSpecs()` lo lee de forma síncrona
 * para los helpers de validación de respuestas. Sin precálculo, falla cerrado: nunca empaqueta a medias.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import YAML from 'yaml';
import { buildContext } from './context.mjs';
import { DEFAULT_ROOT, PATHS } from './paths.mjs';
import { PROVIDERS } from './specs.mjs';

const precalculados = new Map();

function readSpec(root, name) {
  const file = PATHS.specs[name];
  return { file, raw: YAML.parse(readFileSync(path.join(root, file), 'utf8')) };
}

/**
 * Empaqueta los specs de `root` (cálculo puro: solo `registrarSpecsEmpaquetados()` los deja disponibles para `getBundledSpecs()`); falla si algún proveedor no se pudo empaquetar.
 * @returns {Promise<{ [name: string]: { file: string, raw: any, bundled: any } }>}
 */
export async function prepararSpecsEmpaquetados(root = DEFAULT_ROOT) {
  const specs = Object.fromEntries(Object.keys(PATHS.specs).map((name) => [name, readSpec(root, name)]));
  const bundledSpecs = (await buildContext({ specs, examples: null, docs: null })).specs;
  for (const name of PROVIDERS) {
    if (!bundledSpecs[name].bundled) throw new Error(bundledSpecs[name].error ?? `${PATHS.specs[name]}: spec vacío o ilegible`);
  }
  return bundledSpecs;
}

/** Instala un empaquetado calculado en otro proceso (el `globalSetup` de Vitest lo reparte a cada worker). */
export function registrarSpecsEmpaquetados(bundledSpecs, root = DEFAULT_ROOT) {
  precalculados.set(root, bundledSpecs);
}

/** Los specs con su versión empaquetada, ya registrados. */
export function getBundledSpecs(root = DEFAULT_ROOT) {
  const bundledSpecs = precalculados.get(root);
  if (!bundledSpecs) throw new Error('specs sin empaquetar: registra el empaquetado antes con registrarSpecsEmpaquetados(await prepararSpecsEmpaquetados()) (en Vitest, vitest/globalSetup.mjs y vitest/setupFile.mjs)');
  return bundledSpecs;
}
