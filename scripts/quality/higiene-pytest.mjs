// Higiene de los tests de Python (L1D-285, US-213 AC-8, design D2): ejecuta `check-pytest-hygiene.py` (AST) y vuelca cada
// desactivación al hallazgo común del reporte. Error, no alerta: ningún test se desactiva para pasar la suite.
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { hallazgo } from './normalizar.mjs';

const SCRIPT = path.join(import.meta.dirname, 'check-pytest-hygiene.py');

/** JSON del script → hallazgos `tests-sin-desactivar`; función pura. */
export function desdeHigieneDePytest(informe) {
  return informe.map(({ file, line, rule, symbol }) =>
    hallazgo({ tool: 'check-pytest-hygiene', rule, file, line, symbol, severity: 'error' }),
  );
}

/**
 * Revisa `directorioDeTests` (relativo a `raiz`). Una herramienta rota (intérprete ausente, sintaxis inválida) falla en vez
 * de dar "sin hallazgos".
 */
export function verificarHigieneDePytest(raiz, directorioDeTests) {
  const resultado = spawnSync(process.env.PYTHON ?? 'python3', ['-I', SCRIPT, directorioDeTests], {
    cwd: raiz,
    encoding: 'utf8',
    timeout: 60_000,
  });
  if (resultado.error || resultado.status !== 0) {
    throw new Error(
      `check-pytest-hygiene no se pudo ejecutar: ${resultado.error?.message ?? resultado.stderr}`,
    );
  }
  return desdeHigieneDePytest(JSON.parse(resultado.stdout));
}
