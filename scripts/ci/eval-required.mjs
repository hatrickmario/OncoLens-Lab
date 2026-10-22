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
import { compararConBaseline, tablaMarkdown, textoSeguro } from '../eval/comparar-baseline.mjs';
import { spawnPython } from '../eval/python.mjs';
import { cargarReglas, detectar } from './eval-trigger.mjs';
import { valorDeArgumento } from './lib/cli.mjs';

const RAIZ = path.resolve(import.meta.dirname, '../..');
const BASELINE_POR_DEFECTO = 'data/evaluation/baseline.json';
const SALIDA_POR_DEFECTO = 'apps/rag-orchestrator/eval/results/ci';
const DIRECTORIO_RAG = path.join('apps', 'rag-orchestrator');
const CONFIG_DE_UMBRALES = path.join('eval', 'configs', 'regression.yaml');
const FORMATO_DE_TOLERANCIA = /^\d+(\.\d+)?$/;
const MENSAJE_ENTRADA_ILEGIBLE = 'eval-required — reporte o baseline ilegible';

/** Error de configuración con mensaje fijo, seguro de imprimir (los demás se reportan solo por su nombre, RN-14). */
class ConfiguracionInvalida extends Error {}

/** Tolerancia en puntos de la métrica: EVAL_MAX_REGRESSION manda y debe ser un decimal sin signo ni notación (RN-22); un valor inválido es un error. */
export function toleranciaDe(entorno, reglas) {
  const crudo = entorno.EVAL_MAX_REGRESSION;
  if (crudo === undefined || crudo === '') return reglas.regresion.tolerancia_maxima;
  if (!FORMATO_DE_TOLERANCIA.test(crudo)) throw new ConfiguracionInvalida('EVAL_MAX_REGRESSION debe ser un decimal mayor o igual que 0');
  return Number(crudo);
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
 * Mínimos de `regression.yaml` sobre el reporte (CLI de ai-services). Devuelve el código y las líneas de stdout y stderr tal
 * cual; si el proceso no arranca o se agota, devuelve 2 sin el motivo.
 */
function comprobarUmbrales(raiz, reporte, entorno) {
  const resultado = spawnPython(['-m', 'app.evaluation.comparar_regresion', '--reporte', reporte, '--config', CONFIG_DE_UMBRALES], {
    directorio: path.join(raiz, DIRECTORIO_RAG),
    entorno,
    opciones: { encoding: 'utf8' },
  });
  const lineasDe = (texto) => (texto ?? '').split('\n').filter(Boolean);
  return { codigo: resultado.status ?? 2, salida: lineasDe(resultado.stdout), errores: lineasDe(resultado.stderr) };
}

const lineasDeMotivos = (motivos) => motivos.map(({ ruta, motivo }) => `- ${motivo}: \`${textoSeguro(ruta)}\``).join('\n');

function seccionDeBaseline(comparacion, tolerancia) {
  if (!comparacion) return ['> Sin `data/evaluation/baseline.json`: comparación con el baseline no aplicada.'];
  const { regresiones } = comparacion;
  const veredicto = regresiones.length === 0 ? `Sin regresión contra el baseline (tolerancia ${tolerancia}).` : `Regresión en ${regresiones.map((r) => `\`${textoSeguro(r.metrica)}\``).join(', ')} (tolerancia ${tolerancia}).`;
  return [veredicto, '', tablaMarkdown(comparacion)];
}

function seccionDeUmbrales({ salida, errores }) {
  return ['', '### Mínimos de `regression.yaml`', '', ...[...salida, ...errores].map((linea) => `> ${textoSeguro(linea)}`)];
}

function comentario({ motivos, tolerancia, comparacion, umbrales }) {
  const encabezado = ['## eval-required', '', 'La suite `evaluate` se ejecutó (adapters falsos, FX-T5a-a) porque el diff toca:', lineasDeMotivos(motivos), ''];
  return [...encabezado, ...seccionDeBaseline(comparacion, tolerancia), ...seccionDeUmbrales(umbrales)].join('\n');
}

/** Líneas de consola y código de salida del control contra el baseline. */
function veredictoDeRegresion({ regresiones }, { baseline, tolerancia }) {
  if (regresiones.length === 0) return { codigo: 0, salida: [`eval-required — sin regresión contra ${baseline} (tolerancia ${tolerancia})`], errores: [] };
  const errores = regresiones.map((r) => `eval-required — regresión en ${r.metrica}: baseline ${r.baseline}, actual ${r.actual ?? 'sin valor'}`);
  return { codigo: 1, salida: [], errores };
}

/** Único punto que escribe en la consola; el orden es el del comentario: baseline y después mínimos. */
function imprimir(...resultados) {
  resultados.forEach(({ salida, errores }) => {
    salida.forEach((linea) => console.log(linea));
    errores.forEach((linea) => console.error(linea));
  });
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
    console.error(error instanceof ConfiguracionInvalida ? `eval-required — configuración inválida: ${error.message}` : `eval-required — configuración inválida (${error.name})`);
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
  let comparacion;
  try {
    comparacion = existsSync(archivoBaseline) ? compararConBaseline(leerJson(reporte), leerJson(archivoBaseline), { tolerancia }) : null;
  } catch {
    console.error(MENSAJE_ENTRADA_ILEGIBLE);
    return 2;
  }
  const umbrales = comprobarUmbrales(raiz, reporte, entorno);
  publicarComentario(comentario({ motivos, tolerancia, comparacion, umbrales }), carpeta, entorno);
  const contraBaseline = comparacion ? veredictoDeRegresion(comparacion, { baseline, tolerancia }) : { codigo: 0, salida: [], errores: [] };
  imprimir(contraBaseline, umbrales);
  if (contraBaseline.codigo !== 0) return contraBaseline.codigo;
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
