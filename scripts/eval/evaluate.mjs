#!/usr/bin/env node
/**
 * Envoltorio de `npm run evaluate -- --suite <familia> --report json` (US-072, contrato de la skill run-ai-eval):
 * llama a `python -m app.evaluation.evaluate` dentro de apps/rag-orchestrator y devuelve su código de salida.
 * Sin `--config` usa la configuración de la CI (adapters falsos, FX-T5a-a). Las demás opciones pasan tal cual.
 * Variables (RN-22): EVAL_PYTHON (intérprete, por defecto python3) y EVAL_TIMEOUT_S (tope del proceso, por defecto 600).
 */
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnPython } from './python.mjs';

const RAIZ = path.resolve(import.meta.dirname, '../..');
const DIRECTORIO = path.join(RAIZ, 'apps', 'rag-orchestrator');
const CONFIG_DE_LA_CI = path.join('eval', 'configs', 'test-fake.yaml');

const OPCIONES_CON_RUTA = ['--config', '--salida'];

/** Las rutas que se pasan al envoltorio son relativas a donde se ejecuta, no a apps/rag-orchestrator. */
function conRutasAbsolutas(argumentos, cwd) {
  return argumentos.map((a, i) =>
    OPCIONES_CON_RUTA.includes(argumentos[i - 1]) ? path.resolve(cwd, a) : a,
  );
}

const FLAGS_DEL_JUEZ = {
  EVAL_JUDGE_MODEL: '--juez-modelo',
  EVAL_JUDGE_BASE_URL: '--juez-base-url',
  EVAL_JUDGE_TEMPERATURE: '--juez-temperatura',
  EVAL_JUDGE_SEED: '--juez-semilla',
};

/**
 * ADR-41: las claves EVAL_JUDGE_* del entorno llegan al runner como flags `--juez-*` (el runner no lee el entorno,
 * US-037 AC-1). Van antes que los argumentos del usuario: un flag explícito gana.
 */
export function flagsDelJuezDesdeEntorno(entorno) {
  return Object.entries(FLAGS_DEL_JUEZ).flatMap(([variable, flag]) =>
    entorno[variable] ? [flag, entorno[variable]] : [],
  );
}

/** Argumentos para el módulo Python: añade la configuración de la CI si no se pasó `--config`. */
export function argumentosDePython(argumentos, cwd = process.cwd(), entorno = {}) {
  const conConfig = argumentos.includes('--config');
  return [
    '-m',
    'app.evaluation.evaluate',
    ...(conConfig ? [] : ['--config', CONFIG_DE_LA_CI]),
    ...flagsDelJuezDesdeEntorno(entorno),
    ...conRutasAbsolutas(argumentos, cwd),
  ];
}

function main(argumentos, entorno) {
  const resultado = spawnPython(argumentosDePython(argumentos, process.cwd(), entorno), {
    directorio: DIRECTORIO,
    entorno,
    opciones: { stdio: 'inherit' },
  });
  if (resultado.error?.code === 'ENOENT') {
    console.error('evaluate: no se encontró el intérprete de Python (EVAL_PYTHON)');
    return 2;
  }
  if (resultado.error) {
    console.error(`evaluate: el proceso no terminó (${resultado.error.code ?? 'error'})`);
    return 1;
  }
  return resultado.status ?? 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2), process.env);
}
