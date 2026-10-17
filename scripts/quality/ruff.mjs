// Formato de Python con Ruff (L1D-265, design D3). `--check` solo verifica.
// Falla cerrado: sin `ruff` en el PATH no omite el formato en silencio.
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const RAIZ = path.resolve(import.meta.dirname, '../..');
const DIRECTORIO = 'apps/rag-orchestrator';
const soloVerificar = process.argv.includes('--check');

// Ruff descubre apps/rag-orchestrator/pyproject.toml; `--config` explícito resolvería `extend-exclude` desde la raíz.
const resultado = spawnSync('ruff', ['format', ...(soloVerificar ? ['--check'] : []), DIRECTORIO], {
  cwd: RAIZ,
  stdio: 'inherit',
});

if (resultado.error?.code === 'ENOENT') {
  console.error('ruff no encontrado: pip install -r apps/rag-orchestrator/requirements-dev.txt');
  process.exit(1);
}
process.exit(resultado.status ?? 1);
