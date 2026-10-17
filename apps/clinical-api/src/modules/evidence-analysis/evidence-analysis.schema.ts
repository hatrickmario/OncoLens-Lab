import type { z } from 'zod';
import { zEvidenceAnalysisRequest } from '../../../../../packages/api-contracts/src/zod/clinical-api/zod.gen.js';

/**
 * Cuerpo de `POST /platform/evidence-analyses`: el schema se genera del spec (longitud de la pregunta y al menos una
 * fuente en `true`). El spec no expresa más validaciones de dominio para el borde.
 */
export const evidenceAnalysisRequestSchema = zEvidenceAnalysisRequest;

export type PeticionDeAnalisis = z.output<typeof evidenceAnalysisRequestSchema>;
