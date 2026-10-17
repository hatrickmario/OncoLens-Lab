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

  it('build-test conserva el vitest raíz y el test de build de web (US-060 AC-5) [US-060 AC-5]', () => {
    const run = corridas(ci.jobs['build-test']);

    expect(run).toContain('npx vitest run');
    expect(run).toContain('npm run test:build --workspace apps/web');
  });
});
