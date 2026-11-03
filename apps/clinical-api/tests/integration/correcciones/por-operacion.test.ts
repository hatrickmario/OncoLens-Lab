import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  iniciarEscenarioDeCorrecciones,
  montarCorrecciones,
  pacienteConNotas,
  registrarKi67,
  sembrarNotasDeFx253a,
  type EscenarioDeCorrecciones,
} from '../../support/correcciones.js';
import { sembrarDiagnostico } from '../../support/completitud.js';
import { insertar, filaDeDiagnostico } from '../../support/filas-sinteticas.js';
import {
  CUERPO_KI67,
  montarRegistroManual,
  sembrarSinDiagnostico,
} from '../../support/registro-manual.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';

const ESPACIO_DE_IDS = 9970;
const ID_DESCONOCIDO = '00000000-0000-4000-8000-00000000dead';
let escenario: EscenarioDeCorrecciones;

beforeAll(async () => {
  escenario = await iniciarEscenarioDeCorrecciones('corr_operacion', ESPACIO_DE_IDS);
});
afterAll(() => escenario.cerrar());

interface Operacion {
  readonly nombre: string;
  readonly verbo: 'get' | 'post';
  readonly ruta: (patientId: string, ki67: string, notaId: string) => string;
  readonly cuerpo?: object;
}

const OPERACIONES: readonly Operacion[] = [
  {
    nombre: 'correctBiomarker',
    verbo: 'post',
    ruta: (p, ki67) => `/platform/patients/${p}/biomarkers/${ki67}/corrections`,
    cuerpo: { value: '25', unit: '%' },
  },
  {
    nombre: 'getBiomarkerHistory',
    verbo: 'get',
    ruta: (p, ki67) => `/platform/patients/${p}/biomarkers/${ki67}/history`,
  },
  {
    nombre: 'listClinicalNotes',
    verbo: 'get',
    ruta: (p) => `/platform/patients/${p}/clinical-notes`,
  },
  {
    nombre: 'correctClinicalNote',
    verbo: 'post',
    ruta: (p, _k, nota) => `/platform/patients/${p}/clinical-notes/${nota}/corrections`,
    cuerpo: { content: 'Texto nuevo de la nota.' },
  },
  {
    nombre: 'getClinicalNoteHistory',
    verbo: 'get',
    ruta: (p, _k, nota) => `/platform/patients/${p}/clinical-notes/${nota}/history`,
  },
];

function pedir(operacion: Operacion, ruta: string, cookie?: string) {
  const app = montarCorrecciones(escenario.mundo).app;
  const peticion = clienteVerificado(app)[operacion.verbo](ruta);
  const conCookie = cookie === undefined ? peticion : peticion.set('Cookie', cookie);
  return operacion.verbo === 'post' ? conCookie.send(operacion.cuerpo as object) : conCookie;
}

async function datos() {
  const paciente = await pacienteConNotas(escenario);
  const { comorbilidadId } = await sembrarNotasDeFx253a(paciente);
  return {
    patientId: paciente.patientId,
    ki67: await registrarKi67(escenario, paciente.patientId),
    notaId: comorbilidadId,
  };
}

describe('cada operación de la corrección contra el contrato', () => {
  it.each(OPERACIONES)(
    '$nombre responde 401 declarado cuando la petición no trae sesión [US-253 AC-4]',
    async (operacion) => {
      const { patientId, ki67, notaId } = await datos();

      const respuesta = await pedir(operacion, operacion.ruta(patientId, ki67, notaId));

      expect(respuesta.status).toBe(401);
    },
  );

  it.each(OPERACIONES)(
    '$nombre responde 404 declarado cuando el paciente no existe [US-253 AC-1]',
    async (operacion) => {
      const { ki67, notaId } = await datos();

      const respuesta = await pedir(
        operacion,
        operacion.ruta(ID_DESCONOCIDO, ki67, notaId),
        escenario.cookieDoctor,
      );

      expect(respuesta.status).toBe(404);
    },
  );

  it.each(OPERACIONES.filter((o) => o.nombre !== 'listClinicalNotes'))(
    '$nombre responde 404 declarado cuando el dato es de otro paciente [US-253 AC-1]',
    async (operacion) => {
      const propio = await datos();
      const ajeno = await datos();

      const respuesta = await pedir(
        operacion,
        operacion.ruta(ajeno.patientId, propio.ki67, propio.notaId),
        escenario.cookieDoctor,
      );

      expect(respuesta.status).toBe(404);
    },
  );

  it('correctClinicalNote responde 409 DATO_NO_VIGENTE cuando la nota ya fue reemplazada [US-253 AC-2] [RN-08]', async () => {
    const { patientId, notaId } = await datos();
    const operacion = OPERACIONES[3]!;
    const primera = await pedir(
      operacion,
      operacion.ruta(patientId, '', notaId),
      escenario.cookieDoctor,
    );

    const segunda = await pedir(
      { ...operacion, cuerpo: { content: 'Otro texto distinto.' } },
      operacion.ruta(patientId, '', notaId),
      escenario.cookieDoctor,
    );

    expect(primera.status).toBe(201);
    expect(segunda.status).toBe(409);
    expect(segunda.body.error).toBe('DATO_NO_VIGENTE');
  });
});

describe('el tipo de cáncer que normaliza es el mismo en el alta y en la corrección [RN-27]', () => {
  it('normaliza igual cuando el paciente tiene dos diagnósticos activos [US-253 AC-1]', async () => {
    const paciente = await sembrarSinDiagnostico(escenario.siembra);
    await insertar(
      paciente.cliente,
      'clinical.diagnosis',
      filaDeDiagnostico(paciente.ids, paciente.patientId, paciente.episodeId, {
        cancer_type: 'prostata',
        diagnosed_at: '2025-01-10',
      }),
    );
    await sembrarDiagnostico(paciente, {
      cancerType: 'mama',
      histology: 'carcinoma ductal infiltrante',
      grade: null,
      stagingSystem: 'TNM_8',
      stageValue: 'IIA',
      performanceValue: 1,
    });
    const alta = await clienteVerificado(montarRegistroManual(escenario.mundo).app)
      .post(`/platform/patients/${paciente.patientId}/biomarkers`)
      .set('Cookie', escenario.cookieDoctor)
      .send(CUERPO_KI67);

    const correccion = await pedir(
      OPERACIONES[0]!,
      OPERACIONES[0]!.ruta(paciente.patientId, alta.body.id, ''),
      escenario.cookieDoctor,
    );

    expect(correccion.status).toBe(201);
    expect(correccion.body).toMatchObject({
      mappingStatus: alta.body.mappingStatus,
      loincCode: alta.body.loincCode,
    });
  });
});
