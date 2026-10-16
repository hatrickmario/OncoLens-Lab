import { execFile } from 'node:child_process';
import { appendFile, cp, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { changedGeneratedFiles } from '../generate-check.mjs';
import { GENERATED_ROOTS, clientDir, clientWebDir, zodPath } from '../generated.mjs';
import { typesPath } from '../lib/paths.mjs';
import { ROOT } from './helpers/parches.mjs';

const run = promisify(execFile);
const git = (cwd, ...args) => run('git', ['-C', cwd, '-c', 'user.name=Prueba', '-c', 'user.email=prueba@oncolens.test', ...args]);

let tree;
beforeEach(async () => {
  tree = await mkdtemp(path.join(os.tmpdir(), 'oncolens-generado-'));
  for (const generatedRoot of GENERATED_ROOTS) await cp(path.join(ROOT, generatedRoot), path.join(tree, generatedRoot), { recursive: true });
  await cp(path.join(ROOT, 'readme.md'), path.join(tree, 'readme.md'));
  await git(tree, 'init', '-q');
  await git(tree, 'add', '-A');
  await git(tree, 'commit', '-q', '-m', 'generado');
});
afterEach(() => rm(tree, { recursive: true, force: true }));

describe('contracts:generate:check sobre un árbol de trabajo temporal', () => {
  it('no lista archivos cuando lo generado coincide con lo versionado [US-033 AC-16]', async () => {
    expect(await changedGeneratedFiles(tree)).toEqual([]);
  });

  it('lista el archivo cuando se edita a mano el Zod generado de clinical-api [US-033 AC-16]', async () => {
    await appendFile(path.join(tree, zodPath('clinical-api')), '\n// editado a mano\n');
    expect(await changedGeneratedFiles(tree)).toEqual([expect.stringContaining(zodPath('clinical-api'))]);
  });

  it('lista el archivo cuando se edita a mano un modelo Pydantic generado [US-033 AC-16]', async () => {
    await appendFile(path.join(tree, 'apps/rag-orchestrator/app/schemas/generated/models.py'), '\n# editado a mano\n');
    expect(await changedGeneratedFiles(tree)).toEqual([expect.stringContaining('schemas/generated/models.py')]);
  });

  it('lista readme.md cuando se edita a mano el extracto generado del readme [US-033 AC-16]', async () => {
    await appendFile(path.join(tree, 'readme.md'), '\n<!-- editado a mano -->\n');
    expect(await changedGeneratedFiles(tree)).toEqual([expect.stringContaining('readme.md')]);
  });

  it('lista el archivo cuando queda un archivo generado nuevo sin versionar [US-033 AC-16]', async () => {
    await writeFile(path.join(tree, typesPath('clinical-api')).replace('types.gen.ts', 'nuevo.gen.ts'), '// nuevo\n');
    expect(await changedGeneratedFiles(tree)).toEqual([expect.stringContaining('nuevo.gen.ts')]);
  });

  it('lista el archivo cuando se edita a mano el SDK de rag-orchestrator [US-054 AC-6]', async () => {
    const sdk = `${clientDir('rag-orchestrator')}/sdk.gen.ts`;
    await appendFile(path.join(tree, sdk), '\n// editado a mano\n');
    expect(await changedGeneratedFiles(tree)).toEqual([expect.stringContaining(sdk)]);
  });
});

describe('SDK HTTP generado', () => {
  it.each(['clinical-api', 'rag-orchestrator'])('usa imports relativos con extensión .js (NodeNext) en %s [US-054 AC-6]', async (provider) => {
    const raiz = path.join(ROOT, clientDir(provider));
    const archivos = (await readdir(raiz, { recursive: true })).filter((f) => f.endsWith('.ts'));
    const sinExtension = [];
    for (const archivo of archivos) {
      const texto = await readFile(path.join(raiz, archivo), 'utf8');
      for (const [, destino] of texto.matchAll(/from\s+'(\.[^']*)'/g)) if (!destino.endsWith('.js')) sinExtension.push(`${archivo}: ${destino}`);
    }
    expect(sinExtension).toEqual([]);
  });

  it.each([
    ['clinical-api', clientDir('clinical-api')],
    ['rag-orchestrator', clientDir('rag-orchestrator')],
    ['clinical-api (salida para web)', clientWebDir('clinical-api')],
  ])('expone createClient con fetch inyectable y sin baseUrl por defecto en %s [US-054 AC-6]', async (_nombre, directorio) => {
    const cliente = await readFile(path.join(ROOT, directorio, 'client.gen.ts'), 'utf8');
    const operaciones = await readFile(path.join(ROOT, directorio, 'sdk.gen.ts'), 'utf8');
    expect(cliente).toContain('createClient(createConfig<ClientOptions2>())');
    expect(operaciones).toContain('options.client ?? client');
    expect(cliente).not.toMatch(/baseUrl:\s*'/);
  });
});

describe('SDK de clinical-api para web (Turbopack) [US-060]', () => {
  it('usa imports relativos sin extensión .js en la salida para web', async () => {
    const raiz = path.join(ROOT, clientWebDir('clinical-api'));
    const archivos = (await readdir(raiz, { recursive: true })).filter((f) => f.endsWith('.ts'));
    expect(archivos.length).toBeGreaterThan(0);
    const conExtension = [];
    for (const archivo of archivos) {
      const texto = await readFile(path.join(raiz, archivo), 'utf8');
      for (const [, destino] of texto.matchAll(/from\s+'(\.[^']*)'/g)) if (/\.[jt]s$/.test(destino)) conExtension.push(`${archivo}: ${destino}`);
    }
    expect(conExtension).toEqual([]);
  });

  it('lista el archivo cuando se edita a mano el SDK para web', async () => {
    const sdk = `${clientWebDir('clinical-api')}/sdk.gen.ts`;
    await appendFile(path.join(tree, sdk), '\n// editado a mano\n');
    expect(await changedGeneratedFiles(tree)).toEqual([expect.stringContaining(sdk)]);
  });
});
