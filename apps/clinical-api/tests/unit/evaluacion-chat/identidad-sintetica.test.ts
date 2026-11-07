import { describe, expect, it } from 'vitest';
import {
  DOCUMENTO_SINTETICO_CHAT,
  NACIMIENTO_SINTETICO_CHAT,
  NOMBRE_SINTETICO_CHAT,
} from '../../../prisma/seed/pacientes/chat.js';
import { resolverMarcadorDeIdentidad } from '../../../scripts/chat-preparar/identidad-sintetica.js';

describe('resolverMarcadorDeIdentidad (FX-12-d)', () => {
  it('sustituye el marcador P-CHAT por nombre, documento y fecha de nacimiento sintéticos y devuelve los tres textos', () => {
    const resuelta = resolverMarcadorDeIdentidad(
      'La paciente {identidad_sintetica:P-CHAT}, ¿cuál es su situación actual?',
    );

    expect(resuelta.identidad).toEqual([
      NOMBRE_SINTETICO_CHAT,
      DOCUMENTO_SINTETICO_CHAT,
      NACIMIENTO_SINTETICO_CHAT,
    ]);
    expect(resuelta.pregunta).toContain(NOMBRE_SINTETICO_CHAT);
    expect(resuelta.pregunta).toContain(NACIMIENTO_SINTETICO_CHAT);
    expect(resuelta.pregunta).not.toContain('{identidad_sintetica');
  });

  it('deja la pregunta igual y sin identidad cuando no trae marcador', () => {
    expect(resolverMarcadorDeIdentidad('¿Qué información falta del caso?')).toEqual({
      pregunta: '¿Qué información falta del caso?',
      identidad: [],
    });
  });

  it('falla nombrando el marcador cuando la identidad sintética no existe', () => {
    expect(() => resolverMarcadorDeIdentidad('{identidad_sintetica:P-NADA}')).toThrow('P-NADA');
  });
});
