import { describe, expect, it } from 'vitest';
import { derivarTextoGrade } from '../../../prisma/seed/grade.js';

describe('derivarTextoGrade', () => {
  it('deriva el formato canónico de Gleason con grupo ISUP cuando la gradación es gleason_isup', () => {
    const texto = derivarTextoGrade({
      sistema: 'gleason_isup',
      patronPrimario: 4,
      patronSecundario: 3,
      puntaje: 7,
      grupoIsup: 3,
    });

    expect(texto).toBe('Gleason 4+3=7 · ISUP 3');
  });

  it('deriva el formato canónico de Nottingham cuando la gradación es nottingham', () => {
    expect(derivarTextoGrade({ sistema: 'nottingham', grado: 2 })).toBe('Nottingham grado 2');
  });
});
