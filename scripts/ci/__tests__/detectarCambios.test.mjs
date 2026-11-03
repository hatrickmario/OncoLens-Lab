import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { cargarReglas } from '../eval-trigger.mjs';
import { clasificarCambios, detectarCambios, esSoloDocumentacion } from '../detectar-cambios.mjs';

const RAIZ = path.resolve(import.meta.dirname, '../../..');
const SCRIPT = path.join(RAIZ, 'scripts/ci/detectar-cambios.mjs');
const REGLAS = YAML.parse(readFileSync(path.join(RAIZ, 'scripts/ci/cambios-paths.yaml'), 'utf8'));
const REGLAS_DE_EVAL = cargarReglas();
const TIEMPO_MAXIMO = 30_000;

const temporales = [];
afterAll(() => temporales.forEach((carpeta) => rmSync(carpeta, { recursive: true, force: true })));

const git = (carpeta, ...parametros) => execFileSync('git', ['-C', carpeta, ...parametros], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

function escribir(carpeta, ruta, contenido = 'x\n') {
  mkdirSync(path.dirname(path.join(carpeta, ruta)), { recursive: true });
  writeFileSync(path.join(carpeta, ruta), contenido);
}

/** Repositorio temporal con un commit base; `workflow` y `reglas` apuntan a archivos propios. */
function repositorio({ omitibles = REGLAS.omitibles_en_documentacion, jobs = [...REGLAS.omitibles_en_documentacion, 'cambios', 'ci-ok'] } = {}) {
  const carpeta = mkdtempSync(path.join(os.tmpdir(), 'detectar-cambios-'));
  temporales.push(carpeta);
  git(carpeta, 'init', '-q', '-b', 'main');
  git(carpeta, 'config', 'user.email', 'ci@example.test');
  git(carpeta, 'config', 'user.name', 'CI');
  git(carpeta, 'config', 'commit.gpgsign', 'false');
  escribir(carpeta, 'scripts/ci/eval-trigger.mjs', 'export {};\n');
  escribir(carpeta, 'docs/inicio.md', '# inicio\n');
  git(carpeta, 'add', '-A');
  git(carpeta, 'commit', '-q', '-m', 'base');
  // Fuera del árbol del repositorio: si no, el diff del PR de prueba los incluiría.
  const configuracion = mkdtempSync(path.join(os.tmpdir(), 'detectar-cambios-config-'));
  temporales.push(configuracion);
  const archivoDeReglas = path.join(configuracion, 'cambios-paths.test.yaml');
  const archivoDeWorkflow = path.join(configuracion, 'ci.test.yml');
  writeFileSync(archivoDeReglas, YAML.stringify({ ...REGLAS, omitibles_en_documentacion: omitibles }));
  writeFileSync(archivoDeWorkflow, YAML.stringify({ jobs: Object.fromEntries(jobs.map((job) => [job, {}])) }));
  const base = git(carpeta, 'rev-parse', 'HEAD');
  const cambiar = (cambios) => {
    git(carpeta, 'checkout', '-q', '-b', `pr-${temporales.length}-${Math.random().toString(36).slice(2, 7)}`);
    cambios(carpeta);
    git(carpeta, 'add', '-A');
    git(carpeta, 'commit', '-q', '-m', 'cambio');
  };
  const detectar = (opciones = {}) => detectarCambios({ raiz: carpeta, base, evento: 'pull_request', archivoDeReglas, archivoDeWorkflow, ...opciones });
  return { carpeta, base, cambiar, detectar, archivoDeReglas, archivoDeWorkflow };
}

describe('detectarCambios con un repositorio git temporal', () => {
  it('declara omitibles todos los jobs de la lista cuando el PR solo cambia documentación [D-12.1]', () => {
    const repo = repositorio();
    repo.cambiar((c) => {
      escribir(c, 'backlog/features/a.md');
      escribir(c, 'docs/process/ci.md');
      escribir(c, 'openspec/changes/x/tasks.md');
      escribir(c, 'notas/otra.md');
    });

    const resultado = repo.detectar();

    expect(resultado.documentacion).toBe(true);
    expect(resultado.omitibles).toEqual(REGLAS.omitibles_en_documentacion);
    expect(resultado.omitibles).not.toEqual(expect.arrayContaining(['secret-scan']));
  }, TIEMPO_MAXIMO);

  it('pide la CI completa cuando el PR mezcla documentación y código [D-12.1]', () => {
    const repo = repositorio();
    repo.cambiar((c) => {
      escribir(c, 'docs/process/ci.md');
      escribir(c, 'apps/clinical-api/src/app.ts');
    });

    const resultado = repo.detectar();

    expect(resultado.omitibles).toEqual([]);
    expect(resultado.excluidas.map(({ ruta }) => ruta)).toEqual(['apps/clinical-api/src/app.ts']);
  }, TIEMPO_MAXIMO);

  it.each([
    'docs/architecture/data-model.md',
    'readme.md',
    'data/raw/seed/ATTRIBUTION.md',
    'apps/rag-orchestrator/app/prompts/guia.md',
  ])('pide la CI completa nombrando la ruta cuando el único cambio es %s, que lee el código [D-12.1]', (ruta) => {
    const repo = repositorio();
    repo.cambiar((c) => escribir(c, ruta));

    const resultado = repo.detectar();

    expect(resultado.omitibles).toEqual([]);
    expect(resultado.excluidas).toEqual([{ ruta, motivo: expect.stringContaining('consumidos_por_codigo') }]);
  }, TIEMPO_MAXIMO);

  it('pide la CI completa cuando un git mv convierte código en documentación [D-12.1]', () => {
    const repo = repositorio();
    repo.cambiar((c) => {
      git(c, 'mv', 'scripts/ci/eval-trigger.mjs', 'docs/eval-trigger.md');
    });

    const resultado = repo.detectar();

    expect(resultado.omitibles).toEqual([]);
    expect(resultado.excluidas.map(({ ruta }) => ruta)).toEqual(['scripts/ci/eval-trigger.mjs']);
  }, TIEMPO_MAXIMO);

  it('pide la CI completa sin recurrir a un diff de dos puntos cuando no hay merge-base [D-12.1]', () => {
    const repo = repositorio();
    repo.cambiar((c) => escribir(c, 'docs/solo.md'));
    const huerfana = execFileSync('git', ['-C', repo.carpeta, 'commit-tree', '-m', 'sin relación', '4b825dc642cb6eb9a060e54bf8d69288fbee4904'], { encoding: 'utf8' }).trim();

    const resultado = repo.detectar({ base: huerfana });

    expect(resultado).toMatchObject({ documentacion: false, omitibles: [] });
    expect(resultado.motivo).toContain('sin merge-base');
  }, TIEMPO_MAXIMO);

  it('pide la CI completa cuando la base no existe en el clon [D-12.1]', () => {
    const repo = repositorio();
    repo.cambiar((c) => escribir(c, 'docs/solo.md'));

    const resultado = repo.detectar({ base: 'a'.repeat(40) });

    expect(resultado.omitibles).toEqual([]);
    expect(resultado.motivo).toContain('sin merge-base');
  }, TIEMPO_MAXIMO);

  it('pide la CI completa en un push a main aunque solo cambie documentación [D-12.1]', () => {
    const repo = repositorio();
    repo.cambiar((c) => escribir(c, 'docs/solo.md'));

    const resultado = repo.detectar({ evento: 'push' });

    expect(resultado.omitibles).toEqual([]);
    expect(resultado.motivo).toContain('push');
  }, TIEMPO_MAXIMO);

  it.each([['vacía', ''], ['de ceros', '0'.repeat(40)]])('pide la CI completa cuando la base es %s [D-12.1]', (_nombre, base) => {
    const repo = repositorio();
    repo.cambiar((c) => escribir(c, 'docs/solo.md'));

    const resultado = repo.detectar({ base });

    expect(resultado.omitibles).toEqual([]);
    expect(resultado.motivo).toContain('base vacía');
  }, TIEMPO_MAXIMO);

  it('pide la CI completa cuando el diff está vacío [D-12.1]', () => {
    const repo = repositorio();

    const resultado = repo.detectar();

    expect(resultado.omitibles).toEqual([]);
    expect(resultado.motivo).toBe('diff vacío');
  }, TIEMPO_MAXIMO);
});

describe('detector de cambios como script', () => {
  const ejecutar = (repo, { reglas = repo.archivoDeReglas, workflow = repo.archivoDeWorkflow, evento = 'pull_request' } = {}) => {
    const salida = path.join(path.dirname(repo.archivoDeReglas), 'github-output.txt');
    writeFileSync(salida, '');
    const resultado = spawnSync(process.execPath, [SCRIPT, '--base', repo.base, '--root', repo.carpeta, '--reglas', reglas, '--workflow', workflow], {
      encoding: 'utf8',
      env: { ...process.env, GITHUB_EVENT_NAME: evento, GITHUB_OUTPUT: salida },
    });
    return { ...resultado, salida: readFileSync(salida, 'utf8') };
  };

  it('escribe documentacion y omitibles en GITHUB_OUTPUT y sale con 0 cuando el PR es de documentación [D-12.1]', () => {
    const repo = repositorio();
    repo.cambiar((c) => escribir(c, 'backlog/a.md'));

    const resultado = ejecutar(repo);

    expect(resultado.status).toBe(0);
    expect(resultado.salida).toContain('documentacion=true');
    expect(resultado.salida).toContain(`omitibles=${JSON.stringify(REGLAS.omitibles_en_documentacion)}`);
  }, TIEMPO_MAXIMO);

  it('imprime solo rutas y motivos, nunca el contenido de los archivos [D-12.1]', () => {
    const repo = repositorio();
    repo.cambiar((c) => escribir(c, 'readme.md', 'CONTENIDO-QUE-NO-DEBE-IMPRIMIRSE\n'));

    const resultado = ejecutar(repo);

    expect(resultado.stdout).toContain('readme.md');
    expect(resultado.stdout + resultado.stderr).not.toContain('CONTENIDO-QUE-NO-DEBE');
  }, TIEMPO_MAXIMO);

  it('sale con 2 nombrando la clave cuando el YAML de reglas es ilegible [D-12.1]', () => {
    const repo = repositorio();
    repo.cambiar((c) => escribir(c, 'docs/a.md'));
    writeFileSync(repo.archivoDeReglas, 'documentacion: [sin cerrar\n');

    const resultado = ejecutar(repo);

    expect(resultado.status).toBe(2);
    expect(resultado.stderr).toContain('cambios-paths.test.yaml ilegible');
  }, TIEMPO_MAXIMO);

  it('sale con 2 nombrando el job cuando declara omitible uno que no existe en ci.yml [D-12.1]', () => {
    const repo = repositorio({ omitibles: ['job-inexistente'] });
    repo.cambiar((c) => escribir(c, 'docs/a.md'));

    const resultado = ejecutar(repo);

    expect(resultado.status).toBe(2);
    expect(resultado.stderr).toContain('«job-inexistente»');
  }, TIEMPO_MAXIMO);

  it('sale con 2 cuando declara omitible un escáner que corre siempre [D-12.1]', () => {
    const repo = repositorio({ omitibles: ['secret-scan'], jobs: ['secret-scan', 'cambios', 'ci-ok'] });
    repo.cambiar((c) => escribir(c, 'docs/a.md'));

    const resultado = ejecutar(repo);

    expect(resultado.status).toBe(2);
    expect(resultado.stderr).toContain('«secret-scan» corre siempre');
  }, TIEMPO_MAXIMO);
});

describe('esSoloDocumentacion', () => {
  it('excluye un .md que casa con un disparador de eval-required aunque el código no lo lea [D-12.1] [US-074]', () => {
    const sinConsumidos = { ...REGLAS, consumidos_por_codigo: [] };

    const resultado = esSoloDocumentacion(['apps/rag-orchestrator/app/prompts/guia.md'], sinConsumidos, REGLAS_DE_EVAL);

    expect(resultado.excluidas).toEqual([{ ruta: 'apps/rag-orchestrator/app/prompts/guia.md', motivo: expect.stringContaining('eval-required') }]);
  });

  it('acepta rutas de documentación que ningún código lee [D-12.1]', () => {
    expect(esSoloDocumentacion(['backlog/features/FEAT-01.md', 'docs/PRD.md', 'CHANGELOG.md'], REGLAS, REGLAS_DE_EVAL).soloDocumentacion).toBe(true);
  });

  it('no acepta un archivo que no es documentación aunque viaje con documentos [D-12.1]', () => {
    expect(esSoloDocumentacion(['docs/PRD.md', 'package.json'], REGLAS, REGLAS_DE_EVAL).soloDocumentacion).toBe(false);
  });
});

describe('clasificarCambios', () => {
  it('no autoriza omitir nada cuando el diff es nulo aunque el evento sea un pull_request [D-12.1]', () => {
    const resultado = clasificarCambios({ evento: 'pull_request', base: 'abc', diff: null, reglas: REGLAS, reglasDeEval: REGLAS_DE_EVAL });

    expect(resultado.omitibles).toEqual([]);
  });
});
