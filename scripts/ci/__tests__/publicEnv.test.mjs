import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

// US-216 AC-4: la lista permitida de variables NEXT_PUBLIC_*. Fixtures en una carpeta temporal propia: nunca en el árbol real.
const RAIZ = path.resolve(import.meta.dirname, '../../..');
const SCRIPT = path.join(RAIZ, 'scripts/ci/public-env.mjs');
const CENTINELA = 'NEXT_PUBLIC_CENTINELA_L1D266';
const VALOR_SECRETO = 'valor-secreto-que-no-debe-imprimirse';
const PLAZO_MS = 20_000;

const temporales = [];
afterEach(() => {
  while (temporales.length) rmSync(temporales.pop(), { recursive: true, force: true });
});

function arbol(archivos, variables = []) {
  const raiz = mkdtempSync(path.join(tmpdir(), 'public-env-'));
  temporales.push(raiz);
  const todos = { 'config/public-env.allowlist.json': JSON.stringify({ variables }), ...archivos };
  for (const [ruta, contenido] of Object.entries(todos)) {
    mkdirSync(path.dirname(path.join(raiz, ruta)), { recursive: true });
    writeFileSync(path.join(raiz, ruta), contenido);
  }
  return raiz;
}

const correr = (raiz) =>
  spawnSync('node', [SCRIPT, '--raiz', raiz], { encoding: 'utf8', timeout: PLAZO_MS });

describe('scripts/ci/public-env.mjs', () => {
  it('termina con código distinto de 0 y nombra la variable y el archivo, sin su valor, cuando no está en la lista [US-216 AC-4]', () => {
    const raiz = arbol({
      'apps/web/.env': `${CENTINELA}=${VALOR_SECRETO}\n`,
      'apps/web/components/ajeno.tsx': `export const x = process.env.${CENTINELA};\n`,
    });

    const resultado = correr(raiz);
    const salida = resultado.stdout + resultado.stderr;

    expect(resultado.status).not.toBe(0);
    expect(salida).toContain(CENTINELA);
    expect(salida).toContain('apps/web/.env');
    expect(salida).toContain('apps/web/components/ajeno.tsx');
    expect(salida).not.toContain(VALOR_SECRETO);
  });

  it('detecta la variable declarada en un .env de infra/docker', () => {
    const raiz = arbol({ 'infra/docker/web.env.example': `${CENTINELA}=x\n` });

    expect(correr(raiz).status).not.toBe(0);
  });

  it('termina con código 0 cuando la variable está en la lista permitida', () => {
    const raiz = arbol(
      { 'apps/web/lib/publica.ts': `export const x = process.env.${CENTINELA};\n` },
      [{ nombre: CENTINELA, justificacion: 'fixture' }],
    );

    expect(correr(raiz).status).toBe(0);
  });

  it('ignora node_modules y .next', () => {
    const raiz = arbol({
      'apps/web/node_modules/paquete/index.js': `${CENTINELA}\n`,
      'apps/web/.next/static/a.js': `${CENTINELA}\n`,
    });

    expect(correr(raiz).status).toBe(0);
  });

  it('termina con código 0 sobre el árbol real con la lista permitida vacía [US-216 AC-4]', () => {
    const resultado = spawnSync('node', [SCRIPT], { cwd: RAIZ, encoding: 'utf8', timeout: PLAZO_MS });

    expect(resultado.status).toBe(0);
  });
});
