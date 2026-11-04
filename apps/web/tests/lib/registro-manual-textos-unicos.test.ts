// @vitest-environment jsdom
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import errorPacienteEgresado from '../../../../contracts/examples/error-paciente-egresado.json';
import errorPermisoDenegado from '../../../../contracts/examples/error-permiso-denegado.json';
import { enviarRegistro } from '../../lib/registro-manual/cliente';
import { mensajes } from '../../lib/mensajes';

const ID = '0b5c9c1e-5f0e-4d6b-8c55-3f7a1a2b9d10';
const { errores } = mensajes().registroManual;
const servidor = setupServer();

async function textoDe(ruta: 'biomarkers' | 'diagnoses') {
  const resultado = await enviarRegistro(ID, ruta, {});
  return resultado.tipo === 'error' ? resultado.error.mensaje : null;
}

describe('Textos de error del registro manual de biomarcador y diagnóstico', () => {
  beforeAll(() => servidor.listen({ onUnhandledFrame: 'error' }));
  afterAll(() => servidor.close());
  afterEach(() => servidor.resetHandlers());

  it.each([
    ['422 PACIENTE_EGRESADO', 422, errorPacienteEgresado, errores.egresado],
    ['403', 403, errorPermisoDenegado, errores.permiso],
  ])(
    'da el mismo texto en biomarcador y diagnóstico para el %s [US-111 AC-4]',
    async (_n, status, cuerpo, esperado) => {
      servidor.use(
        http.post('*/api/patients/:id/:ruta', () => HttpResponse.json(cuerpo, { status })),
      );

      expect(await textoDe('biomarkers')).toBe(esperado);
      expect(await textoDe('diagnoses')).toBe(esperado);
    },
  );
});
