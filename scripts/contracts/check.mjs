#!/usr/bin/env node
/**
 * `npm run contracts:check`: lint OpenAPI 3.1 (Redocly), validación de ejemplos (Ajv) y reglas puras de US-033.
 * Una línea por hallazgo, `ARCHIVO:ruta — regla — AC/RN — mensaje`; código distinto de 0 si hay alguno.
 * La raíz del repositorio puede cambiarse con CONTRACTS_ROOT (los tests la apuntan a una copia temporal).
 */
import { pathToFileURL } from 'node:url';
import { lintSpecs, loadContext } from './io.mjs';
import { formatFinding } from './lib/findings.mjs';
import { DEFAULT_ROOT } from './lib/paths.mjs';
import { RULES, runRules } from './rules/index.mjs';

/** Hallazgos del lint y de las reglas sobre el repositorio de `root`. */
export async function check(root = DEFAULT_ROOT) {
  const context = await loadContext(root);
  return [...(await lintSpecs(root, context)), ...runRules(context)];
}

async function main() {
  const findings = await check(process.env.CONTRACTS_ROOT ?? DEFAULT_ROOT);
  if (findings.length === 0) {
    console.log(`contracts:check — sin hallazgos (${RULES.length} reglas)`);
    return 0;
  }
  for (const item of findings) console.error(formatFinding(item));
  console.error(`contracts:check — ${findings.length} hallazgo(s)`);
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
