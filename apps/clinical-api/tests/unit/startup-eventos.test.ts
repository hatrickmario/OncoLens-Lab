import { describe, expect, it } from 'vitest';
import { registrarEventoDeArranque } from '../../src/startup.js';

describe('registrarEventoDeArranque', () => {
  it('escribe una línea JSON con nivel, evento y los campos dados cuando el servidor empieza a escuchar [US-037 AC-4]', () => {
    const lineas: string[] = [];

    registrarEventoDeArranque((linea) => lineas.push(linea), 'info', 'servidor_escuchando', {
      puerto: 4100,
    });

    expect(lineas).toHaveLength(1);
    expect(JSON.parse(lineas[0] ?? '')).toEqual({
      level: 'info',
      event: 'servidor_escuchando',
      puerto: 4100,
    });
  });

  it('escribe solo nivel y evento cuando no hay campos', () => {
    const lineas: string[] = [];

    registrarEventoDeArranque((linea) => lineas.push(linea), 'error', 'clave_servicio_invalida');

    expect(JSON.parse(lineas[0] ?? '')).toEqual({
      level: 'error',
      event: 'clave_servicio_invalida',
    });
  });
});
