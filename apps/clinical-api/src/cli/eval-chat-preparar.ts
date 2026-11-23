#!/usr/bin/env node
// Comando `npm run eval:chat-preparar` (US-269, L1D-326): raíz de composición del proceso; delega en `ejecutarComandoPreparar`.
import path from 'node:path';
import { nuevoTraceId } from '../infrastructure/ids.js';
import { ejecutarComandoPreparar } from '../evaluacion/chat/comando.js';
import { dependenciasDelProceso, entornoDelStackDeTest } from '../evaluacion/chat/composicion.js';

const RAIZ_DEL_REPO = path.resolve(import.meta.dirname, '../../../..');
/** Directorio no versionado (`.gitignore` raíz): lo que `evaluate:chat` lee y borra al terminar. */
const SALIDA = path.join(RAIZ_DEL_REPO, 'apps', 'clinical-api', 'eval', 'results', 'tmp');

const entorno = entornoDelStackDeTest(process.env, RAIZ_DEL_REPO);
const codigo = await ejecutarComandoPreparar(process.argv.slice(2), {
  raizDelRepo: RAIZ_DEL_REPO,
  entorno,
  directorioDeSalida: SALIDA,
  stdout: (texto) => process.stdout.write(texto),
  stderr: (texto) => process.stderr.write(texto),
  trazador: nuevoTraceId,
  ...dependenciasDelProceso(entorno, {
    raizDelRepo: RAIZ_DEL_REPO,
    reloj: { now: () => new Date() },
  }),
});
process.exitCode = codigo;
