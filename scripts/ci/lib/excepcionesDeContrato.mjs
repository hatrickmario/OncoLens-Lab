/**
 * Excepciones declaradas a `oasdiff breaking` (ADR-26). Cada una nombra UN hallazgo exacto: proveedor, regla, operación,
 * ruta y texto. Lo que no coincide en todos los campos sigue rompiendo la CI.
 */

/** Hallazgos de nivel ERR de `oasdiff breaking --format json` (level 3) que no están declarados como excepción. */
export function errNoDeclarados(proveedor, hallazgos, excepciones) {
  throw new Error('no implementado');
}
