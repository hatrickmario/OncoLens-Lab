import { describe, expect, it } from 'vitest';
import { assertFollowUpContract } from '../../rules/assertFollowUpContract.mjs';
import { patchedContracts, realContracts } from '../helpers/parches.mjs';

const mensajesTrasParchar = async (operaciones) => {
  const mutated = patchedContracts(await realContracts(), [{ destino: 'rag-orchestrator', operaciones }]);
  return assertFollowUpContract(mutated.specs, mutated.examples, mutated.docs).map((item) => item.message);
};

describe('assertFollowUpContract · meta (D-3, resp. 32)', () => {
  it('reporta CaseSummaryMeta sin catalogVersion cuando se quita del required [US-033 AC-13]', async () => {
    const mensajes = await mensajesTrasParchar([
      { op: 'test', path: '/components/schemas/CaseSummaryMeta/required/8', value: 'catalogVersion' },
      { op: 'remove', path: '/components/schemas/CaseSummaryMeta/required/8' },
    ]);
    expect(mensajes).toContain('CaseSummaryMeta debe exigir catalogVersion');
  });
});
