import { describe, expect, it } from 'vitest';
import { exigirCatalogoValido } from '../../../src/infrastructure/catalogo/validar-catalogo.js';
import {
  RUTA_CATALOGO_TEST_1_0_0,
  RUTA_CATALOGO_TEST_1_1_0,
  leerTexto,
} from '../../support/completitud.js';

describe('catálogos FX-04-a de la completitud', () => {
  it.each([
    ['test-1.0.0', RUTA_CATALOGO_TEST_1_0_0],
    ['test-1.1.0', RUTA_CATALOGO_TEST_1_1_0],
  ])('pasa el validador del catálogo de L1D-93 cuando se valida %s', (_version, ruta) => {
    expect(() => exigirCatalogoValido(ruta, leerTexto)).not.toThrow();
  });
});
