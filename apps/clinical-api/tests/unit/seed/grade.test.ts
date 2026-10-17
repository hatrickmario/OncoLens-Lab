import { describe, expect, it } from 'vitest';
import { derivarGleason, derivarTextoGrade } from '../../../prisma/seed/grade.js';

describe('derivarTextoGrade', () => {
  it('deriva el formato canónico de Gleason con grupo ISUP cuando la gradación es gleason_isup', () => {
    const texto = derivarTextoGrade({
      sistema: 'gleason_isup',
      patronPrimario: 4,
      patronSecundario: 3,
    });

    expect(texto).toBe('Gleason 4+3=7 · ISUP 3');
  });

  it('deriva el formato canónico de Nottingham cuando la gradación es nottingham', () => {
    expect(derivarTextoGrade({ sistema: 'nottingham', grado: 2 })).toBe('Nottingham grado 2');
  });
});

describe('derivarGleason', () => {
  it.each([
    [3, 3, 6, 1],
    [3, 4, 7, 2],
    [4, 3, 7, 3],
    [3, 5, 8, 4],
    [4, 4, 8, 4],
    [5, 3, 8, 4],
    [4, 5, 9, 5],
    [5, 4, 9, 5],
    [5, 5, 10, 5],
  ])(
    'deriva el puntaje y el grupo ISUP cuando los patrones son %i+%i',
    (primario, secundario, puntaje, grupoIsup) => {
      expect(derivarGleason(primario, secundario)).toEqual({ puntaje, grupoIsup });
    },
  );
});
