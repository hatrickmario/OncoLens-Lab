import { execFile } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { ROOT } from './helpers/parches.mjs';

const run = promisify(execFile);
const CHECK = path.join(ROOT, 'scripts/contracts/check.mjs');
const COPIED = ['apps/clinical-api/openapi.yaml', 'apps/rag-orchestrator/openapi.yaml', 'contracts', 'docs/architecture/data-model.md', 'readme.md'];

const temporaries = [];
afterEach(async () => {
  await Promise.all(temporaries.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

/** Copia mínima del repositorio, sin los archivos de `omit`. */
async function copyOfRepository(omit = []) {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'oncolens-check-'));
  temporaries.push(dir);
  for (const entry of COPIED.filter((item) => !omit.includes(item))) {
    await cp(path.join(ROOT, entry), path.join(dir, entry), { recursive: true });
  }
  return dir;
}

async function check(root) {
  try {
    const { stdout } = await run('node', [CHECK], { env: { ...process.env, CONTRACTS_ROOT: root } });
    return { code: 0, stdout, stderr: '' };
  } catch (error) {
    return { code: error.code, stdout: error.stdout, stderr: error.stderr };
  }
}

describe('contracts:check', () => {
  it('termina con código 0 y sin hallazgos cuando los contratos son los reales [US-033 AC-1]', async () => {
    const result = await check(ROOT);
    expect(result.code).toBe(0);
    expect(result.stdout).toContain('sin hallazgos');
  });

  it('termina con código distinto de 0 y nombra el archivo cuando un spec no está en su ruta [US-033 AC-1]', async () => {
    const result = await check(await copyOfRepository(['apps/clinical-api/openapi.yaml']));
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain('apps/clinical-api/openapi.yaml:#');
    expect(result.stderr).toContain('archivo ausente');
  });

  it('imprime una línea ARCHIVO:ruta — regla — AC/RN — mensaje por hallazgo cuando una regla de assertSpecVersions falla [US-033 AC-1]', async () => {
    const root = await copyOfRepository();
    const spec = path.join(root, 'apps/rag-orchestrator/openapi.yaml');
    await writeFile(spec, (await readFile(spec, 'utf8')).replace('openapi: 3.1.0', 'openapi: 3.0.3'));
    const result = await check(root);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toMatch(/apps\/rag-orchestrator\/openapi\.yaml:#\/openapi — assertSpecVersions — AC-1 — /);
  });

  it('imprime una línea con redocly:<regla> cuando el lint de Redocly encuentra un $ref sin resolver [US-033 AC-1]', async () => {
    const root = await copyOfRepository();
    const spec = path.join(root, 'apps/clinical-api/openapi.yaml');
    await writeFile(spec, (await readFile(spec, 'utf8')).replace("$ref: '#/components/schemas/Document'", "$ref: '#/components/schemas/NoExiste'"));
    const result = await check(root);
    expect(result.code).not.toBe(0);
    expect(result.stderr).toMatch(/apps\/clinical-api\/openapi\.yaml:.* — redocly:no-unresolved-refs — AC-1 — /);
  });
});
