// Sincroniza los umbrales de Ruff de rag-orchestrator con quality-thresholds.json (L1D-263, tarea 2.2, RN-22).
// Sin argumentos reescribe apps/rag-orchestrator/pyproject.toml; con `--check` solo verifica (lo usa la CI).
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { leerUmbrales } from './umbrales.mjs';

const RAIZ = path.resolve(import.meta.dirname, '../..');
const RUTA_PYPROJECT = path.join(RAIZ, 'apps/rag-orchestrator/pyproject.toml');
const INICIO = '# >>> umbrales generados desde quality-thresholds.json (no editar: node scripts/quality/sync-ruff-thresholds.mjs)';
const FIN = '# <<< umbrales generados';
const BLOQUE_EXISTENTE = new RegExp(`${escapar(INICIO)}[\\s\\S]*?${escapar(FIN)}\\n?`);

function escapar(texto) {
  return texto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function generarBloque({ c901MaxComplexity, plr0915MaxStatements }) {
  return [
    INICIO,
    '[tool.ruff.lint.mccabe]',
    `max-complexity = ${c901MaxComplexity}`,
    '',
    '[tool.ruff.lint.pylint]',
    `max-statements = ${plr0915MaxStatements}`,
    FIN,
    '',
  ].join('\n');
}

/** Devuelve el pyproject con el bloque de umbrales generado desde `umbrales`. Pura: sin E/S. */
export function sincronizarPyproject(texto, umbrales) {
  const bloque = generarBloque(umbrales);
  if (BLOQUE_EXISTENTE.test(texto)) return texto.replace(BLOQUE_EXISTENTE, bloque);
  return `${texto.replace(/\n*$/, '\n')}\n${bloque}`;
}

/** `true` si el pyproject ya contiene exactamente el bloque que generarían `umbrales`. */
export function estaSincronizado(texto, umbrales) {
  return sincronizarPyproject(texto, umbrales) === texto;
}

function principal() {
  const umbrales = leerUmbrales();
  const actual = readFileSync(RUTA_PYPROJECT, 'utf8');
  if (process.argv.includes('--check')) {
    if (estaSincronizado(actual, umbrales)) {
      console.log('pyproject.toml de rag-orchestrator sincronizado con quality-thresholds.json');
      return;
    }
    console.error(
      'pyproject.toml de rag-orchestrator desincronizado con quality-thresholds.json: ejecuta node scripts/quality/sync-ruff-thresholds.mjs',
    );
    process.exit(1);
  }
  writeFileSync(RUTA_PYPROJECT, sincronizarPyproject(actual, umbrales));
  console.log('pyproject.toml de rag-orchestrator sincronizado con quality-thresholds.json');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    principal();
  } catch (error) {
    console.error(`sync-ruff-thresholds: ${error.message}`);
    process.exit(1);
  }
}
