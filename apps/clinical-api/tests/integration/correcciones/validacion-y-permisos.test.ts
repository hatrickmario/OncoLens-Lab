import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  MANANA_DE_TEST,
  contarFilasDeCorreccion,
  filaDeBiomarcador,
  filaDeNota,
  iniciarEscenarioDeCorrecciones,
  montarCorrecciones,
  pacienteConNotas,
  pacienteEgresadoConDatos,
  registrarKi67,
  sembrarNotasDeFx253a,
  type EscenarioDeCorrecciones,
} from '../../support/correcciones.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';

const ESPACIO_DE_IDS = 9930;
let escenario: EscenarioDeCorrecciones;

beforeAll(async () => {
  escenario = await iniciarEscenarioDeCorrecciones('corr_validacion', ESPACIO_DE_IDS);
});
afterAll(() => escenario.cerrar());

type Verbo = 'get' | 'post';

function pedir(verbo: Verbo, ruta: string, cookie: string, cuerpo?: unknown) {
  const peticion = clienteVerificado(montarCorrecciones(escenario.mundo).app)[verbo](ruta);
  const conCookie = peticion.set('Cookie', cookie);
  return verbo === 'post' ? conCookie.send(cuerpo as object) : conCookie;
}

const rutaDeBiomarcador = (patientId: string, id: string) =>
  `/platform/patients/${patientId}/biomarkers/${id}/corrections`;
const rutaDeNota = (patientId: string, id: string) =>
  `/platform/patients/${patientId}/clinical-notes/${id}/corrections`;

async function pacienteConKi67() {
  const paciente = await pacienteConNotas(escenario);
  const { comorbilidadId } = await sembrarNotasDeFx253a(paciente);
  return { ...paciente, ki67: await registrarKi67(escenario, paciente.patientId), comorbilidadId };
}

describe('validación de la corrección: nada cambia ante un 422', () => {
  it('responde 422 con field performedAt ante una fecha posterior a hoy y no cambia nada [US-253 AC-3]', async () => {
    const { patientId, ki67, cliente } = await pacienteConKi67();
    const antes = await contarFilasDeCorreccion(cliente, patientId);

    const respuesta = await pedir(
      'post',
      rutaDeBiomarcador(patientId, ki67),
      escenario.cookieDoctor,
      {
        value: '25',
        performedAt: MANANA_DE_TEST,
      },
    );

    expect(respuesta.status).toBe(422);
    expect(respuesta.body).toMatchObject({ error: 'CUERPO_INVALIDO', field: 'performedAt' });
    expect(await contarFilasDeCorreccion(cliente, patientId)).toEqual(antes);
    expect((await filaDeBiomarcador(cliente, ki67)).review_status).toBe('verificado');
  });

  it('responde 422 VALOR_FUERA_DE_CATALOGO con field value cuando un valor cuantitativo no es numérico [US-253 AC-3] [RN-27]', async () => {
    const { patientId, ki67, cliente } = await pacienteConKi67();
    const antes = await contarFilasDeCorreccion(cliente, patientId);

    const respuesta = await pedir(
      'post',
      rutaDeBiomarcador(patientId, ki67),
      escenario.cookieDoctor,
      {
        value: '7+x',
        unit: '%',
      },
    );

    expect(respuesta.status).toBe(422);
    expect(respuesta.body).toMatchObject({ error: 'VALOR_FUERA_DE_CATALOGO', field: 'value' });
    expect(await contarFilasDeCorreccion(cliente, patientId)).toEqual(antes);
  });

  it.each([
    ['vacío', ''],
    ['solo espacios', '   '],
    ['mayor que CLINICAL_NOTE_MAX_CHARS', 'x'.repeat(201)],
  ])(
    'responde 422 con field content cuando la nota queda %s [US-253 AC-3]',
    async (_caso, content) => {
      const { patientId, comorbilidadId, cliente } = await pacienteConKi67();
      const antes = await contarFilasDeCorreccion(cliente, patientId);

      const respuesta = await pedir(
        'post',
        rutaDeNota(patientId, comorbilidadId),
        escenario.cookieDoctor,
        {
          content,
        },
      );

      expect(respuesta.status).toBe(422);
      expect(respuesta.body).toMatchObject({ error: 'CUERPO_INVALIDO', field: 'content' });
      expect(await contarFilasDeCorreccion(cliente, patientId)).toEqual(antes);
      expect((await filaDeNota(cliente, comorbilidadId)).review_status).toBe('verificado');
    },
  );

  it('responde 422 sin field y sin crear filas cuando la corrección no cambia nada [US-253 AC-3]', async () => {
    const { patientId, ki67, comorbilidadId, cliente } = await pacienteConKi67();
    const antes = await contarFilasDeCorreccion(cliente, patientId);

    const biomarcador = await pedir(
      'post',
      rutaDeBiomarcador(patientId, ki67),
      escenario.cookieDoctor,
      {
        value: '20',
        unit: '%',
      },
    );
    const nota = await pedir(
      'post',
      rutaDeNota(patientId, comorbilidadId),
      escenario.cookieDoctor,
      {
        content: 'Hipertensión arterial en tratamiento.',
        noteType: 'comorbilidad',
      },
    );

    for (const respuesta of [biomarcador, nota]) {
      expect(respuesta.status).toBe(422);
      expect(respuesta.body.error).toBe('CUERPO_INVALIDO');
      expect(respuesta.body).not.toHaveProperty('field');
    }
    expect(await contarFilasDeCorreccion(cliente, patientId)).toEqual(antes);
  });

  it('responde 404 sin crear filas cuando el dato es de otro paciente [US-253 AC-1]', async () => {
    const propio = await pacienteConKi67();
    const ajeno = await pacienteConKi67();

    const respuesta = await pedir(
      'post',
      rutaDeBiomarcador(ajeno.patientId, propio.ki67),
      escenario.cookieDoctor,
      { value: '25', unit: '%' },
    );

    expect(respuesta.status).toBe(404);
    expect((await filaDeBiomarcador(propio.cliente, propio.ki67)).review_status).toBe('verificado');
  });
});

