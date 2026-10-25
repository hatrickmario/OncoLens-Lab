import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import YAML from 'yaml';
import configQuality from '../../vitest.quality.config.ts';
import configRaiz from '../../vitest.config.ts';

const RAIZ = path.resolve(import.meta.dirname, '../..');
const leerWorkflow = (nombre) => YAML.parse(readFileSync(path.join(RAIZ, '.github/workflows', nombre), 'utf8'));
const textoDe = (nombre) => readFileSync(path.join(RAIZ, '.github/workflows', nombre), 'utf8');

const NOMBRES = readdirSync(path.join(RAIZ, '.github/workflows')).filter((nombre) => /\.ya?ml$/.test(nombre));
const ci = leerWorkflow('ci.yml');
const pasosDe = (job) => job.steps ?? [];
const todosLosPasos = (workflow) => Object.values(workflow.jobs).flatMap(pasosDe);
const SHA_COMPLETO = /^[^@\s]+@[0-9a-f]{40}$/;

describe('ci.yml', () => {
  it('todos los jobs están en el needs de ci-ok [US-036 AC-1]', () => {
    const otros = Object.keys(ci.jobs).filter((nombre) => nombre !== 'ci-ok');

    expect([...ci.jobs['ci-ok'].needs].sort()).toEqual(otros.sort());
  });

  it('ci-ok se evalúa siempre para que un job fallido, omitido o cancelado lo deje en rojo [US-036 AC-1]', () => {
    expect(ci.jobs['ci-ok'].if).toBe('always()');
  });

  it('solo se ejecuta en pull_request y en push a main [US-036 AC-1]', () => {
    expect(Object.keys(ci.on).sort()).toEqual(['pull_request', 'push']);
    expect(ci.on.push.branches).toEqual(['main']);
  });

  it('build-test valida el catálogo clínico y comprueba la allowlist del modelo [US-001 AC-4]', () => {
    const ordenes = pasosDe(ci.jobs['build-test']).map((paso) => paso.run ?? '');

    expect(ordenes).toContain('npm run catalog:validate');
    expect(ordenes).toContain('npm run catalog:allowlist:check');
  });

  it('build-test lanza el test de build de web tras el build de los workspaces [US-060 AC-5]', () => {
    const pasos = pasosDe(ci.jobs['build-test']);
    const indiceBuild = pasos.findIndex((paso) => /npm run build --workspaces/.test(paso.run ?? ''));
    const indiceTestBuild = pasos.findIndex((paso) => /\btest:build\b/.test(paso.run ?? ''));

    expect(indiceTestBuild).toBeGreaterThan(indiceBuild);
    expect(indiceBuild).toBeGreaterThanOrEqual(0);
  });

  it('build-test instala cada requirements*.txt de rag-orchestrator antes de su pytest [L1D-102]', () => {
    const pasos = pasosDe(ci.jobs['build-test']);
    const indicePytest = pasos.findIndex((paso) => /\bpytest\b/.test(paso.run ?? '') && paso['working-directory'] === 'apps/rag-orchestrator');
    const requisitos = readdirSync(path.join(RAIZ, 'apps/rag-orchestrator')).filter((nombre) => /^requirements.*\.txt$/.test(nombre));

    expect(indicePytest).toBeGreaterThanOrEqual(0);
    expect(requisitos).toContain('requirements-eval.txt');
    for (const archivo of requisitos) {
      const indiceInstalacion = pasos.findIndex((paso) => (paso.run ?? '').includes(`pip install`) && (paso.run ?? '').includes(`-r apps/rag-orchestrator/${archivo}`));

      expect(indiceInstalacion, archivo).toBeGreaterThanOrEqual(0);
      expect(indiceInstalacion, archivo).toBeLessThan(indicePytest);
    }
  });

  it('el job que corre pytest tiene setup-node y npm ci antes [US-036 AC-1]', () => {
    const conPytest = Object.entries(ci.jobs).filter(([, job]) => pasosDe(job).some((paso) => /\bpytest\b/.test(paso.run ?? '')));

    expect(conPytest.length).toBeGreaterThan(0);
    for (const [nombre, job] of conPytest) {
      const pasos = pasosDe(job);
      const indiceDePytest = pasos.findIndex((paso) => /\bpytest\b/.test(paso.run ?? ''));
      const previos = pasos.slice(0, indiceDePytest);
      expect(previos.some((paso) => paso.uses?.startsWith('actions/setup-node@')), `${nombre}: falta actions/setup-node antes de pytest`).toBe(true);
      expect(previos.some((paso) => /\bnpm ci\b/.test(paso.run ?? '')), `${nombre}: falta npm ci antes de pytest`).toBe(true);
    }
  });

  it('no contiene pasos omitidos cuando test:secrets ya existe en el package.json [US-036 AC-1]', () => {
    const scripts = JSON.parse(readFileSync(path.join(RAIZ, 'package.json'), 'utf8')).scripts;

    if (scripts['test:secrets']) expect(textoDe('ci.yml')).not.toContain('omitido:');
  });

  it('cada comando de los fixtures de PR figura tal cual en un paso de ci.yml [US-036 AC-1]', () => {
    const corridas = todosLosPasos(ci).map((paso) => paso.run ?? '').join('\n');
    const casos = readdirSync(path.join(RAIZ, 'ci/tests/cases'));
    const comandos = casos.flatMap((caso) => {
      const definicion = JSON.parse(readFileSync(path.join(RAIZ, 'ci/tests/cases', caso, 'case.json'), 'utf8'));
      return definicion.pendiente ? [] : [].concat(definicion.comando);
    });

    expect(comandos.filter((comando) => !corridas.includes(comando))).toEqual([]);
  });
});

