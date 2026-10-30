import { describe, expect, it } from 'vitest';
import ejemploDeF_M2 from '../../../../../contracts/examples/completeness-f-m2.json' with { type: 'json' };
import { exigirCatalogoValido } from '../../../src/infrastructure/catalogo/validar-catalogo.js';
import {
  RUTA_CATALOGO_TEST_1_0_0,
  RUTA_CATALOGO_TEST_1_1_0,
  leerTexto,
} from '../../support/completitud.js';
import { etiquetasDelCatalogo } from '../../support/completitud-http.js';

describe('catálogos FX-04-a de la completitud', () => {
  it.each([
    ['test-1.0.0', RUTA_CATALOGO_TEST_1_0_0],
    ['test-1.1.0', RUTA_CATALOGO_TEST_1_1_0],
  ])('pasa el validador del catálogo de L1D-93 cuando se valida %s', (_version, ruta) => {
    expect(() => exigirCatalogoValido(ruta, leerTexto)).not.toThrow();
  });

  it('tiene los mismos label.es que el ejemplo completeness-f-m2.json cuando se lee test-1.0.0 de mama', () => {
    const etiquetas = etiquetasDelCatalogo('mama');

    const delEjemplo = Object.fromEntries(ejemploDeF_M2.items.map((i) => [i.item, i.label]));

    expect(delEjemplo).toEqual(etiquetas);
  });
});
