import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { e2eDesactivados, lineasDesactivadas } from '../verificar-e2e-activos.mjs';

// L1D-278 (test después, ARR-02 AC-1): el paso previo del job `e2e` rechaza E2E desactivados y nombra el archivo.
const RAIZ = path.resolve(import.meta.dirname, '../../..');
const SCRIPT = path.join(RAIZ, 'scripts/ci/verificar-e2e-activos.mjs');

let raiz;
let carpeta;
beforeEach(() => {
  raiz = mkdtempSync(path.join(os.tmpdir(), 'e2e-activos-test-'));
  carpeta = path.join(raiz, 'apps/web/e2e');
  mkdirSync(carpeta, { recursive: true });
});
afterEach(() => rmSync(raiz, { recursive: true, force: true }));

const ejecutar = () => spawnSync('node', [SCRIPT, '--root', raiz], { encoding: 'utf8' });

describe('lineasDesactivadas', () => {
  it.each([
    "test.skip('a', async () => {});",
    "test.only('a', async () => {});",
    "test.fixme('a', async () => {});",
    "test.describe.skip('grupo', () => {});",
    "test.describe.only('grupo', () => {});",
    "test.describe.serial.only('grupo', () => {});",
    "  test.skip(process.env.CI, 'razón');",
    "it.skip('a', () => {});",
  ])('detecta %s', (linea) => {
    expect(lineasDesactivadas(linea)).toEqual([1]);
  });

  it('no marca un test activo ni un texto que solo menciona la palabra', () => {
    const texto = "test('omite el paso skip del formulario', async () => {});\ntest.describe('grupo', () => {});";

    expect(lineasDesactivadas(texto)).toEqual([]);
  });
});

describe('verificar-e2e-activos', () => {
  it('termina en 0 cuando todos los E2E están activos [ARR-02 AC-1]', () => {
    writeFileSync(path.join(carpeta, 'ok.spec.ts'), "test('a', async () => {});\n");

    const resultado = ejecutar();

    expect(resultado.status).toBe(0);
  });

  it('termina en 1 nombrando el archivo y la línea cuando un E2E está desactivado [ARR-02 AC-1]', () => {
    writeFileSync(path.join(carpeta, 'ok.spec.ts'), "test('a', async () => {});\n");
    writeFileSync(path.join(carpeta, 'roto.spec.ts'), "test('b', async () => {});\ntest.fixme('c', async () => {});\n");

    const resultado = ejecutar();

    expect(resultado.status).toBe(1);
    expect(resultado.stderr).toContain('roto.spec.ts:2');
    expect(resultado.stderr).not.toContain('ok.spec.ts');
  });

  it('ignora los archivos de soporte que no son especificaciones', () => {
    writeFileSync(path.join(carpeta, 'soporte.ts'), "// test.skip se documenta aquí\ntest.skip('x', () => {});\n");

    expect(e2eDesactivados(carpeta)).toEqual([]);
  });

  it('los E2E reales del repositorio están todos activos [ARR-02 AC-1]', () => {
    expect(e2eDesactivados(path.join(RAIZ, 'apps/web/e2e'))).toEqual([]);
  });
});
