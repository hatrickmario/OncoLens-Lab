import type { DataClassification } from '../../../../../packages/api-contracts/src/client/rag-orchestrator/index.js';

/** Proveedor del LLM que declara Backend 2 (`meta.llmProvider`, `llmProvider` del chat). */
export type ProveedorDelLlm = 'local' | 'nube';

export function clasificacionDelPaciente(_paciente: {
  dataOrigin: DataClassification;
}): DataClassification {
  throw new Error('no implementado');
}

export function proveedorPermitido(
  _clasificacion: DataClassification,
  _proveedor: ProveedorDelLlm,
): boolean {
  throw new Error('no implementado');
}
