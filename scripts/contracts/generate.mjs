#!/usr/bin/env node
/**
 * `npm run contracts:generate`: genera desde los specs empaquetados en memoria los tipos TypeScript y los schemas Zod
 * (@hey-api/openapi-ts), el SDK HTTP por proveedor (client-fetch + sdk), los modelos Pydantic v2 (datamodel-code-generator) y el extracto no normativo del readme.
 * Lo generado nunca se edita a mano. Python: CODEGEN_PYTHON (por defecto python3) con scripts/contracts/requirements-codegen.txt.
 */
import { createClient } from '@hey-api/openapi-ts';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { GENERATED_ROOTS, PYDANTIC_DIR, clientDir, clientWebDir, zodPath } from './generated.mjs';
import { loadContext } from './io.mjs';
import { DEFAULT_ROOT, SPEC_FILES, generatedHeader, typesPath } from './lib/paths.mjs';
import { RAG_ORCHESTRATOR } from './lib/specs.mjs';
import { writeReadmeExtract } from './readme-extract.mjs';

const run = promisify(execFile);

/** Resolver de objetos del plugin Zod: un schema cerrado produce `z.strictObject` (D-4, resp. 33). */
export function objetoEstricto(ctx) {
  return ctx.schema.additionalProperties?.type === 'never' ? ctx.$(ctx.symbols.z).attr('strictObject').call(ctx.nodes.shape(ctx)) : undefined;
}

/** Genera con hey-api un archivo `<salida>` desde el spec empaquetado; `plugin` es `@hey-api/typescript` o `zod`. */
async function generateWithHeyApi(root, provider, bundled, plugin, outputFile) {
  await createClient({
    input: structuredClone(bundled),
    output: { path: path.join(root, path.dirname(outputFile)), clean: true, header: [generatedHeader(provider)] },
    plugins: [plugin === 'zod' ? { name: 'zod', '~resolvers': { object: objetoEstricto } } : plugin],
    logs: { level: 'silent' },
  });
}

/**
 * SDK por proveedor: cliente `fetch` + operaciones tipadas, con `baseUrl` y `fetch` inyectables (US-054 AC-6, D4).
 * `importFileExtension` distingue la salida NodeNext ('.js', clinical-api y rag-orchestrator) de la de `web`
 * (null: Turbopack no resuelve `.js` hacia `.ts`).
 */
async function generateSdk(root, provider, bundled, { dir, importFileExtension }) {
  await createClient({
    input: structuredClone(bundled),
    output: { path: path.join(root, dir), clean: true, header: [generatedHeader(provider)], importFileExtension },
    // baseUrl: false = sin URL por defecto en el cliente global; cada llamador crea el suyo con createClient({ baseUrl, fetch }).
    plugins: ['@hey-api/typescript', { name: '@hey-api/client-fetch', baseUrl: false }, '@hey-api/sdk'],
    logs: { level: 'silent' },
  });
}

async function generateTypesAndZod(root, provider, bundled) {
  await generateWithHeyApi(root, provider, bundled, '@hey-api/typescript', typesPath(provider));
  await generateWithHeyApi(root, provider, bundled, 'zod', zodPath(provider));
}

/** Instrucción de instalación cuando falta Python o el paquete: no hay *fallback*. */
function pythonHelp(python) {
  return `no se pudo ejecutar datamodel-code-generator con "${python}". Instálalo con: ${python} -m pip install -r scripts/contracts/requirements-codegen.txt (o apunta CODEGEN_PYTHON a un Python que lo tenga)`;
}

async function generatePydantic(root, bundled) {
  const python = process.env.CODEGEN_PYTHON ?? 'python3';
  const workDir = await mkdtemp(path.join(os.tmpdir(), 'oncolens-contracts-'));
  const input = path.join(workDir, 'rag-orchestrator.json');
  const output = path.join(root, PYDANTIC_DIR);
  try {
    await writeFile(input, JSON.stringify(bundled));
    await mkdir(output, { recursive: true });
    await run(python, [
      '-m', 'datamodel_code_generator',
      '--input', input,
      '--input-file-type', 'openapi',
      '--output', path.join(output, 'models.py'),
      '--output-model-type', 'pydantic_v2.BaseModel',
      '--target-python-version', '3.12',
      '--disable-timestamp',
      '--use-annotated',
      '--use-title-as-name',
      '--custom-file-header', generatedHeader(RAG_ORCHESTRATOR, '#'),
    ]);
    await writeFile(path.join(output, '__init__.py'), `${generatedHeader(RAG_ORCHESTRATOR, '#')}\n`);
  } catch (error) {
    throw new Error(`${pythonHelp(python)}\n${error.stderr ?? error.message}`);
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}

/** Genera todo lo derivado de los specs de `root`. */
export async function generate(root = DEFAULT_ROOT) {
  const { specs } = await loadContext(root);
  for (const provider of Object.keys(SPEC_FILES)) {
    if (!specs[provider].bundled) throw new Error(`${SPEC_FILES[provider]}: ${specs[provider].error}`);
  }
  for (const provider of Object.keys(SPEC_FILES)) {
    await generateTypesAndZod(root, provider, specs[provider].bundled);
    await generateSdk(root, provider, specs[provider].bundled, { dir: clientDir(provider), importFileExtension: '.js' });
  }
  await generateSdk(root, 'clinical-api', specs['clinical-api'].bundled, { dir: clientWebDir('clinical-api'), importFileExtension: null });
  await generatePydantic(root, specs[RAG_ORCHESTRATOR].bundled);
  await writeReadmeExtract(root);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await generate(process.env.CONTRACTS_ROOT ?? DEFAULT_ROOT);
  console.log(`contracts:generate — generado en ${GENERATED_ROOTS.join(' y ')} y en el extracto del readme`);
}
