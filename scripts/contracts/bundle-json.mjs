#!/usr/bin/env node
/**
 * `node scripts/contracts/bundle-json.mjs <proveedor>`: imprime a stdout el spec empaquetado en JSON
 * (no escribe en el repositorio). Lo consume el fixture de sesión de Pytest de rag-orchestrator.
 */
import { prepararSpecsEmpaquetados } from './lib/bundledSpecs.mjs';
import { PROVIDERS } from './lib/specs.mjs';

const provider = process.argv[2];
if (!PROVIDERS.includes(provider)) {
  console.error(`uso: node scripts/contracts/bundle-json.mjs <${PROVIDERS.join('|')}>`);
  process.exit(2);
}
process.stdout.write(JSON.stringify((await prepararSpecsEmpaquetados())[provider].bundled));
