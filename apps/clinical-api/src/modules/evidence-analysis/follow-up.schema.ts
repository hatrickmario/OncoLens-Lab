import type { z } from 'zod';
import { zFollowUpCreate } from '../../../../../packages/api-contracts/src/zod/clinical-api/zod.gen.js';
import { esquemaPreguntaNormalizada } from '../../../../../packages/clinical-language/src/normalizar-pregunta.js';

/**
 * Cuerpo de `POST /platform/evidence-analyses/{analysisId}/follow-ups`: el schema se genera del spec (longitud de la
 * pregunta). La validación de dominio que el spec no expresa es la misma regla de US-250 que usa el análisis: NFC y
 * espacios colapsados ANTES de medir la longitud, de desidentificar, de persistir y de enviar a rag-orchestrator. Los
 * límites (`minLength`/`maxLength`) siguen saliendo del generado.
 */
export const followUpCreateSchema = zFollowUpCreate.extend({
  question: esquemaPreguntaNormalizada(zFollowUpCreate.shape.question),
});

export type PeticionDeSeguimiento = z.output<typeof followUpCreateSchema>;
