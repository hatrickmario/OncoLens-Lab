#!/usr/bin/env node
// Comando `npm run eval:pii` (US-013, ADR-40): raíz de composición del proceso; delega en `ejecutarComandoPii`.
import { performance } from 'node:perf_hooks';
import path from 'node:path';
import { ejecutarComandoPii } from '../evaluacion/pii/comando.js';

const RAIZ_DEL_REPO = path.resolve(import.meta.dirname, '../../../..');

const codigo = await ejecutarComandoPii(process.argv.slice(2), {
  raizDelRepo: RAIZ_DEL_REPO,
  entorno: process.env,
  reloj: () => performance.now(),
  stdout: (texto) => process.stdout.write(texto),
  stderr: (texto) => process.stderr.write(texto),
});
process.exitCode = codigo;
