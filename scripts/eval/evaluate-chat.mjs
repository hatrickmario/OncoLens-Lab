#!/usr/bin/env node
/**
 * `npm run evaluate:chat -- --config <yaml> [--salida <dir>] [--sin-preparar]` (US-269, L1D-326): encadena la preparación
 * de peticiones de `clinical-api` (`eval:chat-preparar`) y la familia `chat` de `rag-orchestrator`
 * (`python -m app.evaluation.chat`), deja el JSON de la familia en `--salida` y borra las peticiones temporales al terminar,
 * también si falla. Con `--sin-preparar` no toca la base de datos: la familia usa los ejemplos del contrato (CI,
 * `chat-fake.yaml`); con `proveedor: local` y sin peticiones la familia termina con código 2 sin escribir cifras.
 * El script no interpreta el YAML: quien decide si hacen falta peticiones es la familia. Devuelve el código de la familia.
 * Variables (RN-22): EVAL_PYTHON (intérprete, por defecto python3) y EVAL_TIMEOUT_S (tope de cada proceso, por defecto 600).
 */
import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnPython } from './python.mjs';

const RAIZ = path.resolve(import.meta.dirname, '../..');
const DIRECTORIO_DEL_RAG = path.join(RAIZ, 'apps', 'rag-orchestrator');
/** Donde `eval:chat-preparar` escribe las peticiones: ignorado por git y borrado al terminar. */
export const DIRECTORIO_DE_PETICIONES = path.join(
  RAIZ,
  'apps',
  'clinical-api',
  'eval',
  'results',
  'tmp',
);
const USO = 'uso: evaluate:chat --config <yaml> [--salida <dir>] [--sin-preparar]\n';
const TIMEOUT_POR_DEFECTO_S = 600;

/** `{ config, salida, sinPreparar }` o `null` si faltan argumentos o sobra alguno. */
export function leerOpciones(argumentos, cwd = process.cwd()) {
  const opciones = { config: null, salida: null, sinPreparar: false };
  for (let i = 0; i < argumentos.length; i += 1) {
    const argumento = argumentos[i];
    if (argumento === '--sin-preparar') opciones.sinPreparar = true;
    else if (argumento === '--config' || argumento === '--salida') {
      const valor = argumentos[(i += 1)];
      if (valor === undefined) return null;
      opciones[argumento === '--config' ? 'config' : 'salida'] = path.resolve(cwd, valor);
    } else return null;
  }
  return opciones.config === null ? null : opciones;
}

/** Argumentos del intérprete para la familia `chat`; `--peticiones` solo si la preparación las dejó. */
export function argumentosDePython({ config, salida }, conPeticiones) {
  return [
    '-m',
    'app.evaluation.chat',
    '--config',
    config,
    ...(conPeticiones ? ['--peticiones', DIRECTORIO_DE_PETICIONES] : []),
    ...(salida === null ? [] : ['--salida', salida]),
  ];
}

/** Ejecuta `eval:chat-preparar` (clinical-api) heredando la salida; devuelve su código de salida. */
function prepararPeticiones(entorno) {
  const segundos = Number(entorno.EVAL_TIMEOUT_S) || TIMEOUT_POR_DEFECTO_S;
  const resultado = spawnSync(
    'npm',
    ['run', '--silent', 'eval:chat-preparar', '-w', 'apps/clinical-api'],
    {
      cwd: RAIZ,
      env: entorno,
      stdio: 'inherit',
      timeout: segundos * 1000,
    },
  );
  if (resultado.error) {
    console.error(`evaluate:chat: la preparación no terminó (${resultado.error.code ?? 'error'})`);
    return 1;
  }
  return resultado.status ?? 1;
}

function ejecutarFamilia(opciones, conPeticiones, entorno) {
  const resultado = spawnPython(argumentosDePython(opciones, conPeticiones), {
    directorio: DIRECTORIO_DEL_RAG,
    entorno,
    opciones: { stdio: 'inherit' },
  });
  if (resultado.error?.code === 'ENOENT') {
    console.error('evaluate:chat: no se encontró el intérprete de Python (EVAL_PYTHON)');
    return 2;
  }
  if (resultado.error) {
    console.error(`evaluate:chat: el proceso no terminó (${resultado.error.code ?? 'error'})`);
    return 1;
  }
  return resultado.status ?? 1;
}

/**
 * Prepara (salvo `--sin-preparar`), mide y borra las peticiones en un `finally`. El `finally` no cubre un SIGKILL: por eso
 * `eval:chat-preparar` limpia el residuo al arrancar.
 */
export function main(argumentos, entorno, cwd = process.cwd()) {
  const opciones = leerOpciones(argumentos, cwd);
  if (opciones === null) {
    process.stderr.write(USO);
    return 2;
  }
  try {
    if (!opciones.sinPreparar) {
      const codigoDeLaPreparacion = prepararPeticiones(entorno);
      if (codigoDeLaPreparacion !== 0) return codigoDeLaPreparacion;
    }
    return ejecutarFamilia(opciones, !opciones.sinPreparar, entorno);
  } finally {
    if (!opciones.sinPreparar) {
      rmSync(DIRECTORIO_DE_PETICIONES, { recursive: true, force: true });
    }
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2), process.env);
}
