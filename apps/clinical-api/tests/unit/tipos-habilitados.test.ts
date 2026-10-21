import { describe, expect, it } from 'vitest';
import {
  ConfiguracionInvalidaError,
  readAlcanceDelAnalisisConfig,
  validarTiposHabilitados,
} from '../../src/config/index.js';
import { crearTiposHabilitados } from '../../src/modules/evidence-analysis/tipos-habilitados.js';

const ENV_VALIDO = {
  ENABLED_CANCER_TYPES: 'mama, prostata',
  CORPUS_EXCLUDED_SOURCES: 'NCCN,ESMO',
  CORPUS_CUTOFF_DATE: '2026-09-30',
};

describe('readAlcanceDelAnalisisConfig', () => {
  it('lee los tipos habilitados sin espacios ni repetidos, las fuentes excluidas y la fecha de corte', () => {
    expect(
      readAlcanceDelAnalisisConfig({ ...ENV_VALIDO, ENABLED_CANCER_TYPES: 'mama, prostata,mama' }),
    ).toEqual({
      enabledCancerTypes: ['mama', 'prostata'],
      corpusExcludedSources: ['NCCN', 'ESMO'],
      corpusCutoffDate: '2026-09-30',
    });
  });

  it.each([
    ['ENABLED_CANCER_TYPES', undefined],
    ['ENABLED_CANCER_TYPES', ' , '],
    ['CORPUS_CUTOFF_DATE', undefined],
    ['CORPUS_CUTOFF_DATE', '30/09/2026'],
    ['CORPUS_CUTOFF_DATE', '2026-13-01'],
    ['CORPUS_EXCLUDED_SOURCES', undefined],
    ['CORPUS_EXCLUDED_SOURCES', 'NCCN,<script>'],
    ['CORPUS_EXCLUDED_SOURCES', 'NCCN'],
    ['CORPUS_EXCLUDED_SOURCES', 'ESMO,OtraFuente'],
  ])('lanza ConfiguracionInvalidaError que nombra %s cuando vale %j', (variable, valor) => {
    const env: NodeJS.ProcessEnv = { ...ENV_VALIDO, [variable]: valor };

    expect(() => readAlcanceDelAnalisisConfig(env)).toThrow(
      expect.objectContaining({ name: 'ConfiguracionInvalidaError', variable }),
    );
  });
});

describe('readAlcanceDelAnalisisConfig: piso de fuentes excluidas (RN-21)', () => {
  it('acepta NCCN y ESMO en cualquier orden y mayúsculas, con fuentes adicionales', () => {
    const config = readAlcanceDelAnalisisConfig({
      ...ENV_VALIDO,
      CORPUS_EXCLUDED_SOURCES: 'esmo, Otra Fuente ,nccn',
    });

    expect(config.corpusExcludedSources).toEqual(['esmo', 'Otra Fuente', 'nccn']);
  });
});

describe('validarTiposHabilitados', () => {
  it('devuelve la lista cuando todos los tipos están en el catálogo', () => {
    expect(validarTiposHabilitados(['mama'], ['mama', 'prostata'])).toEqual(['mama']);
  });

  it('lanza tipo_no_en_catalogo con el tipo en valorInvalido cuando uno no está en el catálogo', () => {
    let error: unknown;
    try {
      validarTiposHabilitados(['mama', 'leucemia'], ['mama', 'prostata']);
    } catch (capturado) {
      error = capturado;
    }

    expect(error).toBeInstanceOf(ConfiguracionInvalidaError);
    expect(error).toMatchObject({
      variable: 'ENABLED_CANCER_TYPES',
      motivo: 'tipo_no_en_catalogo',
      valorInvalido: 'leucemia',
    });
  });
});

describe('crearTiposHabilitados', () => {
  it('informa true para mama y próstata cuando ambos están habilitados [US-043 AC-1]', () => {
    const tipos = crearTiposHabilitados(['mama', 'prostata']);

    expect(tipos.estaHabilitado('mama')).toBe(true);
    expect(tipos.estaHabilitado('prostata')).toBe(true);
  });

  it('informa false para próstata cuando solo mama está habilitada [US-043 AC-3]', () => {
    const tipos = crearTiposHabilitados(['mama']);

    expect(tipos.estaHabilitado('prostata')).toBe(false);
  });
});
