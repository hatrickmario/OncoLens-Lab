import { describe, expect, it } from 'vitest';
import { idSembrado } from '../../../prisma/seed/determinismo.js';
import {
  BaseNoSinteticaError,
  exigirBaseDeTestSintetica,
} from '../../../src/evaluacion/chat/guarda-de-base.js';

const base = (...rows: { id: string; data_origin: string }[]) => ({
  consultar: () => Promise.resolve({ rows }),
});

describe('exigirBaseDeTestSintetica', () => {
  it('no lanza cuando todos los pacientes son sintéticos y del seed', async () => {
    await expect(
      exigirBaseDeTestSintetica(
        base(
          { id: idSembrado('paciente-a'), data_origin: 'sintetico' },
          { id: idSembrado('paciente-chat'), data_origin: 'sintetico' },
        ),
      ),
    ).resolves.toBeUndefined();
  });

  it('lanza cuando la base no tiene pacientes', async () => {
    await expect(exigirBaseDeTestSintetica(base())).rejects.toThrow(BaseNoSinteticaError);
  });

  it('lanza sin nombrar el id cuando un paciente no es del seed', async () => {
    const ajeno = '11111111-1111-4111-8111-111111111111';

    const falla = exigirBaseDeTestSintetica(base({ id: ajeno, data_origin: 'sintetico' }));

    await expect(falla).rejects.toThrow('no es del seed sintético');
    await expect(falla).rejects.not.toThrow(ajeno);
  });

  it('lanza cuando un paciente del seed figura con un origen que no es sintético', async () => {
    await expect(
      exigirBaseDeTestSintetica(
        base({ id: idSembrado('paciente-a'), data_origin: 'real_anonimizado' }),
      ),
    ).rejects.toThrow('no es sintético');
  });
});
