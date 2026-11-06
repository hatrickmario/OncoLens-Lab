import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  nuevoPaciente,
  prepararSiembra,
  sembrarAtributo,
  sembrarDiagnostico,
  sembrarTratamientoPrevio,
  type ContextoDeSiembra,
  type PacienteSembrado,
} from '../../support/completitud.js';
import { montarCompletitud } from '../../support/completitud-http.js';
import { RUTA_CATALOGO_REAL } from '../../support/catalogo-terminologico.js';
import { generadorDeIds } from '../../support/filas-sinteticas.js';
import { abrirSesion, prepararMundoConSeed, type MundoDeGateway } from '../../support/gateway.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';

const ESPACIO_DE_IDS = 9730;

let mundo: MundoDeGateway;
let siembra: ContextoDeSiembra;
let cookieDoctor: string;

beforeAll(async () => {
  mundo = await prepararMundoConSeed('compl_declaracion', ESPACIO_DE_IDS);
  siembra = await prepararSiembra(mundo.cliente, generadorDeIds(ESPACIO_DE_IDS + 500));
  cookieDoctor = await abrirSesion(mundo, 'doc1@test.local', 'SINT-cookie-doctor-compl-decl-0001');
});
afterAll(() => mundo.cerrar());

interface ItemDeLaVista {
  item: string;
  status: string;
  origin: string;
  resolvedBy?: string;
  provenance: { entryMethod: string; reviewStatus: string; sourceDocumentId: string | null } | null;
  destination: { entity: string; field: string | null };
}

/** Mama en estadio IV sin tratamientos previos (el caso del paciente (g) de la demo): el ítem aplica y está sin dato. */
async function mamaIVSinTratamientos(): Promise<PacienteSembrado> {
  const paciente = await nuevoPaciente(siembra);
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

async function itemTratamientosPrevios(
  patientId: string,
  opciones: Parameters<typeof montarCompletitud>[1] = {},
): Promise<ItemDeLaVista> {
  const { app } = montarCompletitud(mundo, opciones);
  const respuesta = await clienteVerificado(app)
    .get(`/platform/patients/${patientId}/completeness`)
    .set('Cookie', cookieDoctor);
  expect(respuesta.status).toBe(200);
  const item = (respuesta.body as { items: ItemDeLaVista[] }).items.find(
    (candidato) => candidato.item === 'tratamientos_previos',
  );
  if (item === undefined) throw new Error('falta el ítem tratamientos_previos');
  return item;
}

async function contarTratamientos(patientId: string): Promise<number> {
  const { rows } = await mundo.cliente.query<{ n: number }>(
    'SELECT count(*)::int AS n FROM clinical.prior_treatment WHERE patient_id = $1',
    [patientId],
  );
  return rows[0]?.n ?? 0;
}

const declarar = (paciente: PacienteSembrado, reviewStatus = 'verificado') =>
  sembrarAtributo(paciente, { key: 'sin_tratamiento_previo', value: 'si', reviewStatus });

describe('declaración de ausencia de tratamiento previo en el checklist', () => {
  it('marca tratamientos_previos presente_verificado con resolvedBy declaracion_de_ausencia y sin fila PriorTreatment cuando hay una declaración vigente [AC-04.1]', async () => {
    const paciente = await mamaIVSinTratamientos();
    await declarar(paciente);

    const item = await itemTratamientosPrevios(paciente.patientId);

    expect(item).toMatchObject({
      status: 'presente_verificado',
      origin: 'seed',
      resolvedBy: 'declaracion_de_ausencia',
      provenance: { entryMethod: 'seed', reviewStatus: 'verificado', sourceDocumentId: null },
      destination: { entity: 'PriorTreatment', field: null },
    });
    expect(await contarTratamientos(paciente.patientId)).toBe(0);
  });

  it('deja tratamientos_previos faltante sin resolvedBy cuando no hay declaración ni tratamientos [AC-04.1] [RN-26]', async () => {
    const paciente = await mamaIVSinTratamientos();

    const item = await itemTratamientosPrevios(paciente.patientId);

    expect(item.status).toBe('faltante');
    expect(item).not.toHaveProperty('resolvedBy');
  });

  it('deja tratamientos_previos faltante cuando la declaración fue reemplazada [RN-07]', async () => {
    const paciente = await mamaIVSinTratamientos();
    await declarar(paciente, 'reemplazado');

    const item = await itemTratamientosPrevios(paciente.patientId);

    expect(item.status).toBe('faltante');
    expect(item).not.toHaveProperty('resolvedBy');
  });

  it('marca resolvedBy registro cuando hay un tratamiento vigente y ninguna declaración [AC-04.1]', async () => {
    const paciente = await mamaIVSinTratamientos();
    await sembrarTratamientoPrevio(paciente, {
      regimen: 'Régimen sintético',
      reviewStatus: 'verificado',
    });

    const item = await itemTratamientosPrevios(paciente.patientId);

    expect(item).toMatchObject({ status: 'presente_verificado', resolvedBy: 'registro' });
  });

  it('prefiere el registro y marca resolvedBy registro cuando coexisten un tratamiento vigente y una declaración vigente', async () => {
    const paciente = await mamaIVSinTratamientos();
    await declarar(paciente);
    await sembrarTratamientoPrevio(paciente, {
      regimen: 'Régimen sintético',
      reviewStatus: 'verificado',
    });

    const item = await itemTratamientosPrevios(paciente.patientId);

    expect(item).toMatchObject({ status: 'presente_verificado', resolvedBy: 'registro' });
  });

  it('marca presente_sin_verificar cuando la declaración vigente está en requiere_revision', async () => {
    const paciente = await mamaIVSinTratamientos();
    await declarar(paciente, 'requiere_revision');

    const item = await itemTratamientosPrevios(paciente.patientId);

    expect(item).toMatchObject({
      status: 'presente_sin_verificar',
      resolvedBy: 'declaracion_de_ausencia',
    });
  });

  it('no añade resolvedBy a los ítems que el catálogo no cumple por declaración [AC-04.1]', async () => {
    const paciente = await mamaIVSinTratamientos();
    await declarar(paciente);
    const { app } = montarCompletitud(mundo);

    const respuesta = await clienteVerificado(app)
      .get(`/platform/patients/${paciente.patientId}/completeness`)
      .set('Cookie', cookieDoctor);

    const items = (respuesta.body as { items: ItemDeLaVista[] }).items;
    const conResolvedBy = items.filter((item) => item.resolvedBy !== undefined);
    expect(conResolvedBy.map((item) => item.item)).toEqual(['tratamientos_previos']);
  });

  it.each(['mama', 'prostata'] as const)(
    'marca tratamientos_previos presente con resolvedBy declaracion_de_ausencia en %s con el catálogo real [AC-04.1] [RN-29]',
    async (cancerType) => {
      const paciente = await nuevoPaciente(siembra);
      await sembrarDiagnostico(paciente, {
        cancerType,
        histology: 'carcinoma sintético',
        grade: null,
        stagingSystem: 'TNM_8',
        stageValue: 'IV',
        performanceValue: 1,
      });
      await declarar(paciente);

      const item = await itemTratamientosPrevios(paciente.patientId, {
        rutaDelCatalogo: RUTA_CATALOGO_REAL,
      });

      expect(item).toMatchObject({
        status: 'presente_verificado',
        resolvedBy: 'declaracion_de_ausencia',
      });
    },
  );
});
