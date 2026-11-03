import { describe, expect, it } from 'vitest';
import {
  estadoPersistible,
  type DecisionDeNormalizacion,
} from '../../../src/modules/reconciliation/ports.js';
import { RUTA_CATALOGO_FX01BB } from '../../support/catalogo-terminologico.js';
import { servicioSobreCatalogo } from '../../support/reconciliation.js';

const decisionCon = (mappingStatus: DecisionDeNormalizacion['mappingStatus']) =>
  ({ mappingStatus }) as DecisionDeNormalizacion;

describe('ReconciliationService: dato sin tipo de cáncer (Gate 2 de l1d-90)', () => {
  it('devuelve no_mapeado sin código y con el texto original cuando no hay tipo de cáncer', () => {
    const { servicio } = servicioSobreCatalogo(RUTA_CATALOGO_FX01BB);

    const decision = servicio.decidir({
      entidad: 'Biomarker',
      tipoDeCancer: null,
      textoOriginal: 'Ki-67',
    });

    expect(decision).toMatchObject({
      name: 'Ki-67',
      originalName: 'Ki-67',
      loincCode: null,
      mappingStatus: 'no_mapeado',
    });
  });
});

describe('estadoPersistible', () => {
  it.each([
    ['mapeado', 'mapeado'],
    ['no_mapeado', 'no_mapeado'],
    ['n_a', 'no_mapeado'],
  ] as const)('traduce %s a %s para entidades que no admiten n_a', (entrada, esperado) => {
    expect(estadoPersistible(decisionCon(entrada))).toBe(esperado);
  });
});
