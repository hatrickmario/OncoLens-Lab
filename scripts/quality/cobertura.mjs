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

const aRelativo = (archivo, raiz) =>
  path.isAbsolute(archivo) ? path.relative(raiz, archivo).split(path.sep).join('/') : archivo;

/**
 * Porcentaje de líneas cambiadas e instrumentadas que ejecutaron los tests, por archivo cambiado. Las líneas que v8 no
 * instrumenta (comentarios, tipos, llaves) no cuentan, como en diff-cover. Un archivo sin líneas instrumentadas no aparece.
 */
export function medirLineasCambiadas(diff, informes, raiz) {
  const cambiadas = lineasCambiadas(diff);
  const instrumentadas = new Map();
  for (const { lcov, base } of informes) {
    for (const [archivo, lineas] of lineasInstrumentadas(lcov, base)) instrumentadas.set(aRelativo(archivo, raiz), lineas);
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

/**
 * Mide el PR: diff contra la rama base (`COBERTURA_BASE`, por defecto `origin/main`) y los LCOV que haya. Sin informes o sin
 * la rama base no hay nada que medir y devuelve `null` (el reporte lo dice); nunca inventa un 100 %.
 */
export function medirCoberturaDelPr(raiz, { baseGit = process.env.COBERTURA_BASE ?? 'origin/main' } = {}) {
  const informes = INFORMES_LCOV.filter(({ lcov }) => existsSync(path.join(raiz, lcov))).map(({ lcov, base }) => ({
    lcov: readFileSync(path.join(raiz, lcov), 'utf8'),
    base,
  }));
  if (informes.length === 0) return null;
  const ancestro = spawnSync('git', ['merge-base', baseGit, 'HEAD'], { cwd: raiz, encoding: 'utf8' });
  if (ancestro.status !== 0) return null;
  const diff = spawnSync('git', ['diff', '-U0', '--no-color', ancestro.stdout.trim()], {
    cwd: raiz,
    encoding: 'utf8',
    maxBuffer: 256 * 1024 * 1024,
  });
  if (diff.status !== 0) return null;
  return medirLineasCambiadas(diff.stdout, informes, raiz);
}
