import { describe, expect, it } from 'vitest';
import { mensajes } from '../../lib/mensajes';

describe('textos de las opciones descartadas (RN-23, US-245)', () => {
  const { discarded, discardReason } = mensajes().evidence;

  it('explica el motivo afirmacion_sin_soporte sin atribuirlo a lenguaje no permitido [US-246 AC-4]', () => {
    expect(discardReason.afirmacion_sin_soporte).toBe(
      'Una afirmación no tiene soporte en la fuente citada',
    );
  });

  it('titula la sección sin sugerir que toda descartada carece de soporte [US-246 AC-2]', () => {
    expect(discarded.titulo).toBe('Descartadas en la verificación — solo para revisión');
  });
});
