import { describe, expect, it } from 'vitest';
import { identidadDesdeEtiquetas } from '../../../src/evaluacion/pii/medir-detector.js';
import type { TextoSembrado } from '../../../src/evaluacion/pii/medicion.js';

function textoCon(texto: string, etiquetas: Array<[string, string]>): TextoSembrado {
  return {
    id: 't',
    contexto: 'nota',
    texto,
    etiquetas: etiquetas.map(([tipo, valor]) => {
      const inicio = texto.indexOf(valor);
      return { tipo, inicio, fin: inicio + valor.length };
    }),
    controles: [],
  };
}

const NUMERO_A = ['111', '222'].join('');
const NUMERO_B = ['333', '444'].join('');

describe('identidadDesdeEtiquetas', () => {
  it('arma nombre, documento y teléfono desde las etiquetas del texto cuando están presentes', () => {
    const identidad = identidadDesdeEtiquetas(
      textoCon(`Ana Pérez / ${NUMERO_A} / ${NUMERO_B}`, [
        ['nombre', 'Ana Pérez'],
        ['documento', NUMERO_A],
        ['telefono', NUMERO_B],
      ]),
    );

    expect(identidad).toEqual({
      nombreCompleto: 'Ana Pérez',
      documento: NUMERO_A,
      telefono: NUMERO_B,
    });
  });

  it('deja vacíos documento y nombre y el teléfono en null cuando el texto no tiene esas etiquetas', () => {
    expect(identidadDesdeEtiquetas(textoCon('sin datos', []))).toEqual({
      nombreCompleto: '',
      documento: '',
      telefono: null,
    });
  });
});
