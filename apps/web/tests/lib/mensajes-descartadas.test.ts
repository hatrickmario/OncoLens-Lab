import { describe, expect, it } from 'vitest';
import { mensajes } from '../../lib/mensajes';

describe('textos de las opciones descartadas (RN-23, US-245)', () => {
  const { discarded, discardReason } = mensajes().evidence;

  it('explica el motivo afirmacion_sin_soporte sin atribuirlo a lenguaje no permitido, porque el modal normativo también lo produce', () => {
    expect(discardReason.afirmacion_sin_soporte).toBe(
      'Una afirmación no tiene soporte en la fuente o su formulación no se muestra',
    );
  });

  it('titula la sección sin sugerir que toda descartada carece de soporte', () => {
    expect(discarded.titulo).toBe('Opciones descartadas — solo para revisión');
  });
});
