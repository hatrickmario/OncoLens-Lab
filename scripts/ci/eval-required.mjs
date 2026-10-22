#!/usr/bin/env node
/**
 * Job `eval-required` de la CI (US-074, L1D-237, ADR-41 «DoD»): si el diff del PR toca un disparador
 * (`scripts/ci/eval-trigger-paths.yaml`), ejecuta `npm run evaluate` con la configuración de la CI (adapters falsos, sin
 * red ni modelos pesados), y aplica dos comparaciones sobre el reporte, ambas necesarias para pasar:
 *   1. contra `data/evaluation/baseline.json` (caída máxima tolerada, EVAL_MAX_REGRESSION), en JS;
 *   2. contra los mínimos de `apps/rag-orchestrator/eval/configs/regression.yaml` (DEC-07), con
 *      `python -m app.evaluation.comparar_regresion` (ai-services): su stdout y stderr se reenvían tal cual y sus líneas
 *      van al resumen; aquí no se interpreta ni se imprime ninguna excepción (RN-14: solo el código de salida y las líneas del CLI).
 * No exige juez LLM. La lógica vive aquí y no en el YAML del workflow (docs/process/ci.md).
 *
 * Uso: node scripts/ci/eval-required.mjs [--base <sha>] [--root <dir>] [--baseline <archivo>] [--salida <dir>]
 *   - tolerancia (RN-22): variable EVAL_MAX_REGRESSION o, si no está, `regresion.tolerancia_maxima` del YAML de reglas.
 *   - salidas: `<salida>/reporte.json` (artefacto) y `<salida>/comentario.md` (tabla de métricas; también va al resumen
 *     del job si existe GITHUB_STEP_SUMMARY). Solo agregados y configuración: nunca datos (RN-14).
 * Códigos de salida: 0 omitido o sin regresión · 1 regresión o la suite falló · 2 configuración o entrada inválida.
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { compararConBaseline, tablaMarkdown } from '../eval/comparar-baseline.mjs';
import { cargarReglas, detectar } from './eval-trigger.mjs';
import { valorDeArgumento } from './lib/cli.mjs';

const RAIZ = path.resolve(import.meta.dirname, '../..');
const BASELINE_POR_DEFECTO = 'data/evaluation/baseline.json';
const SALIDA_POR_DEFECTO = 'apps/rag-orchestrator/eval/results/ci';
const DIRECTORIO_RAG = path.join('apps', 'rag-orchestrator');
const CONFIG_DE_UMBRALES = path.join('eval', 'configs', 'regression.yaml');
const TIMEOUT_POR_DEFECTO_S = 600;

/** Tolerancia en puntos de la métrica: la variable EVAL_MAX_REGRESSION manda; un valor inválido es un error, no se ignora. */
export function toleranciaDe(entorno, reglas) {
  const valor = entorno.EVAL_MAX_REGRESSION === undefined || entorno.EVAL_MAX_REGRESSION === '' ? reglas.regresion.tolerancia_maxima : Number(entorno.EVAL_MAX_REGRESSION);
  if (!Number.isFinite(valor) || valor < 0) throw new Error('EVAL_MAX_REGRESSION debe ser un número mayor o igual que 0');
  return valor;
}

const leerJson = (archivo) => JSON.parse(readFileSync(archivo, 'utf8'));

function publicarComentario(markdown, salida, entorno) {
  mkdirSync(salida, { recursive: true });
  writeFileSync(path.join(salida, 'comentario.md'), `${markdown}\n`);
  if (entorno.GITHUB_STEP_SUMMARY) appendFileSync(entorno.GITHUB_STEP_SUMMARY, `${markdown}\n`);
}

function ejecutarSuite(raiz, salida, entorno) {
  const resultado = spawnSync(
    'node',
    ['scripts/eval/evaluate.mjs', '--suite', 'all', '--report', 'json', '--salida', salida, '--nombre-archivo', 'reporte.json'],
    { cwd: raiz, stdio: 'inherit', env: entorno },
  );
  return resultado.status ?? 1;
}

/**
 * Mínimos de `regression.yaml` sobre el reporte (CLI de ai-services). Reenvía stdout y stderr y devuelve sus líneas con el
 * código de salida; si el proceso no arranca o se agota, devuelve 2 sin imprimir el motivo.
 */
function comprobarUmbrales(raiz, reporte, entorno) {
  const directorio = path.join(raiz, DIRECTORIO_RAG);
  const resultado = spawnSync(
    entorno.EVAL_PYTHON || 'python3',
    ['-m', 'app.evaluation.comparar_regresion', '--reporte', reporte, '--config', CONFIG_DE_UMBRALES],
    { cwd: directorio, encoding: 'utf8', timeout: (Number(entorno.EVAL_TIMEOUT_S) || TIMEOUT_POR_DEFECTO_S) * 1000, env: { ...entorno, PYTHONPATH: directorio } },
  );
  const lineasDe = (texto) => (texto ?? '').split('\n').filter(Boolean);
  const salida = lineasDe(resultado.stdout);
  const errores = lineasDe(resultado.stderr);
  salida.forEach((linea) => console.log(linea));
  errores.forEach((linea) => console.error(linea));
  return { codigo: resultado.status ?? 2, lineas: [...salida, ...errores] };
}

