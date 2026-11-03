#!/usr/bin/env node
/**
 * Agregador `ci-ok` (US-036 AC-1, design.md D1): lee el JSON de `needs` (variable NEEDS, `toJSON(needs)`) y sale con 1 si
 * algún job no terminó en `success` —fallido, cancelado u omitido—, nombrándolo. Sin jobs, tampoco es verde.
 * Única excepción (ARR-11, D-12.1): un `skipped` que el job `cambios` declaró en `omitibles` (solo si `cambios` fue success).
 */
import { pathToFileURL } from 'node:url';

/**
 * Jobs que el detector `cambios` declaró omitibles (`needs.cambios.outputs.omitibles`, ARR-11 D-12.1). Solo valen si
 * `cambios` terminó en `success`; una lista ilegible (no es un JSON de lista de cadenas) cuenta como vacía.
 */
export function omitiblesDeclarados(needs) {
  if (needs.cambios?.result !== 'success') return [];
  try {
    const lista = JSON.parse(needs.cambios.outputs?.omitibles);
    return Array.isArray(lista) && lista.every((nombre) => typeof nombre === 'string') ? lista : [];
  } catch {
    return [];
  }
}

/** Jobs que no terminaron en success, con su resultado. Un `skipped` declarado por el detector no cuenta como fallo. */
export function jobsSinExito(needs) {
  const omitibles = omitiblesDeclarados(needs);
  return Object.entries(needs)
    .filter(([nombre, job]) => job.result !== 'success' && !(job.result === 'skipped' && omitibles.includes(nombre)))
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
  if (fallidos.length === 0) {
    const omitidos = Object.keys(needs).filter((nombre) => needs[nombre].result === 'skipped');
    omitidos.forEach((nombre) => console.log(`ci-ok — el job ${nombre} se omitió por el detector de cambios (PR de documentación)`));
    console.log(`ci-ok — todos los jobs terminaron en success u omitidos por el detector: ${Object.keys(needs).join(', ')}`);
  }
  return fallidos.length === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
