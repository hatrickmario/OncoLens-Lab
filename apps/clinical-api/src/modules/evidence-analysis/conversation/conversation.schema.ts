import type { z } from 'zod';
import { zConversationTurnCreate } from '../../../../../../packages/api-contracts/src/zod/clinical-api/zod.gen.js';
import { esquemaPreguntaNormalizada } from '../../../../../../packages/clinical-language/src/normalizar-pregunta.js';

/**
 * Cuerpo de `POST /platform/conversations/{conversationId}/turns`: el schema se genera del spec. La regla de dominio
 * que el spec no expresa es la de US-250 (NFC y espacios colapsados ANTES de medir, enmascarar, persistir y enviar).
 */
export const conversationTurnCreateSchema = zConversationTurnCreate.extend({
  question: esquemaPreguntaNormalizada(zConversationTurnCreate.shape.question),
});

export type PeticionDeTurno = z.output<typeof conversationTurnCreateSchema>;
