import { existsSync, readdirSync, readFileSync } from 'node:fs';
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

  it('build-test-node valida el catálogo clínico y comprueba la allowlist del modelo [US-001 AC-4] [D-12.2]', () => {
    const ordenes = pasosDe(ci.jobs['build-test-node']).map((paso) => paso.run ?? '');

    expect(ordenes).toContain('npm run catalog:validate');
    expect(ordenes).toContain('npm run catalog:allowlist:check');
  });

  it('build-test-node lanza el test de build de web tras el build de los workspaces [US-060 AC-5] [D-12.2]', () => {
    const pasos = pasosDe(ci.jobs['build-test-node']);
    const indiceBuild = pasos.findIndex((paso) => /npm run build --workspaces/.test(paso.run ?? ''));
    const indiceTestBuild = pasos.findIndex((paso) => /\btest:build\b/.test(paso.run ?? ''));

    expect(indiceTestBuild).toBeGreaterThan(indiceBuild);
    expect(indiceBuild).toBeGreaterThanOrEqual(0);
  });

  it('build-test-rag instala cada requirements*.txt de la CI de rag-orchestrator, salvo requirements-export.txt, antes de su pytest [L1D-102] [D-12.2] [D-11]', () => {
    const pasos = pasosDe(ci.jobs['build-test-rag']);
    const indicePytest = pasos.findIndex((paso) => /\bpytest\b/.test(paso.run ?? '') && paso['working-directory'] === 'apps/rag-orchestrator');
    const requisitos = readdirSync(path.join(RAIZ, 'apps/rag-orchestrator')).filter((nombre) => /^requirements.*\.txt$/.test(nombre) && nombre !== 'requirements-export.txt');

    expect(indicePytest).toBeGreaterThanOrEqual(0);
    expect(requisitos).toContain('requirements-eval.txt');
    for (const archivo of requisitos) {
      const indiceInstalacion = pasos.findIndex((paso) => (paso.run ?? '').includes(`pip install`) && (paso.run ?? '').includes(`-r apps/rag-orchestrator/${archivo}`));

      expect(indiceInstalacion, archivo).toBeGreaterThanOrEqual(0);
      expect(indiceInstalacion, archivo).toBeLessThan(indicePytest);
    }
  });

  it('ningún workflow instala requirements-export.txt, que solo sirve a la exportación manual a ONNX [D-11]', () => {
    const instalan = NOMBRES.filter((nombre) => /requirements-export/.test(textoDe(nombre).replace(/^\s*#.*$/gm, '')));

    expect(instalan).toEqual([]);
    expect(existsSync(path.join(RAIZ, 'apps/rag-orchestrator/requirements-export.txt'))).toBe(true);
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

  it('el job quality ejecuta test:quality y los jobs build-test no lo ejecutan [US-215 AC-1]', () => {
    expect(scripts['test:quality']).toContain('vitest.quality.config.ts');
    expect(corridas(ci.jobs.quality)).toContain('npm run test:quality');
    for (const job of ['build-test-node', 'build-test-rag']) {
      expect(corridas(ci.jobs[job]).some((run) => /test:quality|ci\/tests\/quality/.test(run)), job).toBe(false);
    }
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

  it('build-test-rag publica la Cobertura XML de Pytest y cobertura-rag la descarga antes de medirla [US-213 AC-11] [D-12.3]', () => {
    const pytest = pasosDe(ci.jobs['build-test-rag']).find((paso) => /python -m pytest/.test(paso.run ?? ''));
    const subida = pasosDe(ci.jobs['build-test-rag']).find((paso) => paso.with?.name === 'cobertura-rag-orchestrator');
    const pasosDeCobertura = pasosDe(ci.jobs['cobertura-rag']);
    const descarga = pasosDeCobertura.findIndex((paso) => paso.with?.name === 'cobertura-rag-orchestrator');
    const medicion = pasosDeCobertura.findIndex((paso) => paso.run === 'node scripts/quality/cobertura.mjs --solo-xml --salida reports/quality/cobertura-rag.json');

    expect(pytest.run).toContain('--cov=app --cov-report=xml:coverage/coverage.xml');
    expect(subida.if).toBe('always()');
    expect(subida.with.path).toBe('apps/rag-orchestrator/coverage/coverage.xml');
    expect(descarga).toBeGreaterThanOrEqual(0);
    expect(descarga).toBeLessThan(medicion);
    expect(pasosDeCobertura[descarga].uses).toMatch(/^actions\/download-artifact@[0-9a-f]{40}/);
  });

  it('el job quality publica reports/quality/latest.json como artefacto aunque la calidad falle [US-213 AC-11]', () => {
    const subida = pasosDe(ci.jobs.quality).find((paso) => paso.with?.path === 'reports/quality/latest.json');

    expect(subida.if).toBe('always()');
    expect(subida.uses).toMatch(/^actions\/upload-artifact@/);
  });

  it('build-test-node conserva el vitest raíz y el test de build de web (US-060 AC-5) [US-060 AC-5]', () => {
    const run = corridas(ci.jobs['build-test-node']);

    expect(run).toContain('npx vitest run');
    expect(run).toContain('npm run test:build --workspace apps/web');
  });
});

describe('detector de cambios en ci.yml y e2e.yml (ARR-11)', () => {
  const reglas = YAML.parse(readFileSync(path.join(RAIZ, 'scripts/ci/cambios-paths.yaml'), 'utf8'));
  const e2e = leerWorkflow('e2e.yml');
  const necesita = (job) => [].concat(job.needs ?? []);
  const IF_OMITIBLE = /^\$\{\{ !contains\(fromJSON\(needs\.cambios\.outputs\.omitibles \|\| '\[\]'\), '([a-z0-9-]+)'\) \}\}$/;
  const nombreDelIf = (job) => IF_OMITIBLE.exec(job.if ?? '')?.[1];
  const jobsConIfDelDetector = Object.entries(ci.jobs).filter(([, job]) => IF_OMITIBLE.test(job.if ?? ''));

  it('el conjunto de jobs con el if del detector es exactamente omitibles_en_documentacion y cada if nombra a su propio job [D-12.1]', () => {
    expect(jobsConIfDelDetector.map(([nombre]) => nombre).sort()).toEqual([...reglas.omitibles_en_documentacion].sort());
    for (const [nombre, job] of jobsConIfDelDetector) {
      expect(nombreDelIf(job), nombre).toBe(nombre);
      expect(necesita(job), nombre).toContain('cambios');
    }
  });

  it('ni los escáneres, ni lint-lenguaje, ni higiene-proceso, ni cambios, ni ci-ok son omitibles [D-12.1]', () => {
    for (const nombre of ['secret-scan', 'data-scan', 'lint-lenguaje', 'higiene-proceso', 'cambios']) {
      expect(reglas.omitibles_en_documentacion, nombre).not.toContain(nombre);
      expect(ci.jobs[nombre].if, nombre).toBeUndefined();
    }
    expect(reglas.omitibles_en_documentacion).not.toContain('ci-ok');
  });

  it('el job cambios hace checkout con historial completo y sin credenciales, expone documentacion y omitibles y entra en ci-ok [D-12.1]', () => {
    const checkout = pasosDe(ci.jobs.cambios).find((paso) => paso.uses?.startsWith('actions/checkout@'));
    const detector = pasosDe(ci.jobs.cambios).find((paso) => paso.id === 'detectar');

    expect(checkout.with).toMatchObject({ 'fetch-depth': 0, 'persist-credentials': false });
    expect(detector.run).toBe('node scripts/ci/detectar-cambios.mjs --base "$BASE_REF"');
    expect(Object.keys(ci.jobs.cambios.outputs).sort()).toEqual(['documentacion', 'omitibles']);
    expect(ci.jobs['ci-ok'].needs).toContain('cambios');
  });

  it('ci-ok sigue pasando por verificar-needs.mjs con el JSON de needs, el único check requerido [US-036 AC-1] [D-12.1]', () => {
    const paso = pasosDe(ci.jobs['ci-ok']).find((p) => /verificar-needs\.mjs/.test(p.run ?? ''));

    expect(paso.env.NEEDS).toBe('${{ toJSON(needs) }}');
  });

  it('e2e.yml ejecuta el mismo detector, omite e2e en un PR de documentación y sigue fuera de ci-ok, sin secretos [D-12.1] [ARR-02 AC-1]', () => {
    const detector = pasosDe(e2e.jobs.cambios).find((paso) => /detectar-cambios\.mjs/.test(paso.run ?? ''));

    expect(detector.run).toBe('node scripts/ci/detectar-cambios.mjs --base "$BASE_REF"');
    expect(e2e.jobs.e2e.needs).toBe('cambios');
    expect(e2e.jobs.e2e.if).toBe("${{ needs.cambios.outputs.documentacion != 'true' }}");
    expect(ci.jobs['ci-ok'].needs).not.toContain('e2e');
    expect(textoDe('e2e.yml')).not.toMatch(/\bsecrets\./);
  });
});

describe('partición de build-test y quality en paralelo (ARR-11)', () => {
  const necesita = (job) => [].concat(job.needs ?? []);

  it('build-test no existe y build-test-node y build-test-rag no se necesitan entre sí y entran en ci-ok [D-12.2]', () => {
    expect(ci.jobs['build-test']).toBeUndefined();
    expect(necesita(ci.jobs['build-test-node'])).toEqual(['cambios']);
    expect(necesita(ci.jobs['build-test-rag'])).toEqual(['cambios']);
    expect(ci.jobs['ci-ok'].needs).toEqual(expect.arrayContaining(['build-test-node', 'build-test-rag']));
  });

  it('build-test-node ejecuta el vitest raíz y test:secrets, y build-test-rag, Pytest con --cov y la verificación del proveedor [D-12.2] [US-060 AC-5]', () => {
    const node = pasosDe(ci.jobs['build-test-node']).map((paso) => paso.run ?? '');
    const rag = pasosDe(ci.jobs['build-test-rag']).map((paso) => paso.run ?? '');

    expect(node).toEqual(expect.arrayContaining(['npx vitest run', 'npm run test:secrets', 'npm run catalog:version-guard -- --base "$BASE_REF"']));
    expect(rag).toContain('npm run contracts:verify-provider -- --proveedor rag-orchestrator');
    expect(rag.some((run) => /python -m pytest --cov=app/.test(run))).toBe(true);
    expect(node.some((run) => /\bpytest\b/.test(run))).toBe(false);
  });

  it('quality solo necesita cambios, no descarga cobertura-rag-orchestrator y deja vacío COBERTURA_INFORMES_XML [D-12.3]', () => {
    const pasos = pasosDe(ci.jobs.quality);
    const reporte = pasos.find((paso) => paso.run === 'npm run quality:report');

    expect(necesita(ci.jobs.quality)).toEqual(['cambios']);
    expect(pasos.filter((paso) => paso.with?.name === 'cobertura-rag-orchestrator')).toEqual([]);
    expect(reporte.env).toEqual({ COBERTURA_INFORMES_XML: '' });
    expect(pasos.find((paso) => paso.run === 'npm run test:quality').env).toEqual({ COBERTURA_INFORMES_XML: '' });
  });

  it('cobertura-rag necesita cambios y build-test-rag, publica quality-report-rag y solo falla por un informe ausente [D-12.3] [US-213 AC-11]', () => {
    const publicacion = pasosDe(ci.jobs['cobertura-rag']).find((paso) => paso.with?.name === 'quality-report-rag');

    expect(necesita(ci.jobs['cobertura-rag']).sort()).toEqual(['build-test-rag', 'cambios']);
    expect(publicacion.with.path).toBe('reports/quality/cobertura-rag.json');
    expect(publicacion.if).toBe('always()');
    expect(ci.jobs['ci-ok'].needs).toContain('cobertura-rag');
  });
});

describe('cachés de dependencias (ARR-11, D-12.4)', () => {
  const usosDeCache = NOMBRES.flatMap((nombre) =>
    Object.entries(leerWorkflow(nombre).jobs).flatMap(([job, definicion]) =>
      pasosDe(definicion).filter((paso) => paso.uses?.startsWith('actions/cache@')).map((paso) => ({ nombre, job, paso })),
    ),
  );

  it('toda actions/cache está fijada por SHA de commit, sin restore-keys ni requirements-export.txt en la clave [D-12.4] [US-036 AC-6]', () => {
    expect(usosDeCache.length).toBeGreaterThan(0);
    for (const { nombre, job, paso } of usosDeCache) {
      expect(paso.uses, `${nombre}:${job}`).toMatch(SHA_COMPLETO);
      expect(paso.with['restore-keys'], `${nombre}:${job}`).toBeUndefined();
      expect(paso.with.key, `${nombre}:${job}`).not.toContain('requirements-export');
    }
  });

  it.each(NOMBRES.filter((nombre) => nombre !== 'ci-selftest.yml'))('en %s todo job con npm ci lo condiciona al acierto de la caché de node_modules, cuya clave lleva .nvmrc y package-lock.json [D-12.4]', (nombre) => {
    const conNpmCi = Object.entries(leerWorkflow(nombre).jobs).filter(([, job]) => pasosDe(job).some((paso) => /^npm ci$/.test(paso.run ?? '')));

    expect(conNpmCi.length).toBeGreaterThan(0);
    for (const [job, definicion] of conNpmCi) {
      const pasos = pasosDe(definicion);
      const cache = pasos.find((paso) => paso.id === 'cache-node');
      const instalacion = pasos.find((paso) => paso.run === 'npm ci');
      expect(cache.with.key, job).toContain("hashFiles('.nvmrc', 'package-lock.json')");
      expect(instalacion.if, job).toBe("steps.cache-node.outputs.cache-hit != 'true'");
      expect(pasos.indexOf(cache), job).toBeLessThan(pasos.indexOf(instalacion));
    }
  });

  it.each([
    ['build-test-node', 'venv'],
    ['build-test-rag', 'venv'],
    ['eval-required', 'venv-eval'],
  ])('%s restaura el venv .venv-ci con una clave que lleva .python-version y los requirements que instala [D-12.4]', (nombre, prefijo) => {
    const pasos = pasosDe(ci.jobs[nombre]);
    const cache = pasos.find((paso) => paso.id === 'cache-venv');
    const instalacion = pasos.find((paso) => /venv \.venv-ci/.test(paso.run ?? ''));
    const instalados = [...instalacion.run.matchAll(/-r apps\/rag-orchestrator\/(requirements[\w-]*\.txt)/g)].map((m) => m[1]);

    expect(cache.with.path).toBe('.venv-ci');
    expect(cache.with.key).toContain(`${prefijo}-\${{ runner.os }}`);
    expect(cache.with.key).toContain('.python-version');
    for (const requisito of instalados) expect(cache.with.key, requisito).toContain(`apps/rag-orchestrator/${requisito}`);
    expect(instalacion.if).toBe("steps.cache-venv.outputs.cache-hit != 'true'");
    expect(instalados).not.toContain('requirements-export.txt');
  });

  it('eval-required no instala requirements-dev.txt (clave propia) ni las ruedas de torch [D-12.4] [D-11]', () => {
    const instalacion = pasosDe(ci.jobs['eval-required']).find((paso) => /venv \.venv-ci/.test(paso.run ?? ''));

    expect(instalacion.run).not.toMatch(/requirements-dev|torch|transformers/);
  });
});

describe('ejemplos y specs contra la punta actual de main (ARR-11, D5-02)', () => {
  it('es el último paso del job contracts, solo en pull_request y sin credenciales [D5-02] [US-036 AC-1]', () => {
    const pasos = pasosDe(ci.jobs.contracts);
    const ultimo = pasos[pasos.length - 1];
    const checkout = pasos.find((paso) => paso.uses?.startsWith('actions/checkout@'));

    expect(ultimo.run).toBe('scripts/ci/contracts-contra-main.sh "$BASE_REF"');
    expect(ultimo.if).toBe("github.event_name == 'pull_request'");
    expect(checkout.with).toMatchObject({ 'persist-credentials': false, 'fetch-depth': 0 });
    expect(Object.keys(ci.on)).not.toContain('pull_request_target');
    expect(textoDe('ci.yml').replace(/^\s*#.*$/gm, '')).not.toMatch(/\bsecrets\./);
  });
});
