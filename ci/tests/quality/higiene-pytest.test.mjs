import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { verificarHigieneDePytest } from '../../../scripts/quality/higiene-pytest.mjs';
import { verificarEstiloDePytest } from '../../../scripts/quality/ruff-pt.mjs';
import { hallazgosPropios } from '../../../scripts/quality/quality.mjs';
import { leerUmbrales } from '../../../scripts/quality/umbrales.mjs';
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

// Importaciones con alias: la higiene resuelve los nombres contra los `import` del módulo (L1D-285, Gate 2 #6).
const conImportacion = (importacion, ...lineas) => `${importacion}\n\n\n${lineas.join('\n')}\n`;
const ALIAS = {
  'test_alias_modulo.py': { texto: conImportacion('import pytest as pt', `@pt.mark.${'skip'}`, 'def test_a():', CUERPO), linea: 4, simbolo: 'pytest.mark.skip' },
  'test_alias_marca.py': { texto: conImportacion('from pytest import mark', `@mark.${'xfail'}`, 'def test_a():', CUERPO), linea: 4, simbolo: 'pytest.mark.xfail' },
  'test_alias_funcion.py': { texto: conImportacion('from pytest import skip', 'def test_a():', '    skip("x")'), linea: 5, simbolo: LLAMADA('skip') },
  'test_alias_funcion_con_nombre.py': { texto: conImportacion('from pytest import xfail as fallar', 'def test_a():', '    fallar("x")'), linea: 5, simbolo: LLAMADA('xfail') },
  'test_alias_importorskip.py': { texto: conImportacion('import pytest as pt', 'def test_a():', '    pt.importorskip("modulo")'), linea: 5, simbolo: 'pytest.importorskip(' },
  'test_alias_excepcion.py': { texto: conImportacion('import pytest as pt', 'def test_a():', `    raise pt.${'skip'}.Exception("x")`), linea: 5, simbolo: 'pytest.skip.Exception' },
  'test_unittest.py': { texto: conImportacion('import unittest', `@unittest.${'skip'}("x")`, 'def test_a():', CUERPO), linea: 4, simbolo: 'unittest.skip' },
  'test_unittest_alias.py': { texto: conImportacion('import unittest as ut', `@ut.${'skipIf'}(True, "x")`, 'def test_a():', CUERPO), linea: 4, simbolo: 'unittest.skipIf' },
};

const DESACTIVADOS = {
  ...ALIAS,
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
        .sort((a, b) => (a.file < b.file ? -1 : 1)),
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

  it('falla con el código PT y archivo y línea cuando un módulo fuera de tests/ rompe el estilo de pytest, y no cuenta la deuda de tests/** [US-213 AC-8]', () => {
    exigirRuff();

    const hallazgos = verificarEstiloDePytest(RAIZ, FIXTURES_RUFF, 'apps/rag-orchestrator/pyproject.toml');

    expect(hallazgos.map(({ rule, file, line, severity, tool }) => ({ rule, file, line, severity, tool }))).toEqual(
      ['PT003', 'PT018'].map((rule, i) => ({
        rule,
        file: `${FIXTURES_RUFF}/test_estilo.py`,
        line: [4, 10][i],
        severity: 'error',
        tool: 'ruff',
      })),
    );
    // La deuda vigente de tests/** (PT018 268, PT011 22, PT001 5, PT006 3) está ignorada solo allí.
    expect(verificarEstiloDePytest(RAIZ, 'apps/rag-orchestrator', 'apps/rag-orchestrator/pyproject.toml')).toEqual([]);
  }, TIEMPO_MAXIMO_MS);

  it('quality.mjs ejecuta el estilo de pytest sobre rag-orchestrator con su pyproject [US-213 AC-8]', () => {
    const fuente = readFileSync(path.join(RAIZ, 'scripts/quality/quality.mjs'), 'utf8');

    expect(fuente).toContain('verificarEstiloDePytest(raiz, RAG, `${RAG}/pyproject.toml`)');
  });

  it('quality la invoca sobre los tests de rag-orchestrator de su raíz y el hallazgo llega como error [US-213 AC-8]', () => {
    const raiz = mkdtempSync(path.join(os.tmpdir(), 'oncolens-cableado-pytest-'));
    mkdirSync(path.join(raiz, 'apps/rag-orchestrator/tests'), { recursive: true });
    writeFileSync(path.join(raiz, 'apps/rag-orchestrator/tests/test_x.py'), modulo(`${MARCA('skip')}(reason="x")`, 'def test_algo_cuando_pasa_algo():', CUERPO.trimEnd()));
    try {
      const propios = hallazgosPropios(raiz, leerUmbrales(), null);

      expect(propios).toEqual([
        expect.objectContaining({ rule: 'tests-sin-desactivar', file: 'apps/rag-orchestrator/tests/test_x.py', severity: 'error' }),
      ]);
    } finally {
      rmSync(raiz, { recursive: true, force: true });
    }
  }, TIEMPO_MAXIMO_MS);
});
