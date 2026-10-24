// Estilo de pytest con Ruff `PT` (L1D-285, US-213 AC-8, design D2): `npm run quality` lo ejecuta como ERROR. Los `--select`
// de `ejecutarRuff` (C901, PLR0915) pisan el `select` del pyproject, por eso `PT` se pide aparte. El `per-file-ignores` de
// `tests/**` (deuda de estilo) vive en `apps/rag-orchestrator/pyproject.toml`, que Ruff sigue leyendo con `--select`.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { desdeRuff } from './normalizar.mjs';

/** Hallazgos `PT*` de `directorio` (relativo a `raiz`) con la configuración de `configuracion`; una herramienta rota falla. */
export function verificarEstiloDePytest(raiz, directorio, configuracion) {
  const pyproject = path.resolve(raiz, configuracion);
  const resultado = spawnSync(
    'ruff',
    ['check', path.resolve(raiz, directorio), '--config', pyproject, '--select', 'PT', '--output-format', 'json'],
    // cwd = carpeta del pyproject: los `per-file-ignores` (`tests/**`) se resuelven contra él.
    { cwd: path.dirname(pyproject), encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 120_000 },
  );
  if (resultado.error?.code === 'ENOENT') {
    throw new Error('ruff no encontrado: ver docs/process/ci.md (job quality)');
  }
  if (resultado.status !== 0 && resultado.status !== 1) {
    throw new Error(`ruff (PT) terminó con estado ${resultado.status}: ${resultado.stderr}`);
  }
  return desdeRuff(JSON.parse(resultado.stdout || '[]'), raiz);
}
