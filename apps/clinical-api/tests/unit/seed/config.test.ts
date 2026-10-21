import { describe, expect, it } from 'vitest';
import { leerConfiguracionDelSeed } from '../../../prisma/seed/config.js';
import { ConfiguracionInvalidaError } from '../../../src/config/index.js';

describe('leerConfiguracionDelSeed', () => {
  it('usa local y test como entornos permitidos y 10 y 20 años de retención cuando no hay variables', () => {
    const config = leerConfiguracionDelSeed({});

    expect(config.appEnv).toBeUndefined();
    expect(config.entornosPermitidos).toEqual(['local', 'test']);
    expect(config.anosHastaRetencion).toBe(10);
    expect(config.anosHastaRetencionMaxima).toBe(20);
    expect(config.realAnonymizedEnabled).toBe(false);
    expect(config.realIdentifiedEnabled).toBe(false);
  });

  it('lee APP_ENV y recorta los espacios de SEED_ALLOWED_ENVS', () => {
    const config = leerConfiguracionDelSeed({
      APP_ENV: 'test',
      SEED_ALLOWED_ENVS: ' local , staging ',
    });

    expect(config.appEnv).toBe('test');
    expect(config.entornosPermitidos).toEqual(['local', 'staging']);
  });

  it('acepta true y false en las dos banderas REAL_* y trata la ausencia o el vacío como false', () => {
    const anonimizado = (valor: string | undefined) =>
      leerConfiguracionDelSeed({ REAL_ANONYMIZED_ENABLED: valor }).realAnonymizedEnabled;
    const identificado = (valor: string | undefined) =>
      leerConfiguracionDelSeed({ REAL_IDENTIFIED_ENABLED: valor }).realIdentifiedEnabled;

    expect([
      anonimizado('true'),
      anonimizado('false'),
      anonimizado(undefined),
      anonimizado(''),
    ]).toEqual([true, false, false, false]);
    expect([
      identificado('true'),
      identificado('false'),
      identificado(undefined),
      identificado(''),
    ]).toEqual([true, false, false, false]);
  });

  it.each([
    ['REAL_ANONYMIZED_ENABLED', 'TRUE'],
    ['REAL_ANONYMIZED_ENABLED', '1'],
    ['REAL_IDENTIFIED_ENABLED', 'yes'],
    ['REAL_IDENTIFIED_ENABLED', 'si'],
  ])(
    'falla cerrado con ConfiguracionInvalidaError nombrando %s cuando vale %s',
    (variable, valor) => {
      const leer = () => leerConfiguracionDelSeed({ [variable]: valor });

      expect(leer).toThrow(ConfiguracionInvalidaError);
      expect(leer).toThrow(`${variable} debe ser true o false`);
    },
  );

  it('falla nombrando SEED_REFERENCE_DATE cuando la fecha no es AAAA-MM-DD válida', () => {
    const leer = () => leerConfiguracionDelSeed({ SEED_REFERENCE_DATE: '2026-13-45' });

    expect(leer).toThrow('SEED_REFERENCE_DATE debe ser una fecha AAAA-MM-DD');
  });

  it('falla nombrando SEED_RETENTION_UNTIL_YEARS cuando no es un entero positivo', () => {
    expect(() => leerConfiguracionDelSeed({ SEED_RETENTION_UNTIL_YEARS: 'diez' })).toThrow(
      'SEED_RETENTION_UNTIL_YEARS debe ser un entero positivo',
    );
  });

  it.each(['   ', '0'])(
    'falla nombrando SEED_RETENTION_UNTIL_YEARS cuando vale %j y no es un entero positivo',
    (valor) => {
      expect(() => leerConfiguracionDelSeed({ SEED_RETENTION_UNTIL_YEARS: valor })).toThrow(
        'SEED_RETENTION_UNTIL_YEARS debe ser un entero positivo',
      );
    },
  );
});
