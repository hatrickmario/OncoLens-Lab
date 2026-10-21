/**
 * Helper de verificación del proveedor [S1 resp. 17]: valida el cuerpo de una respuesta contra el spec
 * empaquetado (`bundleSpecs()`), con la misma configuración de Ajv2020 que `contracts:check`.
 * Lo usan los tests de integración hasta que exista `contracts:verify-provider` (US-214).
 */
import { loadBundledSpecs } from './bundledSpecs.mjs';
import { createExampleValidator } from './validator.mjs';

let validator;

/**
 * @param {string} provider `clinical-api` o `rag-orchestrator`
 * @param {string} pointer `#/components/schemas/<Nombre>` o `#/paths/<ruta>/<método>/responses/<código>`
 * @param {unknown} body cuerpo ya parseado
 * @returns {{ path: string, message: string }[]} vacío si el cuerpo cumple el spec
 */
export function matchesSpec(provider, pointer, body) {
  validator ??= createExampleValidator(loadBundledSpecs());
  const verdict = validator.validate({ spec: provider, target: pointer }, body);
  if (verdict.error) throw new Error(verdict.error);
  return verdict.problems;
}

/** Lanza un error que nombra cada campo incumplido si el cuerpo no cumple el spec. */
export function assertMatchesSpec(provider, pointer, body) {
  const problems = matchesSpec(provider, pointer, body);
  if (problems.length > 0) {
    throw new Error(`la respuesta no cumple ${provider}${pointer}:\n${problems.map((item) => `  ${item.path}: ${item.message}`).join('\n')}`);
  }
}
