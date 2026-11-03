import { describe, expect, it } from 'vitest';
import {
  esEventoDeIa,
  rotuloOValor,
  separarSinFecha,
  valorConUnidad,
} from '../../lib/caso/presentacion';
import { mensajes } from '../../lib/mensajes';
import casoPCaso from '../../../../contracts/examples/case-view-p-caso.json';

describe('presentación de la vista de caso', () => {
  it('rotula los valores de atributo que siembra el catálogo (posmenopausica) en vez de mostrar el valor crudo [visual-check L1D-76]', () => {
    const { valoresDeAtributo } = mensajes().caso;
    expect(rotuloOValor(valoresDeAtributo, 'posmenopausica')).toBe('Posmenopáusica');
    expect(rotuloOValor(valoresDeAtributo, 'premenopausica')).toBe('Premenopáusica');
  });

  it('muestra el valor crudo cuando no hay rótulo', () => {
    expect(rotuloOValor({}, 'valor_nuevo')).toBe('valor_nuevo');
  });

  it('separa solo los eventos de fecha incierta sin reordenar', () => {
    const { fechados, sinFecha } = separarSinFecha(casoPCaso.timeline as never);
    expect(fechados).toHaveLength(10);
    expect(sinFecha.map((e) => e.eventType)).toEqual(['toxicidad']);
  });

  it('reconoce solo análisis y resumen como eventos de IA', () => {
    expect(esEventoDeIa('analisis_ia')).toBe(true);
    expect(esEventoDeIa('resumen_caso')).toBe(true);
    expect(esEventoDeIa('examen')).toBe(false);
  });

  it('formatea el decimal con coma y omite la unidad ausente', () => {
    expect(valorConUnidad('4.1', 'ng/mL')).toBe('4,1 ng/mL');
    expect(valorConUnidad('Positivo', null)).toBe('Positivo');
  });
});
