import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { verificarHigieneDePytest } from '../../../scripts/quality/higiene-pytest.mjs';
import { RAIZ, exigirRuff } from './soporte.mjs';

// L1D-285 (test después): PR de fixture con tests de Pytest desactivados. Los fixtures se escriben en un directorio temporal
// en vez de versionarse: el hook pre-commit-gate prohíbe commitear cualquier `skip`/`xfail` bajo tests/, también en fixtures.
// Cada hallazgo sale normalizado como lo escribe `npm run quality` (archivo, línea, regla). Procesos reales con tiempo máximo.
const TIEMPO_MAXIMO_MS = 60_000;
const FIXTURES_RUFF = 'ci/tests/quality/fixtures/pytest-ruff';

// Los nombres se componen para que este archivo no contenga las construcciones que la higiene prohíbe.
const MARCA = (nombre) => `@pytest.mark.${nombre}`;
const LLAMADA = (nombre) => `pytest.${nombre}(`;
const CUERPO = '    assert 1 == 1\n';
const modulo = (...lineas) => `import pytest\n\n\n${lineas.join('\n')}\n`;

const DESACTIVADOS = {
  'test_marca_skip.py': { texto: modulo(`${MARCA('skip')}(reason="x")`, 'def test_a():', CUERPO), linea: 4, simbolo: 'pytest.mark.skip' },
  'test_marca_skipif.py': { texto: modulo(`${MARCA('skipif')}(True, reason="x")`, 'def test_a():', CUERPO), linea: 4, simbolo: 'pytest.mark.skipif' },
  'test_marca_xfail.py': { texto: modulo(MARCA('xfail'), 'def test_a():', CUERPO), linea: 4, simbolo: 'pytest.mark.xfail' },
  'test_pytestmark.py': { texto: modulo(`pytestmark = pytest.mark.${'skip'}`, '', '', 'def test_a():', CUERPO), linea: 4, simbolo: 'pytest.mark.skip' },
  'test_llamada_skip.py': { texto: modulo('def test_a():', `    ${LLAMADA('skip')}"x")`), linea: 5, simbolo: LLAMADA('skip') },
  'test_llamada_xfail.py': { texto: modulo('def test_a():', `    ${LLAMADA('xfail')}"x")`), linea: 5, simbolo: LLAMADA('xfail') },
};
const SOLO_TEXTO = {
  'tests/test_limpio.py': `"""Cita ${LLAMADA('skip')} y ${MARCA('skip')} en un docstring."""\n\n\ndef test_a():\n    # ${LLAMADA('skip')}"comentario")\n    texto = "${LLAMADA('skip')}x)"\n    assert texto\n`,
  'app/modulo.py': `"""Módulo que no es test y cita ${LLAMADA('skip')} en texto."""\n\nAYUDA = "${LLAMADA('xfail')}"\n`,
};

let base;
let relativa;

beforeAll(() => {
  base = mkdtempSync(path.join(os.tmpdir(), 'higiene-pytest-'));
  relativa = base;
  mkdirSync(path.join(base, 'tests'));
  for (const [nombre, { texto }] of Object.entries(DESACTIVADOS)) writeFileSync(path.join(base, 'tests', nombre), texto);
  for (const [ruta, texto] of Object.entries(SOLO_TEXTO)) {
    mkdirSync(path.dirname(path.join(base, ruta)), { recursive: true });
    writeFileSync(path.join(base, ruta), texto);
  }
});

afterAll(() => rmSync(base, { recursive: true, force: true }));

describe('higiene de tests de Pytest', () => {
  it('falla nombrando archivo, línea y regla por cada skip, skipif, xfail y llamada que desactiva un test [US-213 AC-8]', () => {
    const hallazgos = verificarHigieneDePytest(RAIZ, `${relativa}/tests`);

    expect(
      hallazgos.map(({ file, line, rule, symbol, severity }) => ({ file, line, rule, symbol, severity })),
    ).toEqual(
      Object.entries(DESACTIVADOS)
        .map(([nombre, { linea, simbolo }]) => ({
          file: `${relativa}/tests/${nombre}`,
          line: linea,
          rule: 'tests-sin-desactivar',
          symbol: simbolo,
          severity: 'error',
        }))
        .sort((a, b) => a.file.localeCompare(b.file)),
    );
  }, TIEMPO_MAXIMO_MS);

  it('no alerta por el texto de una desactivación en un docstring, un comentario, un string ni en un módulo que no es test [US-213 AC-8]', () => {
    const archivos = verificarHigieneDePytest(RAIZ, relativa).map((h) => h.file);

    expect(archivos).not.toContain(`${relativa}/tests/test_limpio.py`);
    expect(archivos).not.toContain(`${relativa}/app/modulo.py`);
  }, TIEMPO_MAXIMO_MS);

  it('no reporta nada en los tests vigentes de rag-orchestrator [US-213 AC-8]', () => {
    expect(verificarHigieneDePytest(RAIZ, 'apps/rag-orchestrator/tests')).toEqual([]);
  }, TIEMPO_MAXIMO_MS);

  it('mantiene activas las reglas PT que no son de estilo e ignora solo las cuatro con deuda vigente [US-213 AC-8]', () => {
    exigirRuff();
    const resultado = spawnSync(
      'ruff',
      ['check', '--config', 'apps/rag-orchestrator/pyproject.toml', '--output-format', 'json', FIXTURES_RUFF],
      { cwd: RAIZ, encoding: 'utf8', timeout: TIEMPO_MAXIMO_MS },
    );

    // PT003 (scope redundante) falla; PT018 (aserción compuesta) está ignorada por deuda.
    expect(JSON.parse(resultado.stdout).map((h) => h.code)).toEqual(['PT003']);
  }, TIEMPO_MAXIMO_MS);

  it('está invocada desde quality.mjs sobre los tests de rag-orchestrator [US-213 AC-8]', () => {
    const fuente = readFileSync(path.join(RAIZ, 'scripts/quality/quality.mjs'), 'utf8');

    expect(fuente).toContain('verificarHigieneDePytest(RAIZ, `${RAG}/tests`)');
  });
});
