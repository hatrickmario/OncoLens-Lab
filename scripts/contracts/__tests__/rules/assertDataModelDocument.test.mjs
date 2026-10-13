import { describe, expect, it } from 'vitest';
import { assertDataModelDocument } from '../../rules/assertDataModelDocument.mjs';
import { patchedContracts, realContracts } from '../helpers/parches.mjs';

describe('assertDataModelDocument', () => {
  it('reporta la falta de los atributos del rol cuando el modelo no declara ALTER ROLE rag_corpus NOSUPERUSER [US-033 AC-18]', async () => {
    const mutated = patchedContracts(await realContracts(), [{ destino: 'doc:data-model', operaciones: [{ op: 'text-delete-line', contiene: 'NOSUPERUSER' }] }]);
    const findings = assertDataModelDocument(mutated.specs, mutated.examples, mutated.docs);
    expect(findings.map((item) => item.message)).toContain('falta ALTER ROLE rag_corpus NOSUPERUSER … CONNECTION LIMIT (atributos del rol)');
  });
});
