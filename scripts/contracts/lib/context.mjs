/** Contexto que reciben las reglas: specs (crudos y empaquetados), ejemplos y documentos. Sin E/S. */
import { bundleOrFail } from './bundle.mjs';
import { EVIDENCE, PROVIDERS } from './specs.mjs';

/**
 * @typedef {{ file: string, raw: any | null, error?: string }} SpecInput
 * @typedef {SpecInput & { bundled: any | null, externalRefs?: { pointer: string, ref: string }[] }} SpecEntry
 */

/**
 * Añade a cada spec su versión empaquetada en memoria (los schemas compartidos ya definidos en su
 * `components.schemas`); el archivo compartido se empaqueta a sí mismo. Si queda una `$ref` externa sin
 * empaquetar, el spec no tiene versión empaquetada: lleva el error y las `$ref` (las reporta
 * assertSharedSchemasSingleOrigin).
 * @param {{ [name: string]: SpecInput }} specs
 * @returns {{ [name: string]: SpecEntry }}
 */
export function bundleSpecs(specs) {
  const evidence = specs[EVIDENCE];
  const bundled = { [EVIDENCE]: { ...evidence, bundled: evidence.raw } };
  for (const name of PROVIDERS) {
    const { bundled: spec, error, externalRefs } = bundleOrFail(specs[name].raw, evidence.raw);
    bundled[name] = { ...specs[name], bundled: spec, externalRefs, ...(error ? { error } : {}) };
  }
  return bundled;
}

/**
 * Contexto de las reglas.
 * @param {{ specs: { [name: string]: SpecInput }, examples: any, docs: any }} parts
 */
export function buildContext({ specs, examples, docs }) {
  return { specs: bundleSpecs(specs), examples, docs };
}
