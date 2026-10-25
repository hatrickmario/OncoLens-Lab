// Cobertura de LÍNEAS CAMBIADAS (L1D-285, US-213 AC-11, design D6 corregido): cruza el diff contra `origin/main` con los
// informes LCOV de `vitest --coverage` (v8). Es una ALERTA, nunca un error: el job no falla por cobertura ni hay umbral
// global. El umbral y las rutas acotadas viven en quality-thresholds.json (RN-22), no aquí.
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { globARegExp } from '../ci/lib/glob.mjs';
import { hallazgo } from './normalizar.mjs';

/** Informes LCOV por workspace: la ruta de sus archivos fuente se resuelve relativa a él. */
export const INFORMES_LCOV = [
  { lcov: 'apps/web/coverage/lcov.info', base: 'apps/web' },
  { lcov: 'apps/clinical-api/coverage/lcov.info', base: 'apps/clinical-api' },
];

/** Cobertura XML de `pytest-cov` (`--cov-report=xml:coverage/coverage.xml`, L1D-285 tarea 3.4); `coverage/` está ignorado por git. */
export const INFORMES_COBERTURA_XML = ['apps/rag-orchestrator/coverage/coverage.xml'];

/** Diff unificado sin contexto (`-U0`) → archivo → conjunto de líneas añadidas o modificadas. */
export function lineasCambiadas(diff) {
  const cambios = new Map();
  let archivo = null;
  let siguiente = 0;
  let enHunk = false;
  for (const linea of diff.split('\n')) {
    if (linea.startsWith('diff ')) {
      enHunk = false;
    } else if (!enHunk && linea.startsWith('+++ ')) {
      archivo = linea.startsWith('+++ b/') ? linea.slice(6) : null;
    } else if (linea.startsWith('@@')) {
      enHunk = true;
      siguiente = Number(/\+(\d+)/.exec(linea)?.[1] ?? 0);
    } else if (archivo && linea.startsWith('+')) {
      if (!cambios.has(archivo)) cambios.set(archivo, new Set());
      cambios.get(archivo).add(siguiente);
      siguiente += 1;
    }
  }
  return cambios;
}

/** LCOV → archivo (relativo a la raíz del repositorio) → línea instrumentada → veces ejecutada. */
export function lineasInstrumentadas(lcov, base) {
  const archivos = new Map();
  let actual = null;
  for (const linea of lcov.split('\n')) {
    if (linea.startsWith('SF:')) {
      const fuente = linea.slice(3).trim();
      const relativo = path.posix.join(base, fuente.split(path.sep).join('/'));
      actual = new Map();
      archivos.set(path.isAbsolute(fuente) ? fuente : relativo, actual);
    } else if (linea.startsWith('DA:') && actual) {
      const [numero, veces] = linea.slice(3).split(',');
      actual.set(Number(numero), Number(veces));
    }
  }
  return archivos;
}

/**
 * Cobertura XML de `pytest-cov` (coverage.py) → archivo (relativo a la raíz del repositorio) → línea → veces ejecutada.
 * Los `filename` son relativos al `<source>` (p. ej. `domain/x.py` bajo `…/apps/rag-orchestrator/app`), por eso se resuelven
 * contra él; no hay dependencia de XML porque el formato es plano y estable.
 */
export function lineasInstrumentadasCobertura(xml, raiz) {
  const fuente = /<source>([^<]+)<\/source>/.exec(xml)?.[1]?.trim() ?? raiz;
  const archivos = new Map();
  for (const [, filename, cuerpo] of xml.matchAll(/<class\b[^>]*\bfilename="([^"]+)"[^>]*>([\s\S]*?)<\/class>/g)) {
    const lineas = new Map();
    for (const [, numero, veces] of cuerpo.matchAll(/<line\b[^>]*\bnumber="(\d+)"[^>]*\bhits="(\d+)"/g)) {
      lineas.set(Number(numero), Number(veces));
    }
    archivos.set(aRelativo(path.resolve(fuente, filename), raiz), lineas);
  }
  return archivos;
}

function aRelativo(archivo, raiz) {
  return path.isAbsolute(archivo) ? path.relative(raiz, archivo).split(path.sep).join('/') : archivo;
}

/**
 * Porcentaje de líneas cambiadas e instrumentadas que ejecutaron los tests, por archivo cambiado. Las líneas que v8 no
 * instrumenta (comentarios, tipos, llaves) no cuentan, como en diff-cover. Un archivo sin líneas instrumentadas no aparece.
 */
