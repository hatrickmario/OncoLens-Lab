import type { PatientSummary } from '../../../../packages/api-contracts/src/types/clinical-api';

/**
 * Valores mostrados (diagnóstico, gradaciones y biomarcadores recientes) con `reviewStatus = auto_aceptado`.
 * Informa, no bloquea (RN-26); `requiere_revision` lo cuenta el servidor en `pendingReviewCount`.
 */
export function contarSinVerificar(
  ficha: Pick<PatientSummary, 'diagnosis' | 'recentBiomarkers'>,
): number {
  const { diagnosis, recentBiomarkers } = ficha;
  const procedencias = [
    ...(diagnosis ? [diagnosis.provenance, ...diagnosis.gradings.map((g) => g.provenance)] : []),
    ...recentBiomarkers.map((b) => b.provenance),
  ];
  return procedencias.filter((p) => p.reviewStatus === 'auto_aceptado').length;
}