describe('ci-selftest.yml', () => {
  it('instala ruff antes de los casos de PR porque los de formato ejecutan npm run format [US-215 AC-4]', () => {
    const selftest = leerWorkflow('ci-selftest.yml');
    const pasos = todosLosPasos(selftest);
    const indiceRuff = pasos.findIndex((paso) => /requirements-dev\.txt/.test(paso.run ?? ''));
    const indiceCasos = pasos.findIndex((paso) => /run-cases\.sh/.test(paso.run ?? ''));

    expect(indiceRuff, 'falta pip install -r apps/rag-orchestrator/requirements-dev.txt').toBeGreaterThanOrEqual(0);
    expect(indiceRuff).toBeLessThan(indiceCasos);
  });
});

describe('ci-selftest.yml y el paquete de lenguaje', () => {
  it('compila @oncolens/clinical-language antes de los casos de PR porque contracts:check importa su dist/ [US-068 AC-5]', () => {
    const pasos = todosLosPasos(leerWorkflow('ci-selftest.yml'));
    const indiceBuild = pasos.findIndex((paso) => /build -w @oncolens\/clinical-language/.test(paso.run ?? ''));
    const indiceCasos = pasos.findIndex((paso) => /run-cases\.sh/.test(paso.run ?? ''));

    expect(indiceBuild, 'falta compilar @oncolens/clinical-language').toBeGreaterThanOrEqual(0);
    expect(indiceBuild).toBeLessThan(indiceCasos);
  });
});

describe.each(NOMBRES)('workflow %s', (nombre) => {
  const workflow = leerWorkflow(nombre);

  it('ningún paso usa continue-on-error ni secrets [US-036 AC-1]', () => {
    const texto = textoDe(nombre);

    expect(texto).not.toMatch(/continue-on-error/);
    expect(texto).not.toMatch(/\bsecrets\./);
    expect(texto).not.toMatch(/secrets:\s*inherit/);
  });

  it('toda acción está fijada por SHA de commit [US-036 AC-6]', () => {
    const acciones = todosLosPasos(workflow).map((paso) => paso.uses).filter(Boolean);

    expect(acciones.filter((accion) => !SHA_COMPLETO.test(accion))).toEqual([]);
  });

  it('todo actions/checkout declara persist-credentials: false para no dejar el token en .git/config [US-036 AC-1]', () => {
    const checkouts = todosLosPasos(workflow).filter((paso) => paso.uses?.startsWith('actions/checkout@'));

    expect(checkouts.length).toBeGreaterThan(0);
    expect(checkouts.filter((paso) => paso.with?.['persist-credentials'] !== false)).toEqual([]);
  });

  it('no hay disparador pull_request_target ni workflow_run [US-036 AC-1]', () => {
    expect(Object.keys(workflow.on)).not.toContain('pull_request_target');
    expect(Object.keys(workflow.on)).not.toContain('workflow_run');
  });

  it('declara permissions contents: read en el nivel del workflow y ningún job las amplía [US-036 AC-1]', () => {
    expect(workflow.permissions).toEqual({ contents: 'read' });
    expect(Object.values(workflow.jobs).filter((job) => job.permissions)).toEqual([]);
  });
});

