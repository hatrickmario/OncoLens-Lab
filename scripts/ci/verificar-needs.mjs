#!/usr/bin/env node
/**
 * Agregador `ci-ok` (US-036 AC-1, design.md D1): lee el JSON de `needs` (variable NEEDS, `toJSON(needs)`) y sale con 1 si
 * algún job no terminó en `success` —fallido, cancelado u omitido—, nombrándolo. Sin jobs, tampoco es verde.
 */
import { pathToFileURL } from 'node:url';

/** Jobs que no terminaron en success, con su resultado. */
export function jobsSinExito(needs) {
  return Object.entries(needs)
    .filter(([, job]) => job.result !== 'success')
    .map(([nombre, job]) => ({ nombre, resultado: job.result }));
}

function main() {
  const needs = JSON.parse(process.env.NEEDS ?? '{}');
  if (Object.keys(needs).length === 0) {
    console.error('ci-ok — no recibió ningún job en needs');
    return 1;
  }
  const fallidos = jobsSinExito(needs);
  fallidos.forEach(({ nombre, resultado }) => console.error(`ci-ok — el job ${nombre} terminó en ${resultado}`));
  if (fallidos.length === 0) console.log(`ci-ok — todos los jobs terminaron en success: ${Object.keys(needs).join(', ')}`);
  return fallidos.length === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
