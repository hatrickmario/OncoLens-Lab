import { describe, expect, it } from 'vitest';
import { parseProhibitedTerms } from '../../../../packages/clinical-language/src/load-prohibited-terms';
import listaVersionada from '../../../../packages/clinical-catalogs/lenguaje/terminos-prohibidos.json';
import type { DiscardedOption } from '../../../../packages/api-contracts/src/types/clinical-api';
import { zDiscardedOption } from '../../../../packages/api-contracts/src/zod/clinical-api/zod.gen';
import sinSoporteYLenguaje from '../../../../contracts/examples/con-evidencia-solo-descartadas-sin-soporte-y-lenguaje.json';
import { descripcionDeDescartada } from '../../lib/evidence/descripcion-descartada';
import { mostrarSiPermitido } from '../../lib/evidence/mostrar-si-permitido';

function descartada(parcial: Partial<DiscardedOption>): DiscardedOption {
  return {
    option: 'Opción sintética',
    rationale: 'r',
    discardReason: 'afirmacion_sin_soporte',
    unsupportedClaims: [],
    ...parcial,
  };
}

describe('mostrarSiPermitido (RN-23)', () => {
  it('la lista versionada importada como dato es válida para el verificador', () => {
    expect(() => parseProhibitedTerms(listaVersionada, 'terminos-prohibidos.json')).not.toThrow();
  });

  it('devuelve el texto cuando no contiene términos prohibidos', () => {
    expect(mostrarSiPermitido('reduce la mortalidad a la mitad')).toBe(
      'reduce la mortalidad a la mitad',
    );
  });

  it('devuelve null cuando el texto contiene un término prohibido', () => {
    expect(mostrarSiPermitido('es el mejor tratamiento para la paciente')).toBeNull();
  });
});

describe('descripcionDeDescartada', () => {
  it('conserva el motivo recibido y filtra las afirmaciones cuando es afirmacion_sin_soporte', () => {
    const d = descripcionDeDescartada(
      descartada({
        unsupportedClaims: ['dato limpio', 'es el mejor tratamiento', '(texto no mostrado)'],
      }),
    );
    expect(d).toEqual({
      motivo: 'afirmacion_sin_soporte',
      opcion: 'Opción sintética',
      afirmaciones: ['dato limpio', null, null],
      porLenguaje: false,
    });
  });

  it('no devuelve afirmaciones y marca la nota de redacción cuando es lenguaje_no_permitido', () => {
    const d = descripcionDeDescartada(
      descartada({
        discardReason: 'lenguaje_no_permitido',
        unsupportedClaims: ['[afirmación retirada]'],
      }),
    );
    expect(d.afirmaciones).toEqual([]);
    expect(d.porLenguaje).toBe(true);
  });

  it('devuelve opcion null cuando el filtro rechaza el nombre', () => {
    expect(descripcionDeDescartada(descartada({ option: 'Debe recibir X' })).opcion).toBeNull();
  });
});

const MUESTRA_AFIRMACIONES: Record<DiscardedOption['discardReason'], boolean> = {
  cita_invalida: true,
  afirmacion_sin_soporte: true,
  sin_citas: true,
  solo_soportada_por_analisis_previo: true,
  lenguaje_no_permitido: false,
};

describe('descripcionDeDescartada · todos los motivos del contrato', () => {
  it.each(zDiscardedOption.shape.discardReason.options)(
    'decide si muestra afirmaciones según el motivo %s',
    (motivo) => {
      const d = descripcionDeDescartada(
        descartada({ discardReason: motivo, unsupportedClaims: ['dato limpio'] }),
      );
      expect(d.afirmaciones).toEqual(MUESTRA_AFIRMACIONES[motivo] ? ['dato limpio'] : []);
      expect(d.porLenguaje).toBe(motivo === 'lenguaje_no_permitido');
    },
  );
});

describe('descripcionDeDescartada · literales de afirmación retirada del backend', () => {
  const retiradaDelFixture = sinSoporteYLenguaje.discardedOptions[1]!.unsupportedClaims[0]!;

  it.each([
    '(texto no mostrado)',
    '(text not shown)',
    '[afirmación retirada: formulación no permitida]',
    '[claim removed: disallowed wording]',
    retiradaDelFixture,
  ])('trata %s como una afirmación cuyo texto no se muestra', (literal) => {
    const d = descripcionDeDescartada(descartada({ unsupportedClaims: [literal] }));
    expect(d.afirmaciones).toEqual([null]);
  });
});
