import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { FuenteDeConexiones } from '../../../src/modules/compartido/transaccion.js';
import {
  nuevoPaciente,
  sembrarAtributo,
  sembrarDiagnostico,
  sembrarTratamientoPrevio,
  type PacienteSembrado,
} from '../../support/completitud.js';
import { conectar } from '../../support/db.js';
import {
  contarAtributos,
  contarTratamientos,
  montarRegistroClinico,
} from '../../support/registro-clinico.js';
import {
  iniciarEscenarioDeRegistroManual,
  sembrarEgresado,
  type EscenarioDeRegistroManual,
} from '../../support/registro-manual.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';

const ESPACIO_DE_IDS = 9740;
const CLAVE = 'sin_tratamiento_previo';
const DECLARACION = { attributeKey: CLAVE, value: 'si', observedAt: '2026-11-05' } as const;
const FARMACO_EXPERIMENTAL = {
  setting: 'otro',
  regimenName: 'Fármaco experimental X',
  ongoing: false,
  endReason: 'desconocido',
} as const;

let escenario: EscenarioDeRegistroManual;

beforeAll(async () => {
  escenario = await iniciarEscenarioDeRegistroManual('rc_declaracion', ESPACIO_DE_IDS);
});
afterAll(() => escenario.cerrar());

/** Mama en estadio IV sin tratamientos previos ni declaración. */
async function mamaSinTratamientos(): Promise<PacienteSembrado> {
  const paciente = await nuevoPaciente(escenario.siembra);
  await sembrarDiagnostico(paciente, {
    cancerType: 'mama',
    histology: 'carcinoma ductal infiltrante',
    grade: '2',
    stagingSystem: 'TNM_8',
    stageValue: 'IV',
    performanceValue: 1,
  });
  return paciente;
}

type Opciones = Parameters<typeof montarRegistroClinico>[1];

function declarar(
  patientId: string,
  cookie: string = escenario.cookieDoctor,
  opciones: Opciones = {},
  mundo = escenario.mundo,
) {
  const { app, logger } = montarRegistroClinico(mundo, opciones);
  const peticion = clienteVerificado(app)
    .post(`/platform/patients/${patientId}/clinical-attributes`)
    .set('Cookie', cookie)
    .send(DECLARACION);
  return peticion.then((respuesta) => ({ respuesta, logger }));
}

function registrarTratamiento(patientId: string, opciones: Opciones = {}, mundo = escenario.mundo) {
  const { app, logger } = montarRegistroClinico(mundo, opciones);
  return clienteVerificado(app)
    .post(`/platform/patients/${patientId}/prior-treatments`)
    .set('Cookie', escenario.cookieDoctor)
    .send(FARMACO_EXPERIMENTAL)
    .then((respuesta) => ({ respuesta, logger }));
}

/** Estados de revisión de las declaraciones del paciente, vigentes o no (la historia se conserva, RN-05/RN-07). */
async function estadosDeLasDeclaraciones(patientId: string): Promise<string[]> {
  const { rows } = await escenario.mundo.cliente.query<{ review_status: string }>(
    `SELECT review_status::text AS review_status FROM clinical.clinical_attribute
      WHERE patient_id = $1 AND attribute_key = $2 ORDER BY id`,
    [patientId, CLAVE],
  );
  return rows.map((fila) => fila.review_status);
}

