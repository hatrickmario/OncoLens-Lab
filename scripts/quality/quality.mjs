// `npm run quality` y `npm run quality:report` (L1D-263, US-213 AC-1, design D2).
// Ejecuta ESLint, dependency-cruiser, Ruff e import-linter SIN detenerse en la primera que falla y termina
// con el peor código. Con `--reporte` escribe reports/quality/latest.json (ignorado por git).
// `QUALITY_THRESHOLDS=<ruta>` apunta a otro quality-thresholds.json (solo los tests; rechazado con CI=true).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import {
  desdeDependencyCruiser,
  buscarDesactivacionesDeTamano,
  desdeEslint,
  evaluarImportLinter,
  desdeRuff,
  armarReporte,
  describir,
  ordenar,
  sinAlertaDondeHayError,
} from './normalizar.mjs';
import { verificarCoberturaDeAc } from './check-ac-coverage.mjs';
import { alertasDeCobertura, medirCoberturaDelPr } from './cobertura.mjs';
import { verificarHigieneDePytest } from './higiene-pytest.mjs';
import { verificarEstiloDePytest } from './ruff-pt.mjs';
import { estaSincronizado } from './sync-ruff-thresholds.mjs';
import { leerUmbrales } from './umbrales.mjs';

const RAIZ = path.resolve(import.meta.dirname, '../..');
const RAG = 'apps/rag-orchestrator';
const RUTA_REPORTE = path.join(RAIZ, 'reports/quality/latest.json');
const bin = (nombre) => path.join(RAIZ, 'node_modules/.bin', nombre);

/** ESLint con la configuración de la raíz: reglas de tamaño y complejidad como error, y todo lo demás. */
async function ejecutarEslint() {
  const eslint = new ESLint({ cwd: RAIZ });
  return desdeEslint(await eslint.lintFiles(['.']), RAIZ);
}

/** Pasada aparte de la alerta de tamaño de componentes (design D3): `npm run lint` mantiene `--max-warnings 0`. */
async function ejecutarAlertaDeComponentes(umbrales) {
  const { bloqueTamanoWeb } = await import('../../eslint.config.js');
  const eslint = new ESLint({
    cwd: RAIZ,
    overrideConfigFile: true,
    overrideConfig: [
      { ignores: ['**/node_modules/**', '**/.next/**'] },
      tseslint.configs.base,
      bloqueTamanoWeb(umbrales, 'warn'),
    ],
  });
  return desdeEslint(await eslint.lintFiles(['apps/web']), RAIZ);
}

const DIRECTORIOS_SIN_FUENTES = /^(node_modules|\.next|dist|coverage|\.venv|generated)$/;
// ci/tests/quality prueba este mismo escáner: sus tests y fixtures contienen directivas y tests rotos a propósito.
const RUTAS_SIN_MEDIR = ['ci/tests/quality'];

/** Fuentes JS y TS bajo `directorio` (sin dependencias, build, generado ni fixtures de calidad). */
function fuentes(raiz, relativo) {
  return readdirSync(path.join(raiz, relativo), { withFileTypes: true }).flatMap((entrada) => {
    const ruta = path.posix.join(relativo, entrada.name);
    if (entrada.isDirectory()) {
      return DIRECTORIOS_SIN_FUENTES.test(entrada.name) || RUTAS_SIN_MEDIR.includes(ruta) ? [] : fuentes(raiz, ruta);
    }
    return /\.(ts|tsx|mjs|js)$/.test(entrada.name) ? [ruta] : [];
  });
}

/** Un `eslint-disable` no puede silenciar tamaño, complejidad ni la higiene de tests: solo las excepciones con caducidad del JSON. */
function ejecutarBusquedaDeDesactivaciones(raiz) {
  const archivos = ['apps', 'packages', 'scripts', 'ci', 'infra']
    .filter((carpeta) => existsSync(path.join(raiz, carpeta)))
    .flatMap((carpeta) => fuentes(raiz, carpeta))
    .map((file) => ({ file, texto: readFileSync(path.join(raiz, file), 'utf8') }));
  return buscarDesactivacionesDeTamano(archivos);
}

