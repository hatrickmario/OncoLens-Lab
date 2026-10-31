import { describe, expect, it } from 'vitest';
import {
  anuncioOpcionesNoMostradas,
  etiquetaDePosicion,
  textoOpcionesNoMostradas,
} from '../../lib/evidence/lista-de-opciones';

describe('textoOpcionesNoMostradas', () => {
  it('devuelve null cuando optionsNotShown es 0, ausente o no es un entero positivo', () => {
    expect(textoOpcionesNoMostradas({ optionsNotShown: 0 })).toBeNull();
    expect(textoOpcionesNoMostradas({})).toBeNull();
    expect(textoOpcionesNoMostradas({ optionsNotShown: 1.5 })).toBeNull();
    expect(textoOpcionesNoMostradas({ optionsNotShown: -1 })).toBeNull();
  });

  it('declara la cantidad y el límite de maxOptions cuando hay opciones no mostradas', () => {
    expect(textoOpcionesNoMostradas({ optionsNotShown: 2, maxOptions: 3 })).toContain(
      'describe 2 opción(es) más con soporte que no se muestran por el límite de 3,',
    );
  });

  it('usa el límite de 3 cuando el análisis no declara maxOptions', () => {
    expect(textoOpcionesNoMostradas({ optionsNotShown: 1 })).toContain('por el límite de 3,');
  });
});

describe('anuncioOpcionesNoMostradas', () => {
  it('añade la cantidad al anuncio y devuelve null sin opciones no mostradas', () => {
    expect(anuncioOpcionesNoMostradas({ optionsNotShown: 1 })).toBe(
      '1 más con soporte no mostrada',
    );
    expect(anuncioOpcionesNoMostradas({ optionsNotShown: 0 })).toBeNull();
  });
});

describe('etiquetaDePosicion', () => {
  it('rotula la posición sobre el total sin ninguna jerarquía', () => {
    expect(etiquetaDePosicion(2, 3)).toBe('Opción descrita 2 de 3');
  });
});
