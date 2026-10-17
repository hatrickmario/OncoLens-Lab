import { describe, expect, expectTypeOf, it } from 'vitest';
import type { LoginErrors } from '../../../../packages/api-contracts/src/client-web/clinical-api';
import { ESQUEMAS_DE_ERROR_DE_LOGIN } from '../../lib/server/auth-login';

describe('ESQUEMAS_DE_ERROR_DE_LOGIN', () => {
  it('cubre exactamente los status de error que el contrato declara para login', () => {
    // La comprobación fuerte es de tipos (tsc): un status nuevo en openapi.yaml rompe `satisfies`.
    expectTypeOf<keyof typeof ESQUEMAS_DE_ERROR_DE_LOGIN>().toEqualTypeOf<keyof LoginErrors>();
    expect(Object.keys(ESQUEMAS_DE_ERROR_DE_LOGIN).map(Number)).toEqual([401, 422, 429, 500]);
  });
});
