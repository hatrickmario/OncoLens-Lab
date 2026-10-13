import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ROOT } from './helpers/parches.mjs';
import { zCaseSummaryInternalResponse } from '../../../packages/api-contracts/src/zod/rag-orchestrator/zod.gen.ts';

const ejemplo = (archivo) => JSON.parse(readFileSync(path.join(ROOT, 'contracts/examples', archivo), 'utf8'));

describe('Zod generado · objetos estrictos (D-4, resp. 33)', () => {
  it('rechaza una propiedad desconocida en meta cuando el schema es cerrado [US-033 AC-16]', () => {
    const respuesta = ejemplo('case-summary-response.json');
    expect(zCaseSummaryInternalResponse.safeParse(respuesta).success).toBe(true);
    const conPropiedadExtra = { ...respuesta, meta: { ...respuesta.meta, propiedadDesconocida: 1 } };
    expect(zCaseSummaryInternalResponse.safeParse(conPropiedadExtra).success).toBe(false);
  });
});
