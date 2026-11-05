import { describe, expect, it } from 'vitest';
import {
  cuerpoDeCorreccionDeBiomarcador,
  errorDelCuerpoDeBiomarcador,
} from '../../lib/correcciones/cuerpos';
import { mensajes } from '../../lib/mensajes';

const HOY = '2026-09-22';

function datos(campos: Record<string, string>): FormData {
  const formulario = new FormData();
  for (const [campo, valor] of Object.entries(campos)) formulario.set(campo, valor);
  return formulario;
}

describe('cuerpoDeCorreccionDeBiomarcador', () => {
  it('omite performedAt cuando la fecha es la original', () => {
    const cuerpo = cuerpoDeCorreccionDeBiomarcador(
      datos({ value: '25', unit: '%', performedAt: '2026-10-20' }),
      '%',
      '2026-10-20',
    );

    expect(cuerpo).toEqual({ value: '25', unit: '%' });
  });

  it('incluye performedAt cuando la fecha cambió', () => {
    const cuerpo = cuerpoDeCorreccionDeBiomarcador(
      datos({ value: '25', unit: '%', performedAt: '2026-10-21' }),
      '%',
      '2026-10-20',
    );

    expect(cuerpo).toEqual({ value: '25', unit: '%', performedAt: '2026-10-21' });
  });

  it('omite performedAt cuando la fecha original trae hora y el día es el mismo', () => {
    const cuerpo = cuerpoDeCorreccionDeBiomarcador(
      datos({ value: '25', unit: '', performedAt: '2026-10-20' }),
      undefined,
      '2026-10-20T00:00:00Z',
    );

    expect(cuerpo).toEqual({ value: '25' });
  });

  it('omite performedAt cuando la fecha se vacía', () => {
    const cuerpo = cuerpoDeCorreccionDeBiomarcador(
      datos({ value: '25', unit: '', performedAt: '' }),
      null,
      '2026-10-20',
    );

    expect(cuerpo).toEqual({ value: '25' });
  });
});

describe('errorDelCuerpoDeBiomarcador', () => {
  it('rechaza una fecha posterior a hoy con fechaFutura en el campo performedAt', () => {
    const error = errorDelCuerpoDeBiomarcador({ value: '25', performedAt: '2099-01-01' }, HOY);

    expect(error).toEqual({
      campo: 'performedAt',
      mensaje: mensajes().ficha.correccion.errores.fechaFutura,
    });
  });

  it('acepta una fecha igual a hoy', () => {
    expect(errorDelCuerpoDeBiomarcador({ value: '25', performedAt: HOY }, HOY)).toBeNull();
  });
});
