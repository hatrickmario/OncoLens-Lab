import type { EvidenceAnalysis } from '../../../../packages/api-contracts/src/types/clinical-api';

/** Estado del análisis tal como lo declara el contrato; única fuente de la unión en `web`. */
export type EstadoDelAnalisis = EvidenceAnalysis['status'];
