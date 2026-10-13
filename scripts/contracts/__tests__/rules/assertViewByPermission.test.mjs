import { describe, expect, it } from 'vitest';
import { assertViewByPermission } from '../../rules/assertViewByPermission.mjs';
import { patchedContracts, realContracts } from '../helpers/parches.mjs';

const mensajesTrasParchar = async (operaciones) => {
  const mutated = patchedContracts(await realContracts(), [{ destino: 'clinical-api', operaciones }]);
  return assertViewByPermission(mutated.specs, mutated.examples, mutated.docs).map((item) => item.message);
};

describe('assertViewByPermission · identidad enmascarada en el listado (D-7, resp. 36)', () => {
  it('reporta identification cuando la vista del listado la trae en claro [US-033 AC-17]', async () => {
    const mensajes = await mensajesTrasParchar([{ op: 'add', path: '/components/schemas/PatientListItem/properties/identification', value: { type: 'object' } }]);
    expect(mensajes).toContain('la vista PatientListItem del listado no puede tener identification: nombre y documento van enmascarados');
  });
});
