import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sembrarPCaso } from '../../support/caso.js';
import { RUTA_CATALOGO_REAL } from '../../support/catalogo-terminologico.js';
import {
  iniciarEscenarioDeRegistroManual,
  sembrarEgresado,
  sembrarSinDiagnostico,
  type EscenarioDeRegistroManual,
} from '../../support/registro-manual.js';
import {
  contarTratamientos,
  montarRegistroClinico,
  type OpcionesDeRegistroClinico,
} from '../../support/registro-clinico.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';

const ESPACIO_DE_IDS = 9100;
const LEUPRORELINA = {
  lineNumber: 2,
  setting: 'segunda_linea_metastasica',
  regimenName: 'Leuprorelina',
  startedAt: '2026-08-01',
  ongoing: true,
} as const;
const FARMACO_EXPERIMENTAL = {
  setting: 'otro',
  regimenName: 'Fármaco experimental X',
  ongoing: false,
  endReason: 'desconocido',
} as const;

let escenario: EscenarioDeRegistroManual;
let pCaso: string;

beforeAll(async () => {
  escenario = await iniciarEscenarioDeRegistroManual('rc_tratamientos', ESPACIO_DE_IDS);
  pCaso = (await sembrarPCaso(escenario.siembra)).patientId;
});
afterAll(() => escenario.cerrar());

function registrar(
  cuerpo: unknown,
  patientId: string = pCaso,
  cookie: string | null = escenario.cookieDoctor,
  opciones: OpcionesDeRegistroClinico = {},
) {
  const { app } = montarRegistroClinico(escenario.mundo, opciones);
  const peticion = clienteVerificado(app).post(`/platform/patients/${patientId}/prior-treatments`);
  return (cookie === null ? peticion : peticion.set('Cookie', cookie)).send(cuerpo as object);
}

describe('registro manual de un tratamiento previo', () => {
  it('registra Leuprorelina manual con L02AE02 y mapeada y aparece en /case cuando un doctor la envía sobre P-CASO [US-094 AC-1]', async () => {
    const respuesta = await registrar(LEUPRORELINA);

    expect(respuesta.status).toBe(201);
    expect(respuesta.body).toMatchObject({
      lineNumber: 2,
      setting: 'segunda_linea_metastasica',
      regimenName: 'Leuprorelina',
      atcCodes: ['L02AE02'],
      mappingStatus: 'mapeado',
      startedAt: '2026-08-01',
      endedAt: null,
      ongoing: true,
      endReason: 'desconocido',
      provenance: {
        entryMethod: 'manual',
        extractionConfidence: 'n_a',
        reviewStatus: 'verificado',
        conflict: false,
        sourceDocumentId: null,
      },
    });
    const { app } = montarRegistroClinico(escenario.mundo);
    const caso = await clienteVerificado(app)
      .get(`/platform/patients/${pCaso}/case`)
      .set('Cookie', escenario.cookieDoctor);
    expect(caso.status).toBe(200);
    expect(caso.body.priorTreatments).toContainEqual(
      expect.objectContaining({ startedAt: '2026-08-01', atcCodes: ['L02AE02'] }),
    );
    expect(caso.body.timeline).toContainEqual(
      expect.objectContaining({
        eventType: 'inicio_tratamiento_previo',
        eventDate: '2026-08-01',
        description: 'Leuprorelina',
      }),
    );
  });

  it('guarda Fármaco experimental X como no_mapeado y sin código cuando el catálogo no lo conoce [US-094 AC-2] [RN-27]', async () => {
    const antes = await contarTratamientos(escenario.mundo.cliente, pCaso);

    const respuesta = await registrar(FARMACO_EXPERIMENTAL);

    expect(respuesta.status).toBe(201);
    expect(respuesta.body).toMatchObject({
      regimenName: 'Fármaco experimental X',
      atcCodes: [],
      mappingStatus: 'no_mapeado',
      endReason: 'desconocido',
    });
    expect(await contarTratamientos(escenario.mundo.cliente, pCaso)).toBe(antes + 1);
  });

  it('mapea Leuprorelina con su ATC real cuando se monta el catálogo real [US-094 AC-1] [RN-27] [DEC-04]', async () => {
    const respuesta = await registrar(LEUPRORELINA, pCaso, escenario.cookieDoctor, {
      rutaDelCatalogo: RUTA_CATALOGO_REAL,
    });

    expect(respuesta.status).toBe(201);
    expect(respuesta.body).toMatchObject({ atcCodes: ['L02AE02'], mappingStatus: 'mapeado' });
  });

  it('guarda no_mapeado y sin código cuando el paciente no tiene diagnóstico vigente [US-094 AC-2] [RN-27] [RN-26]', async () => {
    const paciente = (await sembrarSinDiagnostico(escenario.siembra)).patientId;

    const respuesta = await registrar(LEUPRORELINA, paciente);

    expect(respuesta.status).toBe(201);
    expect(respuesta.body).toMatchObject({ atcCodes: [], mappingStatus: 'no_mapeado' });
    expect(await contarTratamientos(escenario.mundo.cliente, paciente)).toBe(1);
  });
});

