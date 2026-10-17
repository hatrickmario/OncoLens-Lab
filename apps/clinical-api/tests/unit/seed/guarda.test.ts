import { describe, expect, it } from 'vitest';
import {
  assertSeedPermitido,
  SeedBloqueadoError,
  type EntradaDeLaGuarda,
} from '../../../prisma/seed/guarda.js';

function entrada(resto: Partial<EntradaDeLaGuarda> = {}): EntradaDeLaGuarda {
  return {
    appEnv: 'local',
    entornosPermitidos: ['local', 'test'],
    realAnonymizedEnabled: false,
    realIdentifiedEnabled: false,
    ...resto,
  };
}

describe('assertSeedPermitido', () => {
  it('permite el seed cuando el entorno es local', () => {
    expect(() => assertSeedPermitido(entrada())).not.toThrow();
  });

  it('rechaza el seed nombrando piloto cuando APP_ENV es piloto', () => {
    expect(() => assertSeedPermitido(entrada({ appEnv: 'piloto' }))).toThrow(/piloto/);
  });

  it('rechaza piloto aunque alguien lo añada a los entornos permitidos', () => {
    const config = entrada({ appEnv: 'piloto', entornosPermitidos: ['local', 'piloto'] });

    expect(() => assertSeedPermitido(config)).toThrow(SeedBloqueadoError);
  });

  it('rechaza el seed nombrando APP_ENV cuando no está definida', () => {
    expect(() => assertSeedPermitido(entrada({ appEnv: undefined }))).toThrow(/APP_ENV/);
  });

  it('rechaza el seed cuando el entorno no está en la lista de permitidos', () => {
    expect(() => assertSeedPermitido(entrada({ appEnv: 'staging' }))).toThrow(
      /SEED_ALLOWED_ENVS/,
    );
  });

  it('rechaza el seed nombrando REAL_ANONYMIZED_ENABLED aunque el entorno sea local', () => {
    expect(() => assertSeedPermitido(entrada({ realAnonymizedEnabled: true }))).toThrow(
      /REAL_ANONYMIZED_ENABLED/,
    );
  });

  it('rechaza el seed nombrando REAL_IDENTIFIED_ENABLED aunque el entorno sea test', () => {
    const config = entrada({ appEnv: 'test', realIdentifiedEnabled: true });

    expect(() => assertSeedPermitido(config)).toThrow(/REAL_IDENTIFIED_ENABLED/);
  });
});