function ejecutarHerramienta(comando, argumentos, cwd = RAIZ) {
  const resultado = spawnSync(comando, argumentos, {
    cwd,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (resultado.error?.code === 'ENOENT') {
    throw new Error(
      `${path.basename(comando)} no encontrado: ver docs/process/ci.md (job quality)`,
    );
  }
  return resultado;
}

/** Estado 0 = limpio, 1 = hallazgos; cualquier otro es una herramienta rota, no un "sin hallazgos". */
function exigirEjecucion(resultado, herramienta) {
  if (resultado.status !== 0 && resultado.status !== 1) {
    throw new Error(`${herramienta} terminó con estado ${resultado.status}: ${resultado.stderr}`);
  }
}

function ejecutarDependencyCruiser() {
  const resultado = ejecutarHerramienta(bin('depcruise'), [
    'apps',
    'packages',
    '--config',
    '.dependency-cruiser.cjs',
    '--output-type',
    'json',
  ]);
  if (!resultado.stdout) throw new Error(`depcruise no produjo salida: ${resultado.stderr}`);
  return desdeDependencyCruiser(JSON.parse(resultado.stdout));
}

/** Solo las reglas de umbral (C901, PLR0915); el resto del lint de Python lo define su pyproject. */
function ejecutarRuff() {
  const resultado = ejecutarHerramienta('ruff', [
    'check',
    RAG,
    '--select',
    'C901,PLR0915',
    '--output-format',
    'json',
  ]);
  exigirEjecucion(resultado, 'ruff');
  return desdeRuff(JSON.parse(resultado.stdout || '[]'), RAIZ);
}

/** Los umbrales de Ruff viven en quality-thresholds.json; un pyproject desfasado falla (AC-6, tarea 2.2). */
function verificarUmbralesDeRuff(umbrales) {
  const archivo = `${RAG}/pyproject.toml`;
  if (estaSincronizado(readFileSync(path.join(RAIZ, archivo), 'utf8'), umbrales)) return [];
  return [
    {
      tool: 'sync-ruff-thresholds',
      rule: 'umbrales-ruff-sincronizados',
      file: archivo,
      line: null,
      symbol: 'ejecuta node scripts/quality/sync-ruff-thresholds.mjs',
      measured: null,
      threshold: null,
      severity: 'error',
    },
  ];
}

/** import-linter: los contratos de `.importlinter` son obligatorios; un archivo ausente o roto falla. */
function ejecutarImportLinter() {
  if (!existsSync(path.join(RAIZ, RAG, '.importlinter'))) {
    throw new Error(`${RAG}/.importlinter no existe: los contratos de capas son obligatorios`);
  }
  const resultado = ejecutarHerramienta('lint-imports', [], path.join(RAIZ, RAG));
  return evaluarImportLinter(resultado.status, `${resultado.stdout}${resultado.stderr}`, RAG);
}

/**
 * Lo que `quality` mide por sí mismo sobre `raiz` (sin herramientas externas): directivas que apagan reglas, higiene de los
 * tests de Python, AC sin test de aceptación y cobertura de líneas cambiadas. Exportada para probar el cableado con una raíz de fixture.
 */
export function hallazgosPropios(raiz, umbrales, medidasDeLineas) {
  return [
    ...ejecutarBusquedaDeDesactivaciones(raiz),
    ...verificarHigieneDePytest(raiz, `${RAG}/tests`),
    ...verificarCoberturaDeAc(raiz),
    ...(medidasDeLineas ? alertasDeCobertura(medidasDeLineas, umbrales.coverage) : []),
  ];
}

export async function medir(umbrales, medidasDeLineas, raiz = RAIZ) {
  const hallazgos = [
    ...(await ejecutarEslint()),
    ...(await ejecutarAlertaDeComponentes(umbrales)),
    ...ejecutarDependencyCruiser(),
    ...verificarUmbralesDeRuff(umbrales),
    ...ejecutarRuff(),
    ...ejecutarImportLinter(),
    ...hallazgosPropios(raiz, umbrales, medidasDeLineas),
    ...verificarEstiloDePytest(raiz, RAG, `${RAG}/pyproject.toml`),
  ];
  return ordenar(sinAlertaDondeHayError(hallazgos));
}

/** Commit medido: el de la CI (GITHUB_SHA) o el HEAD local; null si no hay repositorio. */
function commitActual() {
  if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
  const resultado = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: RAIZ, encoding: 'utf8' });
  return resultado.status === 0 ? resultado.stdout.trim() : null;
}

async function principal() {
  // Un reporte viejo no puede sobrevivir a una herramienta rota: se borra antes de medir.
  rmSync(RUTA_REPORTE, { force: true });
  const umbrales = leerUmbrales();
  const medidasDeLineas = medirCoberturaDelPr(RAIZ);
  const medicion = await medir(umbrales, medidasDeLineas);
  const reporte = armarReporte(umbrales, medicion, {
    ahora: new Date(),
    commit: commitActual(),
    cobertura: medidasDeLineas,
  });
  for (const h of medicion) console.log(describir(h));
  if (process.argv.includes('--reporte')) {
    mkdirSync(path.dirname(RUTA_REPORTE), { recursive: true });
    writeFileSync(RUTA_REPORTE, `${JSON.stringify(reporte, null, 2)}\n`);
    console.log(`Reporte: ${path.relative(RAIZ, RUTA_REPORTE)}`);
  }
  console.log(`quality: ${reporte.resumen.errores} errores, ${reporte.resumen.alertas} alertas`);
  process.exit(reporte.resumen.errores > 0 ? 1 : 0);
}

// Importable desde los tests sin ejecutar la medición: solo corre cuando es el programa principal.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  principal().catch((error) => {
    console.error(`quality: ${error.message}`);
    process.exit(1);
  });
}