describe('validación y acceso del registro de un tratamiento previo', () => {
  it.each([
    ['endedAt', { ...LEUPRORELINA, endedAt: '2026-09-01' }],
    ['endReason', { ...LEUPRORELINA, endReason: 'progresion' }],
    ['endReason', { ...FARMACO_EXPERIMENTAL, endReason: undefined }],
    ['endedAt', { ...FARMACO_EXPERIMENTAL, startedAt: '2026-09-01', endedAt: '2026-08-01' }],
  ])(
    'responde 422 CUERPO_INVALIDO con field=%s y no crea filas cuando el fin del tratamiento es incoherente [US-094 AC-5]',
    async (campo, cuerpo) => {
      const antes = await contarTratamientos(escenario.mundo.cliente, pCaso);

      const respuesta = await registrar(cuerpo);

      expect(respuesta.status).toBe(422);
      expect(respuesta.body).toMatchObject({ error: 'CUERPO_INVALIDO', field: campo });
      expect(await contarTratamientos(escenario.mundo.cliente, pCaso)).toBe(antes);
    },
  );

  it('responde 422 CUERPO_INVALIDO con field=regimenName y no crea filas cuando falta el esquema [US-094 AC-5]', async () => {
    const antes = await contarTratamientos(escenario.mundo.cliente, pCaso);

    const respuesta = await registrar({ setting: 'otro', ongoing: true });

    expect(respuesta.status).toBe(422);
    expect(respuesta.body).toMatchObject({ error: 'CUERPO_INVALIDO', field: 'regimenName' });
    expect(await contarTratamientos(escenario.mundo.cliente, pCaso)).toBe(antes);
  });

  it('responde 404 cuando el paciente no existe [US-094 AC-5]', async () => {
    const respuesta = await registrar(LEUPRORELINA, '00000000-0000-4000-8000-00000000dead');

    expect(respuesta.status).toBe(404);
    expect(respuesta.body.error).toBe('NO_ENCONTRADO');
  });

  it('responde 401 y no crea filas cuando no hay sesión [US-094 AC-5]', async () => {
    const antes = await contarTratamientos(escenario.mundo.cliente, pCaso);

    const respuesta = await registrar(LEUPRORELINA, pCaso, null);

    expect(respuesta.status).toBe(401);
    expect(await contarTratamientos(escenario.mundo.cliente, pCaso)).toBe(antes);
  });

  it('responde 403 al admin y no crea filas [US-094 AC-5] [PRD v1.4 §11]', async () => {
    const antes = await contarTratamientos(escenario.mundo.cliente, pCaso);

    const respuesta = await registrar(LEUPRORELINA, pCaso, escenario.cookieAdmin);

    expect(respuesta.status).toBe(403);
    expect(respuesta.body.error).toBe('PERMISO_DENEGADO');
    expect(await contarTratamientos(escenario.mundo.cliente, pCaso)).toBe(antes);
  });

  it('responde 422 PACIENTE_EGRESADO sin field y no crea filas cuando el paciente está egresado [US-094 AC-5] [RN-17]', async () => {
    const { patientId } = await sembrarEgresado(escenario.siembra);

    const respuesta = await registrar(LEUPRORELINA, patientId);

    expect(respuesta.status).toBe(422);
    expect(respuesta.body.error).toBe('PACIENTE_EGRESADO');
    expect(respuesta.body).not.toHaveProperty('field');
    expect(await contarTratamientos(escenario.mundo.cliente, patientId)).toBe(0);
  });

  it('responde 500 sin detalle del driver ni del texto registrado cuando la base de datos no responde [US-094 AC-5]', async () => {
    let intentos = 0;
    const fuenteCaida = {
      connect: () => {
        intentos += 1;
        return Promise.reject(
          new Error('FATAL: password authentication failed; regimen Leuprorelina'),
        );
      },
    };

    const respuesta = await registrar(LEUPRORELINA, pCaso, escenario.cookieDoctor, {
      fuente: fuenteCaida,
    });

    expect(intentos).toBe(1);
    expect(respuesta.status).toBe(500);
    expect(respuesta.body).toMatchObject({ error: 'ERROR_INTERNO' });
    expect(JSON.stringify(respuesta.body)).not.toMatch(/FATAL|Leuprorelina/);
  });
});
