import type { z } from 'zod';
import { zEvidenceAnalysisRequest } from '../../../../../packages/api-contracts/src/zod/clinical-api/zod.gen.js';
import { esquemaPreguntaNormalizada } from '../../../../../packages/clinical-language/src/normalizar-pregunta.js';

/**
 * Cuerpo de `POST /platform/evidence-analyses`: el schema se genera del spec (longitud de la pregunta y al menos una
 * fuente en `true`). La validación de dominio que el spec no expresa es la normalización de la pregunta (US-250): NFC y
 * espacios colapsados ANTES de medir la longitud, de desidentificar, de persistir y de enviar a rag-orchestrator.
 * Los límites (`minLength`/`maxLength`) siguen saliendo del generado.
 */
export const evidenceAnalysisRequestSchema = zEvidenceAnalysisRequest.extend({
  query: esquemaPreguntaNormalizada(zEvidenceAnalysisRequest.shape.query),
});

export type PeticionDeAnalisis = z.output<typeof evidenceAnalysisRequestSchema>;
