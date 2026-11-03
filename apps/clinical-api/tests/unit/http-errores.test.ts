import type { Response } from 'express';
import { describe, expect, it } from 'vitest';
import { enviarError } from '../../src/infrastructure/http-errores.js';

function respuestaFalsa() {
  const captura: { status?: number; cuerpo?: unknown } = {};
  const respuesta = {
    status(codigo: number) {
      captura.status = codigo;
      return respuesta;
    },
    json(cuerpo: unknown) {
      captura.cuerpo = cuerpo;
      return respuesta;
    },
  } as unknown as Response;
  return { respuesta, captura };
}

describe('enviarError', () => {
  it('emite el mensaje fijo sin la palabra «montado» cuando el valor no figura en el catálogo', () => {
    const { respuesta, captura } = respuestaFalsa();

    enviarError(respuesta, 422, 'VALOR_FUERA_DE_CATALOGO', 'req_t1');

    expect(captura).toEqual({
      status: 422,
      cuerpo: {
        error: 'VALOR_FUERA_DE_CATALOGO',
        message: 'Un valor no figura en el catálogo clínico.',
        traceId: 'req_t1',
      },
    });
  });

  it('añade field con el nombre del campo cuando el error es de un campo', () => {
    const { respuesta, captura } = respuestaFalsa();

    enviarError(respuesta, 422, 'CUERPO_INVALIDO', 'req_t2', 'performedAt');

    expect(captura.cuerpo).toMatchObject({ error: 'CUERPO_INVALIDO', field: 'performedAt' });
  });

  it('no incluye field cuando el error no es de un campo', () => {
    const { respuesta, captura } = respuestaFalsa();

    enviarError(respuesta, 409, 'DATO_NO_VIGENTE', 'req_t3');

    expect(captura.cuerpo).not.toHaveProperty('field');
  });
});
