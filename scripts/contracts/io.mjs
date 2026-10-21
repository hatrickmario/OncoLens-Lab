/** Entrada/salida de `contracts:check`: lee los archivos del repositorio, arma el contexto y ejecuta el lint de Redocly. */
import { lint, loadConfig } from '@redocly/openapi-core';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import { buildContext } from './lib/context.mjs';
import { finding } from './lib/findings.mjs';
import { PATHS, REDOCLY_CONFIG, typesPath } from './lib/paths.mjs';
import { PROVIDERS } from './lib/specs.mjs';

/** Texto de un archivo, o el motivo por el que no se pudo leer (`archivo ausente` si no existe). */
async function readText(root, file) {
  try {
    return { text: await readFile(path.join(root, file), 'utf8') };
  } catch (error) {
    return { error: error.code === 'ENOENT' ? 'archivo ausente' : `no se pudo leer: ${error.message}` };
  }
}

async function loadSpec(root, file) {
  const read = await readText(root, file);
  if (read.error) return { file, raw: null, error: read.error };
  try {
    return { file, raw: YAML.parse(read.text) };
  } catch (error) {
    return { file, raw: null, error: `YAML inválido: ${error.message}` };
  }
}

async function loadJson(root, file) {
  const read = await readText(root, file);
  if (read.error) return { error: read.error };
  try {
    return { data: JSON.parse(read.text) };
  } catch (error) {
    return { error: `JSON inválido: ${error.message}` };
  }
}

async function loadExamples(root) {
  const dir = PATHS.examplesDir;
  const listing = (await readdir(path.join(root, dir)).catch(() => [])).filter((name) => name.endsWith('.json')).sort();
  const index = await loadJson(root, `${dir}/index.json`);
  const files = {};
  const errors = {};
  for (const name of listing.filter((item) => item !== 'index.json')) {
    const loaded = await loadJson(root, `${dir}/${name}`);
    if (loaded.error) errors[name] = loaded.error;
    else files[name] = loaded.data;
  }
  return { dir, listing, index: index.data ?? null, indexError: index.error, files, errors };
}

async function loadDoc(root, file) {
  const read = await readText(root, file);
  return read.error ? null : { file, text: read.text };
}

/** Lee todo lo que las reglas necesitan y arma su contexto. */
export async function loadContext(root) {
  const specs = {};
  for (const [name, file] of Object.entries(PATHS.specs)) specs[name] = await loadSpec(root, file);
  const terms = await loadJson(root, PATHS.prohibitedTerms);
  const docs = {
    dataModel: await loadDoc(root, PATHS.dataModel),
    readme: await loadDoc(root, PATHS.readme),
    terminosProhibidos: terms.data ?? null,
    generatedTypes: {},
  };
  for (const provider of PROVIDERS) docs.generatedTypes[provider] = await loadDoc(root, typesPath(provider));
  return buildContext({ specs, examples: await loadExamples(root), docs });
}

/** Lint estructural de Redocly sobre los specs que se pudieron leer. @returns {Promise<import('./lib/findings.mjs').Finding[]>} */
export async function lintSpecs(root, context) {
  const config = await loadConfig({ configPath: REDOCLY_CONFIG });
  const found = [];
  for (const { file, raw } of Object.values(context.specs)) {
    if (!raw) continue;
    const problems = await lint({ ref: path.join(root, file), config });
    for (const problem of problems.filter((item) => item.severity === 'error')) {
      found.push(finding(file, problem.location?.[0]?.pointer ?? '#', `redocly:${problem.ruleId}`, 'AC-1', problem.message));
    }
  }
  return found;
}
