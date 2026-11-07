import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import chatTurnCasoConflicto from '../../../../../contracts/examples/chat-turn-caso-conflicto.json' with { type: 'json' };
import chatTurnCasoOk from '../../../../../contracts/examples/chat-turn-caso-ok.json' with { type: 'json' };
import { idSembrado } from '../../../prisma/seed/determinismo.js';
import { PACIENTE_CHAT } from '../../../prisma/seed/pacientes/chat.js';
import { lectorDeIdentidadFalso } from '../../support/desidentificacion.js';
import { IDENTIDAD_CHAT, abrirConversacion, enviarTurno } from '../../support/conversacion.js';
import {
  abrirSesion,
  montarGateway,
  prepararMundoConSeed,
  ragSimulado,
  type MundoDeGateway,
} from '../../support/gateway.js';

/**
 * Datos en conflicto y corregidos en el chat (L1D-319, US-262, RN-08, AC-T3.2, ADR-50): Backend 1 marca cada par con el
 * `factRef` de su contraparte y los corregidos con `corrected` y el sufijo «(corregido)»; Backend 2 compone el bloque
 * `conflicto` (ejemplo del contrato) y Backend 1 enlaza cada `factRef` a su registro. El turno nunca escribe en `clinical.*`.
 */
const ESPACIO_DE_IDS = 9831;
const TOKEN_DE_SESION = 'SINT-cookie-sesion-conversacion-conflictos-0001';
const PREGUNTA_CONTRADICCIONES = '¿Hay contradicciones en el expediente?';
const PREGUNTA_HER2 = '¿Cuál es el HER2 de la paciente?';
const TABLAS_CLINICAS = [
  'diagnosis',
  'biomarker',
  'exam',
  'prior_treatment',
  'clinical_event',
  'clinical_attribute',
  'clinical_note',
] as const;

interface HechoEnviado {
  factRef: string;
  kind: string;
  verbalization: string;
  relativeDay: number | null;
  reviewStatus: string;
  conflictWith?: string;
  corrected?: boolean;
}

interface EnlaceDevuelto {
  factRef: string;
  resourceType: string;
  resourceId: string;
  relativeDay: number | null;
  recordedDate: string | null;
}

const rag = ragSimulado();
let mundo: MundoDeGateway;
let cookie: string;
const pacienteChat = idSembrado(PACIENTE_CHAT);
const idDelPaciente = (clave: string): string => idSembrado(`${PACIENTE_CHAT}/${clave}`);

beforeAll(async () => {
  rag.iniciar();
  mundo = await prepararMundoConSeed('gw_conversacion_conflictos', ESPACIO_DE_IDS);
  cookie = await abrirSesion(mundo, 'doc1@test.local', TOKEN_DE_SESION);
});
beforeEach(() => rag.reiniciar());
afterEach(() => rag.reiniciar());
afterAll(async () => {
  rag.detener();
  await mundo.cerrar();
});

async function abrirChatDelPacienteChat() {
  const { app } = await montarGateway(mundo, {
    identidades: lectorDeIdentidadFalso({ [pacienteChat]: IDENTIDAD_CHAT }),
  });
  const conversationId = await abrirConversacion(app, cookie, pacienteChat);
  return { app, conversationId };
}

const hechosEnviados = (): HechoEnviado[] =>
  (rag.chat.capturadas.at(-1)?.cuerpo as { caseFacts: HechoEnviado[] }).caseFacts;

/** Instantánea de lo que un turno no puede cambiar (AC-5): estados, vínculos de conflicto y de corrección, y el conteo. */
async function instantaneaDelExpediente() {
  const consulta = async (sql: string) =>
    (await mundo.cliente.query(sql, [pacienteChat])).rows as Record<string, unknown>[];
  const conteos = Object.fromEntries(
    await Promise.all(
      TABLAS_CLINICAS.map(async (tabla) => {
        const [fila] = await consulta(
          `SELECT count(*)::int AS n FROM clinical.${tabla} WHERE ${
            tabla === 'biomarker'
              ? 'exam_id IN (SELECT id FROM clinical.exam WHERE patient_id = $1)'
              : 'patient_id = $1'
          }`,
        );
        return [tabla, fila?.['n']] as const;
      }),
    ),
  );
  return {
    conteos,
    diagnosticos: await consulta(
      `SELECT id, review_status::text AS review_status, conflicts_with_id FROM clinical.diagnosis
        WHERE patient_id = $1 ORDER BY id`,
    ),
    biomarcadores: await consulta(
      `SELECT b.id, b.review_status::text AS review_status, b.conflicts_with_id, b.supersedes_id
         FROM clinical.biomarker b JOIN clinical.exam e ON e.id = b.exam_id
        WHERE e.patient_id = $1 ORDER BY b.id`,
    ),
  };
}

