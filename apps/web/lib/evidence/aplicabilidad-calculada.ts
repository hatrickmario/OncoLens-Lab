import type { EvidenceOption } from '../../../../packages/api-contracts/src/types/clinical-api';

/**
 * Una opción trae aplicabilidad calculada solo si alguna fuente citada aportó población (`perSource` no
 * vacío). Con `perSource = []` el resumen en ceros significa "no evaluada", no "0 criterios" (RN-28).
 */
export function tieneAplicabilidadCalculada(opcion: Pick<EvidenceOption, 'perSource'>): boolean {
  return opcion.perSource.length > 0;
}