async function tratamientosVigentes(patientId: string): Promise<number> {
  const { rows } = await escenario.mundo.cliente.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM clinical.prior_treatment
      WHERE patient_id = $1 AND review_status NOT IN ('rechazado', 'reemplazado')`,
    [patientId],
  );
  return rows[0]?.n ?? 0;
}

/** Cada transacción abre su PROPIA conexión (como el Pool de producción): para probar el bloqueo entre peticiones. */
function fuenteIndependiente(): FuenteDeConexiones {
  return {
    connect: async () => {
      const cliente = await conectar(escenario.mundo.base.url);
      return {
        query: (sql, valores) => cliente.query(sql, valores),
        release: () => void cliente.end(),
      };
    },
  };
}

describe('declaración de ausencia de tratamiento previo', () => {
  it('registra la declaración manual verificada y no crea ninguna fila PriorTreatment cuando el paciente no tiene tratamientos [AC-04.1]', async () => {
    const paciente = await mamaSinTratamientos();

    const { respuesta } = await declarar(paciente.patientId);

    expect(respuesta.status).toBe(201);
    expect(respuesta.body).toMatchObject({
      key: CLAVE,
      value: 'si',
      observedAt: '2026-11-05',
      datePrecision: 'dia',
      provenance: { entryMethod: 'manual', reviewStatus: 'verificado', sourceDocumentId: null },
    });
    expect(await estadosDeLasDeclaraciones(paciente.patientId)).toEqual(['verificado']);
    expect(await contarTratamientos(escenario.mundo.cliente, paciente.patientId)).toBe(0);
  });

  it('responde 201 y deja la declaración reemplazada con su fila conservada cuando se registra un tratamiento [RN-07] [RN-08]', async () => {
    const paciente = await mamaSinTratamientos();
    await sembrarAtributo(paciente, { key: CLAVE, value: 'si', reviewStatus: 'verificado' });

    const { respuesta } = await registrarTratamiento(paciente.patientId);

    expect(respuesta.status).toBe(201);
    expect(await estadosDeLasDeclaraciones(paciente.patientId)).toEqual(['reemplazado']);
    expect(await tratamientosVigentes(paciente.patientId)).toBe(1);
  });

  it('reemplaza todas las declaraciones vigentes cuando se registra un tratamiento tras declarar dos veces', async () => {
    const paciente = await mamaSinTratamientos();
    await sembrarAtributo(paciente, { key: CLAVE, value: 'si', reviewStatus: 'verificado' });
    await sembrarAtributo(paciente, { key: CLAVE, value: 'si', reviewStatus: 'verificado' });

    const { respuesta } = await registrarTratamiento(paciente.patientId);

    expect(respuesta.status).toBe(201);
    expect(await estadosDeLasDeclaraciones(paciente.patientId)).toEqual([
      'reemplazado',
      'reemplazado',
    ]);
  });

  it('deja la declaración vigente y el tratamiento sin crear cuando el registro del tratamiento falla [RN-08]', async () => {
    const paciente = await mamaSinTratamientos();
    await sembrarAtributo(paciente, { key: CLAVE, value: 'si', reviewStatus: 'verificado' });
    const ajeno = await mamaSinTratamientos();
    await sembrarTratamientoPrevio(ajeno, {
      regimen: 'Régimen sintético',
      reviewStatus: 'verificado',
    });
    const { rows } = await escenario.mundo.cliente.query<{ id: string }>(
      'SELECT id FROM clinical.prior_treatment WHERE patient_id = $1',
      [ajeno.patientId],
    );
    const idOcupado = rows[0]?.id as string;

    // El generador de ids devuelve uno ya usado: el INSERT del tratamiento viola la clave primaria tras el reemplazo.
    const { respuesta } = await registrarTratamiento(
      paciente.patientId,
      {},
      {
        ...escenario.mundo,
        ids: () => idOcupado,
      },
    );

    expect(respuesta.status).toBe(500);
    expect(await estadosDeLasDeclaraciones(paciente.patientId)).toEqual(['verificado']);
    expect(await contarTratamientos(escenario.mundo.cliente, paciente.patientId)).toBe(0);
  });

  it('responde 422 CUERPO_INVALIDO con field attributeKey y no escribe nada cuando hay un tratamiento vigente [RN-08]', async () => {
    const paciente = await mamaSinTratamientos();
    await sembrarTratamientoPrevio(paciente, {
      regimen: 'Régimen sintético',
      reviewStatus: 'verificado',
    });
    const antes = await contarAtributos(escenario.mundo.cliente, paciente.patientId);

    const { respuesta } = await declarar(paciente.patientId);

    expect(respuesta.status).toBe(422);
    expect(respuesta.body).toMatchObject({ error: 'CUERPO_INVALIDO', field: 'attributeKey' });
    expect(JSON.stringify(respuesta.body)).not.toMatch(/Régimen sintético|sin_tratamiento/);
    expect(await contarAtributos(escenario.mundo.cliente, paciente.patientId)).toBe(antes);
    expect(await tratamientosVigentes(paciente.patientId)).toBe(1);
  });

  it('registra la declaración cuando los únicos tratamientos están rechazados o reemplazados [RN-07]', async () => {
    const paciente = await mamaSinTratamientos();
    await sembrarTratamientoPrevio(paciente, { regimen: 'Régimen uno', reviewStatus: 'rechazado' });
    await sembrarTratamientoPrevio(paciente, {
      regimen: 'Régimen dos',
      reviewStatus: 'reemplazado',
    });

    const { respuesta } = await declarar(paciente.patientId);

    expect(respuesta.status).toBe(201);
    expect(await estadosDeLasDeclaraciones(paciente.patientId)).toEqual(['verificado']);
  });

  it('responde 422 PACIENTE_EGRESADO y no escribe cuando el paciente está egresado [RN-17]', async () => {
    const egresado = await sembrarEgresado(escenario.siembra);

    const { respuesta } = await declarar(egresado.patientId);

    expect(respuesta.status).toBe(422);
    expect(respuesta.body.error).toBe('PACIENTE_EGRESADO');
    expect(await estadosDeLasDeclaraciones(egresado.patientId)).toEqual([]);
  });

  it('responde 403 y no escribe cuando quien declara es admin [PRD §11 #2]', async () => {
    const paciente = await mamaSinTratamientos();

    const { respuesta } = await declarar(paciente.patientId, escenario.cookieAdmin);

    expect(respuesta.status).toBe(403);
    expect(await estadosDeLasDeclaraciones(paciente.patientId)).toEqual([]);
  });

  it('nunca deja una declaración y un tratamiento vigentes a la vez cuando llegan dos peticiones concurrentes', async () => {
    const paciente = await mamaSinTratamientos();
    const fuente = fuenteIndependiente();

    const [declaracion, tratamiento] = await Promise.all([
      declarar(paciente.patientId, escenario.cookieDoctor, { fuente }),
      registrarTratamiento(paciente.patientId, { fuente }),
    ]);

    expect(tratamiento.respuesta.status).toBe(201);
    expect([201, 422]).toContain(declaracion.respuesta.status);
    if (declaracion.respuesta.status === 422) {
      expect(declaracion.respuesta.body).toMatchObject({
        error: 'CUERPO_INVALIDO',
        field: 'attributeKey',
      });
    }
    const vigentes = (await estadosDeLasDeclaraciones(paciente.patientId)).filter(
      (estado) => estado !== 'reemplazado' && estado !== 'rechazado',
    );
    expect(vigentes).toEqual([]);
    expect(await tratamientosVigentes(paciente.patientId)).toBe(1);
  });

  it('lista la declaración vigente y no deja valores clínicos en el log cuando se registra [AC-04.1]', async () => {
    const paciente = await mamaSinTratamientos();

    const { logger } = await declarar(paciente.patientId);
    const { app } = montarRegistroClinico(escenario.mundo);
    const lista = await clienteVerificado(app)
      .get(`/platform/patients/${paciente.patientId}/clinical-attributes`)
      .set('Cookie', escenario.cookieDoctor);

    expect(lista.status).toBe(200);
    expect(lista.body.items).toContainEqual(expect.objectContaining({ key: CLAVE, value: 'si' }));
    const lineasDeLog = logger.texto();
    expect(lineasDeLog).not.toContain(CLAVE);
    expect(lineasDeLog).not.toContain('2026-11-05');
  });
});
