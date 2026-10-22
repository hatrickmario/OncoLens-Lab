/**
 * Ejecución síncrona de un módulo de `apps/rag-orchestrator` con el intérprete de EVAL_PYTHON (python3 por defecto), tope
 * EVAL_TIMEOUT_S (600 s por defecto) y PYTHONPATH en ese directorio (RN-22). Lo comparten `evaluate.mjs` y la CI.
 */
import { spawnSync } from 'node:child_process';

const TIMEOUT_POR_DEFECTO_S = 600;

/**
 * @param {string[]} argumentos argumentos del intérprete (`['-m', 'app.evaluation.evaluate', ...]`)
 * @param {{ directorio: string, entorno: NodeJS.ProcessEnv, opciones?: object }} contexto
 */
export function spawnPython(argumentos, { directorio, entorno, opciones = {} }) {
  const segundos = Number(entorno.EVAL_TIMEOUT_S) || TIMEOUT_POR_DEFECTO_S;
  return spawnSync(entorno.EVAL_PYTHON || 'python3', argumentos, {
    cwd: directorio,
    timeout: segundos * 1000,
    env: { ...entorno, PYTHONPATH: directorio },
    ...opciones,
  });
}
