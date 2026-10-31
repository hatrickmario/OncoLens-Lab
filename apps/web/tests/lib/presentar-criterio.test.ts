import { describe, expect, it } from 'vitest';
import { enlaceDeFichaParaCriterio, rotuloDeCriterio } from '../../lib/evidence/presentar-criterio';

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
    expect(enlaceDeFichaParaCriterio('p-1', 'receptores_hormonales')).toBe(
      '/pacientes/p-1#biomarcadores',
    );
  });

  it('apunta al diagnóstico cuando el criterio es el estadio', () => {
    expect(enlaceDeFichaParaCriterio('p-1', 'estadio')).toBe('/pacientes/p-1#diagnostico');
  });

  it('apunta al encabezado de la ficha cuando el criterio no tiene sección propia', () => {
    expect(enlaceDeFichaParaCriterio('p-1', 'estado_menopausico')).toBe('/pacientes/p-1');
  });
});
