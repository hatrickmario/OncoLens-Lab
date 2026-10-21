#!/usr/bin/env node
/**
 * Job `eval-required` de la CI (US-074, L1D-237, ADR-41 «DoD»): si el diff del PR toca un disparador
 * (`scripts/ci/eval-trigger-paths.yaml`), ejecuta `npm run evaluate` con la configuración de la CI (adapters falsos, sin
 * red ni modelos pesados), compara el reporte con `data/evaluation/baseline.json` y falla ante una regresión mayor que
 * la tolerancia. No exige juez LLM. La lógica vive aquí y no en el YAML del workflow (docs/process/ci.md).
 *
 * Uso: node scripts/ci/eval-required.mjs [--base <sha>] [--root <dir>] [--baseline <archivo>] [--salida <dir>]
 *   - tolerancia (RN-22): variable EVAL_MAX_REGRESSION o, si no está, `regresion.tolerancia_maxima` del YAML de reglas.
 *   - salidas: `<salida>/reporte.json` (artefacto) y `<salida>/comentario.md` (tabla de métricas; también va al resumen
 *     del job si existe GITHUB_STEP_SUMMARY). Solo agregados y configuración: nunca datos (RN-14).
 * Códigos de salida: 0 omitido o sin regresión · 1 regresión o la suite falló · 2 configuración inválida.
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { compararConBaseline, tablaMarkdown } from '../eval/comparar-baseline.mjs';
import { cargarReglas, detectar } from './eval-trigger.mjs';

const RAIZ = path.resolve(import.meta.dirname, '../..');
const BASELINE_POR_DEFECTO = 'data/evaluation/baseline.json';
const SALIDA_POR_DEFECTO = 'apps/rag-orchestrator/eval/results/ci';
export const AVISO_SIN_BASELINE = 'Sin baseline de regresión: umbral no aplicado';

/** Tolerancia en puntos de la métrica: la variable EVAL_MAX_REGRESSION manda; un valor inválido es un error, no se ignora. */
export function toleranciaDe(entorno, reglas) {
  const valor = entorno.EVAL_MAX_REGRESSION === undefined || entorno.EVAL_MAX_REGRESSION === '' ? reglas.regresion.tolerancia_maxima : Number(entorno.EVAL_MAX_REGRESSION);
  if (!Number.isFinite(valor) || valor < 0) throw new Error('EVAL_MAX_REGRESSION debe ser un número mayor o igual que 0');
  return valor;
}

const leerJson = (archivo) => JSON.parse(readFileSync(archivo, 'utf8'));

function publicarResumen(markdown, salida, entorno) {
  mkdirSync(salida, { recursive: true });
  writeFileSync(path.join(salida, 'comentario.md'), `${markdown}\n`);
  if (entorno.GITHUB_STEP_SUMMARY) appendFileSync(entorno.GITHUB_STEP_SUMMARY, `${markdown}\n`);
}

function ejecutarSuite(raiz, salida) {
  const resultado = spawnSync(
    'node',
    ['scripts/eval/evaluate.mjs', '--suite', 'all', '--report', 'json', '--salida', salida, '--nombre-archivo', 'reporte.json'],
    { cwd: raiz, stdio: 'inherit', env: process.env },
  );
  return resultado.status ?? 1;
}

/** Una ruta con saltos de línea, comillas invertidas o barras no puede añadir Markdown propio al resumen. */
const rutaSegura = (ruta) => ruta.replace(/[\r\n`|]/g, '?');
const lineasDeMotivos = (motivos) => motivos.map(({ ruta, motivo }) => `- ${motivo}: \`${rutaSegura(ruta)}\``).join('\n');

function informe({ motivos, tolerancia, comparacion }) {
  const encabezado = ['## eval-required', '', 'La suite `evaluate` se ejecutó (adapters falsos, FX-T5a-a) porque el diff toca:', lineasDeMotivos(motivos), ''];
  if (!comparacion) return [...encabezado, `> ${AVISO_SIN_BASELINE}`].join('\n');
  const { regresiones } = comparacion;
  const veredicto = regresiones.length === 0 ? `Sin regresión (tolerancia ${tolerancia}).` : `Regresión en ${regresiones.map((r) => `\`${r.metrica}\``).join(', ')} (tolerancia ${tolerancia}).`;
  return [...encabezado, veredicto, '', tablaMarkdown(comparacion)].join('\n');
}

/** @returns {number} código de salida del job */
export function ejecutar({ raiz = RAIZ, base, baseline = BASELINE_POR_DEFECTO, salida = SALIDA_POR_DEFECTO, entorno = process.env } = {}) {
  const reglas = cargarReglas();
  let tolerancia;
  try {
    tolerancia = toleranciaDe(entorno, reglas);
  } catch (error) {
    console.error(`eval-required — ${error.message}`);
    return 2;
  }
  const { dispara, motivos } = detectar({ raiz, base, reglas });
  const carpeta = path.resolve(raiz, salida);
  if (!dispara) {
    const mensaje = 'eval-required — omitido: ningún disparador en el diff, `evaluate` no se ejecutó';
    console.log(mensaje);
    publicarResumen(`## eval-required\n\n${mensaje.replace('eval-required — ', '')}.`, carpeta, entorno);
    return 0;
  }
  const codigo = ejecutarSuite(raiz, carpeta);
  if (codigo !== 0) {
    console.error(`eval-required — la suite evaluate terminó con código ${codigo}`);
    return 1;
  }
  const archivoBaseline = path.resolve(raiz, baseline);
  const comparacion = existsSync(archivoBaseline) ? compararConBaseline(leerJson(path.join(carpeta, 'reporte.json')), leerJson(archivoBaseline), { tolerancia }) : null;
  publicarResumen(informe({ motivos, tolerancia, comparacion }), carpeta, entorno);
  if (!comparacion) {
    console.log(`eval-required — ${AVISO_SIN_BASELINE}`);
    return 0;
  }
  return veredictoDeRegresion(comparacion, { baseline, tolerancia });
}

/** Imprime cada métrica en regresión (o la ausencia de ellas) y devuelve el código de salida. */
function veredictoDeRegresion({ regresiones }, { baseline, tolerancia }) {
  regresiones.forEach((r) => console.error(`eval-required — regresión en ${r.metrica}: baseline ${r.baseline}, actual ${r.actual ?? 'sin valor'}`));
  if (regresiones.length === 0) console.log(`eval-required — sin regresión contra ${baseline} (tolerancia ${tolerancia})`);
  return regresiones.length === 0 ? 0 : 1;
}

function main(argumentos) {
  const valorDe = (nombre) => (argumentos.includes(nombre) ? argumentos[argumentos.indexOf(nombre) + 1] : undefined);
  return ejecutar({
    raiz: path.resolve(valorDe('--root') ?? RAIZ),
    base: valorDe('--base'),
    baseline: valorDe('--baseline') ?? BASELINE_POR_DEFECTO,
    salida: valorDe('--salida') ?? SALIDA_POR_DEFECTO,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