describe('paciente egresado y administrador no corrigen', () => {
  it('responde 422 PACIENTE_EGRESADO sin escribir cuando el doctor corrige un biomarcador o una nota de un paciente egresado [US-253 AC-4] [RN-17]', async () => {
    const egresado = await pacienteEgresadoConDatos(escenario);
    const antes = await contarFilasDeCorreccion(egresado.cliente, egresado.patientId);

    const biomarcador = await pedir(
      'post',
      rutaDeBiomarcador(egresado.patientId, egresado.biomarcadorId),
      escenario.cookieDoctor,
      { value: '3+ (IHQ)' },
    );
    const nota = await pedir(
      'post',
      rutaDeNota(egresado.patientId, egresado.notaId),
      escenario.cookieDoctor,
      {
        content: 'Texto nuevo de la nota.',
      },
    );

    for (const respuesta of [biomarcador, nota]) {
      expect(respuesta.status).toBe(422);
      expect(respuesta.body.error).toBe('PACIENTE_EGRESADO');
    }
    expect(await contarFilasDeCorreccion(egresado.cliente, egresado.patientId)).toEqual(antes);
  });

  it('responde 403 al administrador en correcciones, notas e histórico y no crea filas [US-253 AC-4] [PRD §11]', async () => {
    const { patientId, ki67, comorbilidadId, cliente } = await pacienteConKi67();
    const antes = await contarFilasDeCorreccion(cliente, patientId);
    const base = `/platform/patients/${patientId}`;

    const respuestas = [
      await pedir('post', rutaDeBiomarcador(patientId, ki67), escenario.cookieAdmin, {
        value: '25',
      }),
      await pedir('post', rutaDeNota(patientId, comorbilidadId), escenario.cookieAdmin, {
        content: 'Texto nuevo.',
      }),
      await pedir('get', `${base}/clinical-notes`, escenario.cookieAdmin),
      await pedir('get', `${base}/biomarkers/${ki67}/history`, escenario.cookieAdmin),
      await pedir('get', `${base}/clinical-notes/${comorbilidadId}/history`, escenario.cookieAdmin),
    ];

    for (const respuesta of respuestas) {
      expect(respuesta.status).toBe(403);
      expect(respuesta.body.error).toBe('PERMISO_DENEGADO');
    }
    expect(await contarFilasDeCorreccion(cliente, patientId)).toEqual(antes);
  });
});
