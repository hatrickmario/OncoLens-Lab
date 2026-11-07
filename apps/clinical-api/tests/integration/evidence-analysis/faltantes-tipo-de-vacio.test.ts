import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import chatTurnFaltantes from '../../../../../contracts/examples/chat-turn-faltantes.json' with { type: 'json' };
import ragCatalogoDistinto from '../../../../../contracts/examples/rag-catalog-version-mismatch.json' with { type: 'json' };
import { idSembrado } from '../../../prisma/seed/determinismo.js';
import { PACIENTE_CHAT } from '../../../prisma/seed/pacientes/chat.js';
import { PACIENTES_SEMILLA } from '../../../prisma/seed/pacientes/indice.js';
import {
  nuevoPaciente,
  prepararSiembra,
  sembrarBiomarcador,
  sembrarDiagnostico,
  type ContextoDeSiembra,
  type PacienteSembrado,
} from '../../support/completitud.js';
import { montarCompletitud } from '../../support/completitud-http.js';
import { lectorDeIdentidadFalso } from '../../support/desidentificacion.js';
import {
  IDENTIDAD_CHAT,
  abrirConversacion,
  contarTurnosDeChat,
  enviarTurno,
} from '../../support/conversacion.js';
import { generadorDeIds } from '../../support/filas-sinteticas.js';
import {
  abrirSesion,
  montarGateway,
  prepararMundoConSeed,
  ragSimulado,
  versionDelCatalogo,
  type MundoDeGateway,
} from '../../support/gateway.js';
import { RUTA_DEL_CATALOGO } from '../../support/seed.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';

/**
 * US-263 (L1D-320): el `completeness[]` que `clinical-api` envía a `/chat/turn` trae el mismo `gapType` que
 * `GET /completeness` (una regla, un dueño) y la versión 1.7.0 del catálogo se verifica con el `409` sin persistir.
 */
const ESPACIO_DE_IDS = 9516;
const PREGUNTA_DE_FALTANTES = '¿Qué información falta?';

const rag = ragSimulado();
let mundo: MundoDeGateway;
let siembra: ContextoDeSiembra;
let cookie: string;
let sinteticos: {
  psaIncompleto: PacienteSembrado;
  reSinVerificar: PacienteSembrado;
  reEnConflicto: PacienteSembrado;
};

beforeAll(async () => {
  rag.iniciar();
  mundo = await prepararMundoConSeed('gw_faltantes_tipo_de_vacio', ESPACIO_DE_IDS);
  cookie = await abrirSesion(mundo, 'doc1@test.local', 'SINT-cookie-doctor-faltantes-vacio-0001');
  siembra = await prepararSiembra(mundo.cliente, generadorDeIds(ESPACIO_DE_IDS + 500));
  sinteticos = await sembrarPacientesDeLaRegla();
});
beforeEach(() => rag.reiniciar());
afterEach(() => rag.reiniciar());
afterAll(async () => {
  rag.detener();
  await mundo.cerrar();
});

const MAMA_COMPLETA = {
  cancerType: 'mama',
  histology: 'carcinoma ductal infiltrante',
  grade: 'Nottingham grado 2',
  stagingSystem: 'TNM_8',
  stageValue: 'IIA',
  performanceValue: 1,
} as const;

/** Tres pacientes sintéticos que fijan cada rama de la regla (RE solo, RE en conflicto, PSA con un solo valor). */
async function sembrarPacientesDeLaRegla() {
  const reSinVerificar = await nuevoPaciente(siembra);
  await sembrarDiagnostico(reSinVerificar, MAMA_COMPLETA);
  await sembrarBiomarcador(reSinVerificar, {
    name: 'RE',
    value: 'positivo',
    reviewStatus: 'auto_aceptado',
  });

  const reEnConflicto = await nuevoPaciente(siembra);
  await sembrarDiagnostico(reEnConflicto, MAMA_COMPLETA);
  const anterior = await sembrarBiomarcador(reEnConflicto, {
    name: 'RE',
    value: 'positivo',
    reviewStatus: 'verificado',
    performedAt: '2026-03-01',
  });
  const posterior = await sembrarBiomarcador(reEnConflicto, {
    name: 'RE',
    value: 'negativo',
    reviewStatus: 'requiere_revision',
    performedAt: '2026-06-01',
  });
  await mundo.cliente.query('UPDATE clinical.biomarker SET conflicts_with_id = $2 WHERE id = $1', [
    posterior,
    anterior,
  ]);

  const psaIncompleto = await nuevoPaciente(siembra);
  await sembrarDiagnostico(psaIncompleto, {
    cancerType: 'prostata',
    histology: 'adenocarcinoma acinar',
    grade: null,
    stagingSystem: null,
    stageValue: null,
    performanceValue: 0,
  });
  await sembrarBiomarcador(psaIncompleto, {
    name: 'PSA',
    value: '4.1 ng/mL',
    reviewStatus: 'verificado',
    performedAt: '2026-01-10',
    examType: 'laboratorio',
  });
  return { psaIncompleto, reSinVerificar, reEnConflicto };
}

interface ItemDeLaVista {
  item: string;
  status: string;
  gapType: string | null;
}
interface ItemEnviado {
  item: string;
  status: string;
  gapType: string | null;
}

