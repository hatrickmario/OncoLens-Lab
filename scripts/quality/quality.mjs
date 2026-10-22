// `npm run quality` y `npm run quality:report` (L1D-263, US-213 AC-1, design D2).
// Ejecuta ESLint, dependency-cruiser, Ruff e import-linter SIN detenerse en la primera que falla y termina
// con el peor código. Con `--reporte` escribe reports/quality/latest.json (ignorado por git).
// `--umbrales <ruta>` apunta a otro quality-thresholds.json (los tests de la CI lo usan).
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { ESLint } from 'eslint';
import tseslint from 'typescript-eslint';
import {
  desdeDependencyCruiser,
  desdeEslint,
  desdeImportLinter,
  desdeRuff,
  describir,
  ordenar,
  sinAlertaDondeHayError,
} from './normalizar.mjs';
import { excepcionesVigentes, leerUmbrales } from './umbrales.mjs';

function leerArgumento(nombre) {
  const indice = process.argv.indexOf(nombre);
  return indice === -1 ? null : process.argv[indice + 1];
}

// Antes de cargar eslint.config.js: ESLint y dependency-cruiser leen los umbrales de esta variable.
if (leerArgumento('--umbrales'))
  process.env.QUALITY_THRESHOLDS = path.resolve(leerArgumento('--umbrales'));

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

/** import-linter corre solo si rag-orchestrator ya declara sus contratos (.importlinter, tarea 2.1). */
function ejecutarImportLinter() {
  if (!existsSync(path.join(RAIZ, RAG, '.importlinter'))) return { hallazgos: [], pendiente: true };
  const resultado = ejecutarHerramienta('lint-imports', [], path.join(RAIZ, RAG));
  exigirEjecucion(resultado, 'lint-imports');
  return { hallazgos: desdeImportLinter(resultado.stdout, RAG), pendiente: false };
}

async function medir(umbrales) {
  const importLinter = ejecutarImportLinter();
  const hallazgos = [
    ...(await ejecutarEslint()),
    ...(await ejecutarAlertaDeComponentes(umbrales)),
    ...ejecutarDependencyCruiser(),
    ...ejecutarRuff(),
    ...importLinter.hallazgos,
  ];
  return {
    hallazgos: ordenar(sinAlertaDondeHayError(hallazgos)),
    importLinterPendiente: importLinter.pendiente,
  };
}

function armarReporte(umbrales, { hallazgos, importLinterPendiente }) {
  const errores = hallazgos.filter((h) => h.severity === 'error').length;
  return {
    umbrales: { ...umbrales, excepciones: undefined },
    excepcionesVigentes: excepcionesVigentes(umbrales.excepciones, new Date()),
    herramientasPendientes: importLinterPendiente
      ? ['import-linter (.importlinter, tarea 2.1)']
      : [],
    resumen: { errores, alertas: hallazgos.length - errores },
    hallazgos,
  };
}

async function principal() {
  const umbrales = leerUmbrales();
  const medicion = await medir(umbrales);
  const reporte = armarReporte(umbrales, medicion);
  for (const h of medicion.hallazgos) console.log(describir(h));
  if (process.argv.includes('--reporte')) {
    mkdirSync(path.dirname(RUTA_REPORTE), { recursive: true });
    writeFileSync(RUTA_REPORTE, `${JSON.stringify(reporte, null, 2)}\n`);
    console.log(`Reporte: ${path.relative(RAIZ, RUTA_REPORTE)}`);
  }
  console.log(`quality: ${reporte.resumen.errores} errores, ${reporte.resumen.alertas} alertas`);
  process.exit(reporte.resumen.errores > 0 ? 1 : 0);
}

principal().catch((error) => {
  console.error(`quality: ${error.message}`);
  process.exit(1);
});
