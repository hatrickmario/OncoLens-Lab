import type { DataClassification } from '../../../../../packages/api-contracts/src/client/rag-orchestrator/index.js';

/** Proveedor del LLM que declara Backend 2 (`meta.llmProvider`, `llmProvider` del chat). */
export type ProveedorDelLlm = 'local' | 'nube';

/**
 * RN-12, OL-03: la clasificación de todo request interno hacia `rag-orchestrator` (`/rag/query`, `/chat/turn`) sale de
 * `Patient.data_origin`; nunca del body público ni de la sesión. Único dueño de esta decisión en `clinical-api`.
 */
export function clasificacionDelPaciente(paciente: {
  dataOrigin: DataClassification;
}): DataClassification {
  return paciente.dataOrigin;
}

/**
 * RN-12: con datos reales solo `local`; la nube solo con datos sintéticos. Falla cerrado: un proveedor que no sea
 * `local` ni `nube` nunca se acepta.
 */
export function proveedorPermitido(
  clasificacion: DataClassification,
  proveedor: ProveedorDelLlm,
): boolean {
  if (proveedor === 'local') return true;
  return proveedor === 'nube' && clasificacion === 'sintetico';
}
