// Comprueba que `npm run format` no modifica lo generado ni los contratos (L1D-265, US-215 AC-1).
// Las rutas salen de scripts/contracts (fuente única de "qué es generado" y dónde viven specs y ejemplos).
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { GENERATED_ROOTS } from '../contracts/generated.mjs';
import { PATHS } from '../contracts/lib/paths.mjs';

const RAIZ = path.resolve(import.meta.dirname, '../..');
// Todos los specs (incluido el compartido) y los ejemplos que alimentan MSW y respx.
const RUTAS_INTOCABLES = [...GENERATED_ROOTS, ...Object.values(PATHS.specs), PATHS.examplesDir];

const ejecutar = (comando, argumentos, opciones = {}) =>
  spawnSync(comando, argumentos, { cwd: RAIZ, stdio: 'inherit', ...opciones }).status ?? 1;
const hayCambiosEnLoIntocable = () => ejecutar('git', ['diff', '--quiet', '--', ...RUTAS_INTOCABLES]) !== 0;

if (hayCambiosEnLoIntocable()) {
  console.error('árbol sucio en lo generado: confirma o descarta esos cambios antes de comprobar format');
  process.exit(1);
}

const formatoTerminoBien = ejecutar('npm', ['run', 'format']) === 0;
const sinCambiosEnLoIntocable = !hayCambiosEnLoIntocable();
if (!sinCambiosEnLoIntocable) ejecutar('git', ['diff', '--stat', '--', ...RUTAS_INTOCABLES]);

process.exit(formatoTerminoBien && sinCambiosEnLoIntocable ? 0 : 1);
