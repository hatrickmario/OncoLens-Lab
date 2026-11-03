import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { INFORMES_COBERTURA_XML, informesXmlEsperados, medirCoberturaDelPr } from '../../../scripts/quality/cobertura.mjs';
import { RAIZ } from './soporte.mjs';

// ARR-11 D-12.3 (test después): `quality` deja el XML de Pytest al job `cobertura-rag`, que usa la misma medición con `--solo-xml`.
const TIEMPO_MAXIMO_MS = 60_000;
const SCRIPT = path.join(RAIZ, 'scripts/quality/cobertura.mjs');
const ARCHIVO_PYTHON = 'apps/rag-orchestrator/app/domain/umbral.py';
const INFORME = 'apps/rag-orchestrator/coverage/coverage.xml';
const temporales = [];
afterAll(() => temporales.forEach((carpeta) => rmSync(carpeta, { recursive: true, force: true })));

function git(raiz, ...argumentos) {
  const identidad = ['-c', 'user.name=ci-selftest', '-c', 'user.email=ci-selftest@example.com', '-c', 'commit.gpgsign=false'];
  const resultado = spawnSync('git', [...identidad, ...argumentos], { cwd: raiz, encoding: 'utf8', timeout: 30_000 });
  expect(resultado.status, resultado.stderr).toBe(0);
  return resultado.stdout.trim();
}

const informeXml = (raiz) => `<?xml version="1.0" ?>
<coverage version="7.17.0">
  <sources><source>${path.join(raiz, 'apps/rag-orchestrator/app')}</source></sources>
  <packages><package name="domain"><classes>
    <class name="umbral.py" filename="domain/umbral.py"><lines>
      <line number="1" hits="1"/><line number="2" hits="0"/><line number="3" hits="0"/><line number="4" hits="0"/>
    </lines></class>
  </classes></package></packages>
</coverage>
`;

/** Repositorio temporal: un commit base y otro que añade 4 líneas de Python; con o sin el informe de Pytest. */
function repositorio({ conInforme }) {
  const raiz = mkdtempSync(path.join(os.tmpdir(), 'oncolens-cobertura-xml-'));
  temporales.push(raiz);
  git(raiz, 'init', '--quiet');
  writeFileSync(path.join(raiz, 'a.txt'), 'a\n');
  git(raiz, 'add', 'a.txt');
  git(raiz, 'commit', '--quiet', '-m', 'base');
  const base = git(raiz, 'rev-parse', 'HEAD');
  mkdirSync(path.join(raiz, path.dirname(ARCHIVO_PYTHON)), { recursive: true });
  writeFileSync(path.join(raiz, ARCHIVO_PYTHON), 'a = 1\nb = 2\nc = 3\nd = 4\n');
  if (conInforme) {
    mkdirSync(path.join(raiz, path.dirname(INFORME)), { recursive: true });
    writeFileSync(path.join(raiz, INFORME), informeXml(raiz));
  }
  git(raiz, 'add', ARCHIVO_PYTHON);
  git(raiz, 'commit', '--quiet', '-m', 'cambio');
  return { raiz, base };
}

// El job quality exporta COBERTURA_INFORMES_XML vacía a todo `npm run test:quality`: el subproceso debe usar la lista por defecto.
const entornoDeLaCi = (base) => {
  const { COBERTURA_INFORMES_XML: _heredada, ...resto } = process.env;
  return { ...resto, COBERTURA_BASE: base, CI: 'true' };
};

const ejecutar = ({ raiz, base }, argumentos) =>
  spawnSync(process.execPath, [SCRIPT, ...argumentos, '--root', raiz], { encoding: 'utf8', timeout: 30_000, env: entornoDeLaCi(base) });

describe('informesXmlEsperados', () => {
  it('usa el informe de Pytest por defecto cuando no hay variable [D-12.3]', () => {
    expect(informesXmlEsperados({})).toEqual(INFORMES_COBERTURA_XML);
  });

  it('no espera ningún informe cuando COBERTURA_INFORMES_XML está vacía [D-12.3]', () => {
    expect(informesXmlEsperados({ COBERTURA_INFORMES_XML: '' })).toEqual([]);
  });

  it('lee varias rutas separadas por comas [D-12.3]', () => {
    expect(informesXmlEsperados({ COBERTURA_INFORMES_XML: 'a.xml, b.xml' })).toEqual(['a.xml', 'b.xml']);
  });
});

describe('medirCoberturaDelPr con COBERTURA_INFORMES_XML vacía', () => {
  it('exige en la CI solo los LCOV y no nombra el XML de Pytest [D-12.3] [US-213 AC-11]', () => {
    const { raiz } = repositorio({ conInforme: false });

    expect(() => medirCoberturaDelPr(raiz, { env: { CI: 'true', COBERTURA_INFORMES_XML: '' } })).toThrowError(
      /faltan los informes esperados en la CI: apps\/web\/coverage\/lcov\.info, apps\/clinical-api\/coverage\/lcov\.info$/,
    );
  }, TIEMPO_MAXIMO_MS);
});

describe('cobertura.mjs --solo-xml', () => {
  it('escribe el reporte con la forma de latest.json y una alerta, sin fallar, cuando la cobertura de Python es baja [D-12.3] [US-213 AC-11]', () => {
    const repo = repositorio({ conInforme: true });

    const resultado = ejecutar(repo, ['--solo-xml', '--salida', 'reports/quality/cobertura-rag.json']);
    const reporte = JSON.parse(readFileSync(path.join(repo.raiz, 'reports/quality/cobertura-rag.json'), 'utf8'));

    expect(resultado.status).toBe(0);
    expect(reporte.cobertura).toEqual([{ archivo: ARCHIVO_PYTHON, lineasCambiadas: 4, lineasCubiertas: 1, porcentaje: 25 }]);
    expect(reporte.resumen).toEqual({ errores: 0, alertas: 1 });
    expect(reporte.hallazgos[0]).toMatchObject({ rule: 'cobertura-de-lineas-cambiadas', file: ARCHIVO_PYTHON, severity: 'warn' });
    expect(reporte).toHaveProperty('commit');
  }, TIEMPO_MAXIMO_MS);

  it('falla nombrando el informe cuando el artefacto no trae coverage.xml [D-12.3] [US-213 AC-11]', () => {
    const repo = repositorio({ conInforme: false });

    const resultado = ejecutar(repo, ['--solo-xml', '--salida', 'reports/quality/cobertura-rag.json']);

    expect(resultado.status).toBe(1);
    expect(resultado.stderr).toContain(`faltan los informes esperados en la CI: ${INFORME}`);
  }, TIEMPO_MAXIMO_MS);

  it('sale con 2 cuando falta --salida o --solo-xml [D-12.3]', () => {
    const repo = repositorio({ conInforme: true });

    expect(ejecutar(repo, ['--solo-xml']).status).toBe(2);
    expect(ejecutar(repo, ['--salida', 'x.json']).status).toBe(2);
  }, TIEMPO_MAXIMO_MS);
});