export function medirLineasCambiadas(diff, informes, raiz) {
  const cambiadas = lineasCambiadas(diff);
  const instrumentadas = new Map();
  for (const informe of informes) {
    const archivos = informe.coberturaXml
      ? lineasInstrumentadasCobertura(informe.coberturaXml, raiz)
      : lineasInstrumentadas(informe.lcov, informe.base);
    for (const [archivo, lineas] of archivos) instrumentadas.set(aRelativo(archivo, raiz), lineas);
  }
  const medidas = [];
  for (const [archivo, lineas] of cambiadas) {
    const cobertura = instrumentadas.get(archivo);
    if (!cobertura) continue;
    const medibles = [...lineas].filter((numero) => cobertura.has(numero));
    if (medibles.length === 0) continue;
    const cubiertas = medibles.filter((numero) => cobertura.get(numero) > 0).length;
    medidas.push({
      archivo,
      lineasCambiadas: medibles.length,
      lineasCubiertas: cubiertas,
      porcentaje: Math.round((cubiertas / medibles.length) * 100),
    });
  }
  return medidas.sort((a, b) => a.archivo.localeCompare(b.archivo));
}

/** Una alerta por archivo de `coverage.alertPaths` cuyo porcentaje queda bajo `coverage.changedLinesWarn`. */
export function alertasDeCobertura(medidas, { changedLinesWarn, alertPaths }) {
  const acotadas = alertPaths.map(globARegExp);
  return medidas
    .filter((medida) => medida.porcentaje < changedLinesWarn && acotadas.some((ruta) => ruta.test(medida.archivo)))
    .map((medida) =>
      hallazgo({
        tool: 'cobertura-lineas-cambiadas',
        rule: 'cobertura-de-lineas-cambiadas',
        file: medida.archivo,
        symbol: `${medida.lineasCubiertas}/${medida.lineasCambiadas} líneas cambiadas cubiertas`,
        measured: medida.porcentaje,
        threshold: changedLinesWarn,
        severity: 'warn',
      }),
    );
}

/** Ejecuta Git en `raiz`; una salida distinta de 0 es un repositorio roto o una rama base inexistente, no «nada que medir». */
function ejecutarGit(raiz, argumentos) {
  const resultado = spawnSync('git', argumentos, { cwd: raiz, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (resultado.error) {
    throw new Error(`cobertura de líneas cambiadas: no se pudo ejecutar git (${resultado.error.code ?? resultado.error.message})`);
  }
  if (resultado.status !== 0) {
    throw new Error(`cobertura de líneas cambiadas: git ${argumentos.join(' ')} terminó con estado ${resultado.status}: ${resultado.stderr.trim()}`);
  }
  return resultado.stdout;
}

/**
 * Mide el PR: diff contra la rama base (`COBERTURA_BASE`, por defecto `origin/main`) y los informes de cobertura que haya.
 * Sin informes devuelve `null` (el reporte lo dice; nunca inventa un 100 %), salvo con `CI=true`, donde faltar cualquiera de
 * los informes esperados LANZA: en la CI una medición ausente es un paso roto, no una cobertura vacía. Git roto (la rama base
 * no existe, el diff falla) lanza siempre.
 */
export function medirCoberturaDelPr(raiz, { baseGit, env = process.env } = {}) {
  const rutas = [...INFORMES_LCOV.map(({ lcov }) => lcov), ...INFORMES_COBERTURA_XML];
  const ausentes = rutas.filter((ruta) => !existsSync(path.join(raiz, ruta)));
  if (env.CI === 'true' && ausentes.length > 0) {
    throw new Error(`cobertura de líneas cambiadas: faltan los informes esperados en la CI: ${ausentes.join(', ')}`);
  }
  const informes = [
    ...INFORMES_LCOV.filter(({ lcov }) => !ausentes.includes(lcov)).map(({ lcov, base }) => ({
      lcov: readFileSync(path.join(raiz, lcov), 'utf8'),
      base,
    })),
    ...INFORMES_COBERTURA_XML.filter((ruta) => !ausentes.includes(ruta)).map((ruta) => ({
      coberturaXml: readFileSync(path.join(raiz, ruta), 'utf8'),
    })),
  ];
  if (informes.length === 0) return null;
  const rama = baseGit ?? env.COBERTURA_BASE ?? 'origin/main';
  const ancestro = ejecutarGit(raiz, ['merge-base', rama, 'HEAD']).trim();
  return medirLineasCambiadas(ejecutarGit(raiz, ['diff', '-U0', '--no-color', ancestro]), informes, raiz);
}

/**
 * Archivos que cambia el PR respecto de la rama base (`COBERTURA_BASE`, por defecto `origin/main`), o `null` si esa rama no
 * existe en este clon (un clon local sin `origin/main`: el llamador mide todo). Git ausente o roto lanza.
 */
export function archivosDelPr(raiz, { baseGit, env = process.env } = {}) {
  const rama = baseGit ?? env.COBERTURA_BASE ?? 'origin/main';
  const existe = spawnSync('git', ['rev-parse', '--verify', '--quiet', rama], { cwd: raiz, encoding: 'utf8' });
  if (existe.error) throw new Error(`no se pudo ejecutar git (${existe.error.code ?? existe.error.message})`);
  if (existe.status !== 0) return null;
  const ancestro = ejecutarGit(raiz, ['merge-base', rama, 'HEAD']).trim();
  return ejecutarGit(raiz, ['diff', '--name-only', ancestro]).split('\n').filter(Boolean);
}
