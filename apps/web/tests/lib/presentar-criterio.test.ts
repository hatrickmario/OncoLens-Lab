import { describe, expect, it } from 'vitest';
import { hrefDeFicha } from '../../lib/ficha/anclas';
import { enlaceDeFichaParaCriterio, rotuloDeCriterio } from '../../lib/evidence/presentar-criterio';

const ID = '0b5c9c1e-5f0e-4d6b-8c55-3f7a1a2b9d10';

describe('rotuloDeCriterio', () => {
  it('devuelve el literal del catálogo cuando la clave es conocida', () => {
    expect(rotuloDeCriterio('estado_her2')).toBe('Estado HER2');
  });

  it('devuelve la clave sin guiones bajos cuando no hay literal', () => {
    expect(rotuloDeCriterio('ki_67_alto')).toBe('ki 67 alto');
  });
});

describe('enlaceDeFichaParaCriterio', () => {
  it('apunta a la sección de biomarcadores cuando el criterio es un biomarcador', () => {
    expect(enlaceDeFichaParaCriterio(ID, 'receptores_hormonales')).toBe(
      hrefDeFicha(ID, 'biomarcadores'),
    );
  });

  it('apunta al diagnóstico cuando el criterio es el estadio', () => {
    expect(enlaceDeFichaParaCriterio(ID, 'estadio')).toBe(hrefDeFicha(ID, 'diagnostico'));
  });

  it('apunta al encabezado de la ficha cuando el criterio no tiene sección propia', () => {
    expect(enlaceDeFichaParaCriterio(ID, 'estado_menopausico')).toBe(hrefDeFicha(ID));
  });
});
