// Comprueba que `npm run format` no modifica lo generado ni los specs (L1D-265, US-215 AC-1).
// Las rutas salen de scripts/contracts/generated.mjs y paths.mjs (fuente única de "qué es generado").
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { GENERATED_ROOTS } from '../contracts/generated.mjs';
import { SPEC_FILES } from '../contracts/lib/paths.mjs';

const RAIZ = path.resolve(import.meta.dirname, '../..');
const RUTAS_INTOCABLES = [...GENERATED_ROOTS, ...Object.values(SPEC_FILES)];

const ejecutar = (comando, argumentos) =>
  spawnSync(comando, argumentos, { cwd: RAIZ, stdio: 'inherit' }).status ?? 1;

const formatoTerminoBien = ejecutar('npm', ['run', 'format']) === 0;
const sinCambiosEnLoGenerado = ejecutar('git', ['diff', '--exit-code', '--', ...RUTAS_INTOCABLES]) === 0;

process.exit(formatoTerminoBien && sinCambiosEnLoGenerado ? 0 : 1);