describe('vitest raíz y job quality', () => {
  const corridas = (job) => pasosDe(job).map((paso) => paso.run ?? '');
  const scripts = JSON.parse(readFileSync(path.join(RAIZ, 'package.json'), 'utf8')).scripts;

  it('el vitest raíz excluye ci/tests/quality y conserva scripts, infra y ci en el include [US-215 AC-1]', () => {
    expect(configRaiz.test.exclude).toContain('ci/tests/quality/**');
    expect(configRaiz.test.include.map((patron) => patron.split('/')[0]).sort()).toEqual(['ci', 'infra', 'scripts']);
  });

  it('la config de quality incluye solo ci/tests/quality [US-215 AC-1]', () => {
    expect(configQuality.test.include).toEqual(['ci/tests/quality/**/*.{test,spec}.?(c|m)[jt]s?(x)']);
    expect(configQuality.test.exclude).not.toContain('ci/tests/quality/**');
  });

  it('el job quality ejecuta test:quality y build-test no lo ejecuta [US-215 AC-1]', () => {
    expect(scripts['test:quality']).toContain('vitest.quality.config.ts');
    expect(corridas(ci.jobs.quality)).toContain('npm run test:quality');
    expect(corridas(ci.jobs['build-test']).some((run) => /test:quality|ci\/tests\/quality/.test(run))).toBe(false);
  });

  it('el job quality genera los LCOV de web y clinical-api antes del reporte, con historial completo para comparar con origin/main [US-213 AC-11]', () => {
    const corridasDeQuality = corridas(ci.jobs.quality);
    const reporte = corridasDeQuality.indexOf('npm run quality:report');
    const checkout = pasosDe(ci.jobs.quality).find((paso) => (paso.uses ?? '').startsWith('actions/checkout'));

    expect(checkout.with['fetch-depth']).toBe(0);
    for (const workspace of ['apps/clinical-api', 'apps/web']) {
      const cobertura = corridasDeQuality.indexOf(`npm run test:coverage -w ${workspace}`);
      expect(cobertura, workspace).toBeGreaterThanOrEqual(0);
      expect(cobertura, workspace).toBeLessThan(reporte);
    }
  });

  it('build-test publica la Cobertura XML de Pytest y quality la descarga antes del reporte [US-213 AC-11]', () => {
    const pytest = pasosDe(ci.jobs['build-test']).find((paso) => /python -m pytest/.test(paso.run ?? ''));
    const subida = pasosDe(ci.jobs['build-test']).find((paso) => paso.with?.name === 'cobertura-rag-orchestrator');
    const pasosDeQuality = pasosDe(ci.jobs.quality);
    const descarga = pasosDeQuality.findIndex((paso) => paso.with?.name === 'cobertura-rag-orchestrator');
    const reporte = pasosDeQuality.findIndex((paso) => paso.run === 'npm run quality:report');

    expect(pytest.run).toContain('--cov=app --cov-report=xml:coverage/coverage.xml');
    expect(subida.if).toBe('always()');
    expect(subida.with.path).toBe('apps/rag-orchestrator/coverage/coverage.xml');
    expect(ci.jobs.quality.needs).toContain('build-test');
    expect(descarga).toBeGreaterThanOrEqual(0);
    expect(descarga).toBeLessThan(reporte);
    expect(pasosDeQuality[descarga].uses).toMatch(/^actions\/download-artifact@[0-9a-f]{40}/);
  });

  it('el job quality publica reports/quality/latest.json como artefacto aunque la calidad falle [US-213 AC-11]', () => {
    const subida = pasosDe(ci.jobs.quality).find((paso) => paso.with?.path === 'reports/quality/latest.json');

    expect(subida.if).toBe('always()');
    expect(subida.uses).toMatch(/^actions\/upload-artifact@/);
  });

  it('build-test conserva el vitest raíz y el test de build de web (US-060 AC-5) [US-060 AC-5]', () => {
    const run = corridas(ci.jobs['build-test']);

    expect(run).toContain('npx vitest run');
    expect(run).toContain('npm run test:build --workspace apps/web');
  });
});