describe('Contradicciones de P-CHAT en el chat', () => {
  it('devuelve un bloque conflicto con Por conciliar, IIA e IIB y un ConversationDataLink por cada factRef cuando se pregunta por contradicciones [US-262 AC-1] [RN-08] [S6-prompt §2.A]', async () => {
    const { app, conversationId } = await abrirChatDelPacienteChat();
    rag.chat.responder({ tipo: 'json', status: 200, cuerpo: chatTurnCasoConflicto });

    const respuesta = await enviarTurno(app, cookie, conversationId, PREGUNTA_CONTRADICCIONES);

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.blocks).toEqual(chatTurnCasoConflicto.blocks);
    const [bloque] = respuesta.body.blocks as { kind: string; text: string; factRefs: string[] }[];
    expect(bloque).toMatchObject({ kind: 'conflicto' });
    expect(bloque?.text).toContain('Por conciliar');
    expect(bloque?.text).toContain('IIA');
    expect(bloque?.text).toContain('IIB');
    const enlaces = respuesta.body.dataLinks as EnlaceDevuelto[];
    expect(enlaces.map((e) => e.factRef).sort()).toEqual([...(bloque?.factRefs ?? [])].sort());
    expect(enlaces).toEqual([
      expect.objectContaining({
        resourceType: 'diagnosis',
        resourceId: idDelPaciente('diagnostico-iia'),
        relativeDay: 0,
      }),
      expect.objectContaining({
        resourceType: 'diagnosis',
        resourceId: idDelPaciente('diagnostico-iib'),
        relativeDay: 10,
      }),
    ]);
    for (const enlace of enlaces) expect(enlace.recordedDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('marca cada par de hechos en conflicto con el factRef de su contraparte en el cuerpo hacia /chat/turn [US-262 AC-1] [RN-08]', async () => {
    const { app, conversationId } = await abrirChatDelPacienteChat();
    rag.chat.responder({ tipo: 'json', status: 200, cuerpo: chatTurnCasoConflicto });

    await enviarTurno(app, cookie, conversationId, PREGUNTA_CONTRADICCIONES);

    const hechos = hechosEnviados();
    const iia = hechos.find((h) => h.verbalization.includes('estadio IIA'));
    const iib = hechos.find((h) => h.verbalization.includes('estadio IIB'));
    expect(iia).toMatchObject({ reviewStatus: 'verificado', conflictWith: iib?.factRef });
    expect(iib).toMatchObject({ reviewStatus: 'requiere_revision', conflictWith: iia?.factRef });
    expect(hechos.filter((h) => h.conflictWith !== undefined)).toHaveLength(2);
  });
});

describe('Dato corregido de P-CHAT en el chat', () => {
  it('marca el HER2 3+ con corrected y la marca (corregido), lo enlaza sin historyPath y no envía el 2+ cuando se pregunta por el HER2 [US-262 AC-3] [ADR-50] [RN-07] [AC-02.6]', async () => {
    const { app, conversationId } = await abrirChatDelPacienteChat();
    await enviarTurno(app, cookie, conversationId, PREGUNTA_HER2);
    const her2 = hechosEnviados().find((h) => h.verbalization.startsWith('HER2'));
    expect(her2).toMatchObject({
      verbalization: 'HER2: 3+, relevante (corregido)',
      corrected: true,
    });
    expect(JSON.stringify(rag.chat.capturadas.at(-1)?.cuerpo)).not.toContain('2+');
    rag.chat.responder({
      tipo: 'json',
      status: 200,
      cuerpo: {
        ...chatTurnCasoOk,
        blocks: [{ kind: 'documentado', text: her2?.verbalization, factRefs: [her2?.factRef] }],
      },
    });

    const respuesta = await enviarTurno(app, cookie, conversationId, PREGUNTA_HER2);

    expect(respuesta.status).toBe(201);
    expect(respuesta.body.blocks[0].text).toContain('3+');
    expect(respuesta.body.blocks[0].text).toContain('(corregido)');
    expect(respuesta.body.dataLinks).toEqual([
      expect.objectContaining({
        factRef: her2?.factRef,
        resourceType: 'biomarker',
        resourceId: idDelPaciente('her2-3mas'),
      }),
    ]);
    expect(respuesta.body.dataLinks[0]).not.toHaveProperty('historyPath');
    expect(JSON.stringify(respuesta.body)).not.toContain('historyPath');
  });
});

describe('Solo lectura del turno', () => {
  it('deja iguales review_status, conflicts_with_id y supersedes_id de P-CHAT tras los turnos de contradicciones y de CHAT-CONFLICTO-RESUELVE [US-262 AC-5] [AC-T3.2] [S6-prompt §3]', async () => {
    const { app, conversationId } = await abrirChatDelPacienteChat();
    const antes = await instantaneaDelExpediente();
    rag.chat.responder({ tipo: 'json', status: 200, cuerpo: chatTurnCasoConflicto });
    const contradicciones = await enviarTurno(
      app,
      cookie,
      conversationId,
      PREGUNTA_CONTRADICCIONES,
    );
    rag.chat.responder({
      tipo: 'json',
      status: 200,
      cuerpo: {
        ...chatTurnCasoOk,
        blocks: [
          {
            kind: 'limitacion',
            text: 'No se encontró información documentada sobre lo preguntado en el expediente',
          },
        ],
        omittedClaims: 1,
      },
    });

    const resuelve = await enviarTurno(
      app,
      cookie,
      conversationId,
      '¿Cuál es el estadio correcto de la paciente?',
    );

    expect([contradicciones.status, resuelve.status]).toEqual([201, 201]);
    expect(await instantaneaDelExpediente()).toEqual(antes);
  });
});
