#!/usr/bin/env node
/**
 * `npm run contracts:generate:check`: regenera y falla si lo generado difiere de lo versionado (edición a mano) o si
 * queda un archivo nuevo sin versionar en las rutas generadas.
 */
import { execFile } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { generate } from './generate.mjs';
import { GENERATED_ROOTS } from './generated.mjs';
import { DEFAULT_ROOT } from './lib/paths.mjs';

const git = promisify(execFile);

/** Archivos de las rutas generadas que difieren del índice o no están versionados. */
export async function changedGeneratedFiles(root) {
  const { stdout } = await git('git', ['-C', root, 'status', '--porcelain', '--', ...GENERATED_ROOTS]);
  return stdout.split('\n').filter(Boolean);
}

async function main() {
  const root = process.env.CONTRACTS_ROOT ?? DEFAULT_ROOT;
  await generate(root);
  const changed = await changedGeneratedFiles(root);
  if (changed.length === 0) {
    console.log('contracts:generate:check — lo generado está al día y versionado');
    return 0;
  }
  console.error('contracts:generate:check — lo generado difiere de lo versionado (¿edición a mano o spec sin regenerar?):');
  changed.forEach((line) => console.error(`  ${line}`));
  return 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = await main();
}
