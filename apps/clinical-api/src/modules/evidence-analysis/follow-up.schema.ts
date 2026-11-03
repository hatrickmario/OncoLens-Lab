import type { z } from 'zod';
import { zFollowUpCreate } from '../../../../../packages/api-contracts/src/zod/clinical-api/zod.gen.js';

/** Cuerpo de `POST /platform/evidence-analyses/{analysisId}/follow-ups`: el schema se genera del spec. */
export const followUpCreateSchema = zFollowUpCreate;

export type PeticionDeSeguimiento = z.output<typeof followUpCreateSchema>;
