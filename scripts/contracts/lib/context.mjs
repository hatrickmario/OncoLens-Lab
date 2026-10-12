/** Contexto que reciben las reglas: specs (crudos y empaquetados), ejemplos y documentos. Sin E/S. */
import { bundleSpec } from './bundle.mjs';
import { EVIDENCE, PROVIDERS } from './specs.mjs';

/**
 * @typedef {{ file: string, raw: any | null, error?: string }} SpecInput
 * @typedef {SpecInput & { bundled: any | null }} SpecEntry
 */

/**
 * Añade a cada spec su versión empaquetada en memoria (los schemas compartidos ya definidos en su
 * `components.schemas`); el archivo compartido se empaqueta a sí mismo.
 * @param {{ [name: string]: SpecInput }} specs
 * @returns {{ [name: string]: SpecEntry }}
 */
export function bundleSpecs(specs) {
  const evidence = specs[EVIDENCE];
  const bundled = { [EVIDENCE]: { ...evidence, bundled: evidence.raw } };
  for (const name of PROVIDERS) bundled[name] = { ...specs[name], bundled: bundleSpec(specs[name].raw, evidence.raw) };
  return bundled;
}

/**
 * Contexto de las reglas.
 * @param {{ specs: { [name: string]: SpecInput }, examples: any, docs: any }} parts
 */
export function buildContext({ specs, examples, docs }) {
  return { specs: bundleSpecs(specs), examples, docs };
}