/** Una cadena con saltos de línea, comillas invertidas o barras no puede añadir Markdown propio al resumen. */
const textoSeguro = (texto) => texto.replace(/[\r\n`|]/g, '?');
const lineasDeMotivos = (motivos) => motivos.map(({ ruta, motivo }) => `- ${motivo}: \`${textoSeguro(ruta)}\``).join('\n');

function seccionDeBaseline(comparacion, tolerancia) {
  if (!comparacion) return ['> Sin `data/evaluation/baseline.json`: comparación con el baseline no aplicada.'];
  const { regresiones } = comparacion;
  const veredicto = regresiones.length === 0 ? `Sin regresión contra el baseline (tolerancia ${tolerancia}).` : `Regresión en ${regresiones.map((r) => `\`${r.metrica}\``).join(', ')} (tolerancia ${tolerancia}).`;
  return [veredicto, '', tablaMarkdown(comparacion)];
}

function seccionDeUmbrales({ lineas }) {
  return ['', '### Mínimos de `regression.yaml`', '', ...lineas.map((linea) => `> ${textoSeguro(linea)}`)];
}

function comentario({ motivos, tolerancia, comparacion, umbrales }) {
  const encabezado = ['## eval-required', '', 'La suite `evaluate` se ejecutó (adapters falsos, FX-T5a-a) porque el diff toca:', lineasDeMotivos(motivos), ''];
  return [...encabezado, ...seccionDeBaseline(comparacion, tolerancia), ...seccionDeUmbrales(umbrales)].join('\n');
}

/** Imprime cada métrica en regresión contra el baseline (o su ausencia) y devuelve el código de salida. */
function veredictoDeRegresion({ regresiones }, { baseline, tolerancia }) {
  regresiones.forEach((r) => console.error(`eval-required — regresión en ${r.metrica}: baseline ${r.baseline}, actual ${r.actual ?? 'sin valor'}`));
  if (regresiones.length === 0) console.log(`eval-required — sin regresión contra ${baseline} (tolerancia ${tolerancia})`);
  return regresiones.length === 0 ? 0 : 1;
}

/** Reglas, tolerancia y disparadores del diff; una configuración inválida lanza. */
function prepararDeteccion({ raiz, base, entorno }) {
  const reglas = cargarReglas();
  return { tolerancia: toleranciaDe(entorno, reglas), ...detectar({ raiz, base, reglas }) };
}

function registrarOmision(carpeta, entorno) {
  console.log('eval-required — omitido: ningún disparador en el diff, `evaluate` no se ejecutó');
  publicarComentario('## eval-required\n\nOmitido: ningún disparador en el diff, `evaluate` no se ejecutó.', carpeta, entorno);
}

/** @returns {number} código de salida del job */
export function ejecutar({ raiz = RAIZ, base, baseline = BASELINE_POR_DEFECTO, salida = SALIDA_POR_DEFECTO, entorno = process.env } = {}) {
  let deteccion;
  try {
    deteccion = prepararDeteccion({ raiz, base, entorno });
  } catch (error) {
    console.error(`eval-required — configuración inválida: ${error.message}`);
    return 2;
  }
  const { tolerancia, dispara, motivos } = deteccion;
  const carpeta = path.resolve(raiz, salida);
  if (!dispara) {
    registrarOmision(carpeta, entorno);
    return 0;
  }
  const codigo = ejecutarSuite(raiz, carpeta, entorno);
  if (codigo !== 0) {
    console.error(`eval-required — la suite evaluate terminó con código ${codigo}`);
    return 1;
  }
  const reporte = path.join(carpeta, 'reporte.json');
  const archivoBaseline = path.resolve(raiz, baseline);
  const comparacion = existsSync(archivoBaseline) ? compararConBaseline(leerJson(reporte), leerJson(archivoBaseline), { tolerancia }) : null;
  const umbrales = comprobarUmbrales(raiz, reporte, entorno);
  publicarComentario(comentario({ motivos, tolerancia, comparacion, umbrales }), carpeta, entorno);
  const contraBaseline = comparacion ? veredictoDeRegresion(comparacion, { baseline, tolerancia }) : 0;
  if (contraBaseline !== 0) return contraBaseline;
  return umbrales.codigo === 0 ? 0 : Math.min(umbrales.codigo, 2);
}

function main(argumentos) {
  return ejecutar({
    raiz: path.resolve(valorDeArgumento(argumentos, '--root') ?? RAIZ),
    base: valorDeArgumento(argumentos, '--base'),
    baseline: valorDeArgumento(argumentos, '--baseline') ?? BASELINE_POR_DEFECTO,
    salida: valorDeArgumento(argumentos, '--salida') ?? SALIDA_POR_DEFECTO,
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
