import { describe, expect, it } from 'vitest';
import {
  exigirAtributoPermitido,
  precisionDeFecha,
} from '../../../src/modules/clinical-attributes/clinical-attributes.reglas.js';
import { ValorFueraDeCatalogoError } from '../../../src/modules/compartido/errores-de-registro.js';

const PERMITIDOS = [
  {
    key: 'estado_menopausico',
    label: 'Estado menopáusico',
    values: [{ value: 'posmenopausica', label: 'Posmenopáusica' }],
  },
];

describe('exigirAtributoPermitido', () => {
  it('no lanza cuando la clave y el valor están declarados', () => {
    expect(() =>
      exigirAtributoPermitido(PERMITIDOS, {
        attributeKey: 'estado_menopausico',
        value: 'posmenopausica',
      }),
    ).not.toThrow();
  });

  it('lanza con campo attributeKey cuando la clave no está declarada', () => {
    expect(() =>
      exigirAtributoPermitido(PERMITIDOS, { attributeKey: 'color_ojos', value: 'azules' }),
    ).toThrow(expect.objectContaining({ campo: 'attributeKey' }));
  });

  it('lanza con campo value cuando el valor no está en la lista de la clave', () => {
    expect(() =>
      exigirAtributoPermitido(PERMITIDOS, { attributeKey: 'estado_menopausico', value: 'talvez' }),
    ).toThrow(expect.objectContaining({ campo: 'value' }));
  });

  it('lanza ValorFueraDeCatalogoError cuando el tipo de cáncer no tiene atributos', () => {
    expect(() => exigirAtributoPermitido([], { attributeKey: 'a', value: 'b' })).toThrow(
      ValorFueraDeCatalogoError,
    );
  });

  it('no incluye el valor enviado en el mensaje del error', () => {
    expect(() =>
      exigirAtributoPermitido(PERMITIDOS, { attributeKey: 'estado_menopausico', value: 'talvez' }),
    ).toThrow(expect.not.objectContaining({ message: expect.stringContaining('talvez') }));
  });
});

describe('precisionDeFecha', () => {
  it('devuelve dia cuando hay fecha de observación', () => {
    expect(precisionDeFecha('2026-09-01')).toBe('dia');
  });

  it('devuelve incierta cuando no hay fecha de observación', () => {
    expect(precisionDeFecha(undefined)).toBe('incierta');
  });
});
