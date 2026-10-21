import { describe, expect, it } from 'vitest';
import conEvidencia from '../../../../../contracts/examples/rag-query-con-evidencia.json' with { type: 'json' };
import peticion from '../../../../../contracts/examples/rag-query-request.json' with { type: 'json' };
import { crearBaseDelAnalisis } from '../../../src/modules/evidence-analysis/analysis-basis.js';
import { validarRespuestaInterna } from '../../../src/modules/evidence-analysis/analysis-completion.js';
import type { RagQueryInternalRequest } from '../../../../../packages/api-contracts/src/client/rag-orchestrator/index.js';

const request = peticion as RagQueryInternalRequest;

describe('BaseDelAnalisis', () => {
  it('produce la misma Base byte a byte cuando se ejecuta dos veces con las mismas entradas [US-066 AC-4]', () => {
    const base = crearBaseDelAnalisis();
    const respuesta = validarRespuestaInterna(conEvidencia);

    const primera = base.construir(request, respuesta, false);
    const segunda = base.construir(structuredClone(request), structuredClone(respuesta), false);

    expect(primera.patientDataUsed.length).toBeGreaterThan(0);
    expect(JSON.stringify(segunda)).toBe(JSON.stringify(primera));
  });
});