async function checklistHttp(patientId: string): Promise<ItemDeLaVista[]> {
  const { app } = montarCompletitud(mundo, { rutaDelCatalogo: RUTA_DEL_CATALOGO });
  const respuesta = await clienteVerificado(app)
    .get(`/platform/patients/${patientId}/completeness`)
    .set('Cookie', cookie);
  expect(respuesta.status).toBe(200);
  return respuesta.body.items as ItemDeLaVista[];
}

async function completenessEnviadoAlChat(patientId: string): Promise<ItemEnviado[] | null> {
  const { app } = await montarGateway(mundo, {
    identidades: lectorDeIdentidadFalso({ [patientId]: IDENTIDAD_CHAT }),
  });
  const conversationId = await abrirConversacion(app, cookie, patientId);
  rag.chat.responder({ tipo: 'json', status: 200, cuerpo: chatTurnFaltantes });
  const respuesta = await enviarTurno(app, cookie, conversationId, PREGUNTA_DE_FALTANTES);
  if (respuesta.status !== 201) return null;
  const enviado = rag.chat.capturadas.at(-1)?.cuerpo as { completeness: ItemEnviado[] };
  return enviado.completeness;
}

const tipoDe = (items: { item: string; gapType: string | null }[], clave: string) =>
  items.find((i) => i.item === clave)?.gapType;

describe('completeness[] del turno de faltantes · coherencia con /completeness (US-263)', () => {
  it('envía a Backend 2 el mismo gapType que /completeness, una sola vez por ítem y ninguno en los no_aplica, para cada paciente semilla y P-CHAT [US-263 AC-5] [AC-04.1] [S6 resp. 17]', async () => {
    const pacientes = [
      ...PACIENTES_SEMILLA.map((p) => idSembrado(p.clave)),
      idSembrado(PACIENTE_CHAT),
    ];
    let comparados = 0;
    for (const patientId of pacientes) {
      const enviado = await completenessEnviadoAlChat(patientId);
      if (enviado === null) continue; // p. ej. el paciente con opt-out de analisis_ia no genera con IA
      const vista = await checklistHttp(patientId);

      expect(enviado.map((i) => [i.item, i.gapType])).toEqual(
        vista.map((i) => [i.item, i.gapType]),
      );
      expect(new Set(enviado.map((i) => i.item)).size).toBe(enviado.length);
      expect(enviado.filter((i) => i.status === 'no_aplica').map((i) => i.gapType)).toEqual(
        enviado.filter((i) => i.status === 'no_aplica').map(() => null),
      );
      comparados += 1;
    }

    expect(comparados).toBeGreaterThanOrEqual(PACIENTES_SEMILLA.length);
  });

  it('clasifica incompleto un presente_sin_verificar sin conflicto vigente y por_conciliar el que tiene un registro vigente en requiere_revision con conflicts_with_id [US-263 AC-5] [S6 resp. 17]', async () => {
    const sinConflicto = await checklistHttp(sinteticos.reSinVerificar.patientId);
    const conConflicto = await checklistHttp(sinteticos.reEnConflicto.patientId);

    expect(sinConflicto.find((i) => i.item === 're')).toMatchObject({
      status: 'presente_sin_verificar',
      gapType: 'incompleto',
    });
    expect(conConflicto.find((i) => i.item === 're')).toMatchObject({
      status: 'presente_sin_verificar',
      gapType: 'por_conciliar',
    });
  });

  it('clasifica incompleto un faltante con menos registros vigentes que minValues y no_buscado el que no tiene ninguno [US-263 AC-5] [S6 resp. 17]', async () => {
    const items = await checklistHttp(sinteticos.psaIncompleto.patientId);

    expect(items.find((i) => i.item === 'psa_serie')).toMatchObject({
      status: 'faltante',
      gapType: 'incompleto',
    });
    // Sin ningún documento procesado, el resto de los faltantes nunca se buscó.
    expect(tipoDe(items, 'gleason_isup')).toBe('no_buscado');
  });
});

describe('versión del catálogo 1.7.0 en el turno (US-263 AC-7)', () => {
  it('envía catalogVersion 1.7.0 y responde 409 CATALOG_VERSION_MISMATCH sin guardar el turno cuando Backend 2 monta otro catálogo [US-263 AC-7] [RN-22]', async () => {
    const patientId = idSembrado(PACIENTE_CHAT);
    const { app } = await montarGateway(mundo, {
      identidades: lectorDeIdentidadFalso({ [patientId]: IDENTIDAD_CHAT }),
    });
    const conversationId = await abrirConversacion(app, cookie, patientId);
    rag.chat.responder({ tipo: 'json', status: 409, cuerpo: ragCatalogoDistinto });

    const respuesta = await enviarTurno(app, cookie, conversationId, PREGUNTA_DE_FALTANTES);

    expect(versionDelCatalogo()).toBe('1.7.0');
    expect(rag.chat.capturadas[0]?.cuerpo['catalogVersion']).toBe('1.7.0');
    expect(respuesta.status).toBe(409);
    expect(respuesta.body.error).toBe('CATALOG_VERSION_MISMATCH');
    expect(await contarTurnosDeChat(mundo.cliente, conversationId)).toBe(0);
  });
});
