// Formato de Python con Ruff (L1D-265, design D3). `--check` solo verifica.
// Falla cerrado: sin `ruff` en el PATH no omite el formato en silencio.
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const RAIZ = path.resolve(import.meta.dirname, '../..');
const DIRECTORIO = 'apps/rag-orchestrator';
const AVISO_SIN_RUFF =
  'ruff no encontrado: pip install -r apps/rag-orchestrator/requirements-dev.txt';

/** Ejecuta `ruff format` sobre rag-orchestrator y devuelve su código de salida. */
export function formatearPython({ soloVerificar }) {
  const argumentos = ['format', ...(soloVerificar ? ['--check'] : []), DIRECTORIO];
  const resultado = spawnSync('ruff', argumentos, { cwd: RAIZ, stdio: 'inherit' });

  if (resultado.error?.code === 'ENOENT') {
    console.error(AVISO_SIN_RUFF);
    return 1;
  }
  return resultado.status ?? 1;
}

if (import.meta.main) {
  process.exit(formatearPython({ soloVerificar: process.argv.includes('--check') }));
}
