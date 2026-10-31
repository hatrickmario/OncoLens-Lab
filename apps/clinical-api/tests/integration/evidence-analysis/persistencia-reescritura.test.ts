import { clienteVerificado } from '../../support/verificarProveedor.js';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import respuestaConEvidencia from '../../../../../contracts/examples/rag-query-con-evidencia.json' with { type: 'json' };
import respuestaReescritura from '../../../../../contracts/examples/rag-query-reescritura-aplicada.json' with { type: 'json' };
import respuestaSinEvidencia from '../../../../../contracts/examples/rag-query-sin-evidencia.json' with { type: 'json' };
import {
  PREGUNTA_Q_HER2,
  TODAS_LAS_FUENTES,
  abrirSesion,
  idDePaciente,
  leerRegistroPorTrace,
  montarGateway,
  prepararMundoConSeed,
  ragSimulado,
  type EscenarioDeRag,
  type MundoDeGateway,
} from '../../support/gateway.js';

const ESPACIO_DE_IDS = 9830;
const TOKEN_DE_SESION = 'SINT-cookie-sesion-reescritura-0001';

const json = (cuerpo: object): EscenarioDeRag => ({ tipo: 'json', status: 200, cuerpo });
/** Rescatada por el segundo loop (US-238): `con_evidencia` con `queryRewrite.applied = true`. */
const RESCATADA = json(respuestaReescritura);
/** Reescrita pero sin rescate: `sin_evidencia` con `queryRewrite.applied = true` (AC-3 de US-238). */
const REESCRITA_SIN_RESCATE = json(respuestaSinEvidencia);
const SIN_REESCRITURA = json(respuestaConEvidencia);

const rag = ragSimulado();
let mundo: MundoDeGateway;
let cookie: string;

beforeAll(async () => {
  rag.iniciar();
  mundo = await prepararMundoConSeed('gw_persist_reescritura', ESPACIO_DE_IDS);
  cookie = await abrirSesion(mundo, 'doc1@test.local', TOKEN_DE_SESION);
});
beforeEach(() => rag.reiniciar());
afterEach(() => rag.reiniciar());
afterAll(async () => {
  rag.detener();
  await mundo.cerrar();
});

async function solicitarAnalisis(traceId: string, query: string = PREGUNTA_Q_HER2) {
  const { app } = await montarGateway(mundo, { traceIds: { traceId: () => traceId } });
  return clienteVerificado(app)
    .post('/platform/evidence-analyses')
    .set('Cookie', cookie)
    .send({ patientId: idDePaciente('a'), query, sourcesSelected: TODAS_LAS_FUENTES });
}

describe('persistencia de retrieval_params con queryRewrite (RN-06, US-238)', () => {
  it('persiste queryRewrite applied true y la pregunta original cuando Backend 2 rescató con el segundo loop [US-238 AC-7]', async () => {
    rag.responder(RESCATADA);

    const respuesta = await solicitarAnalisis('req_Rewrite0001');

    expect(respuesta.status).toBe(200);
    const fila = await leerRegistroPorTrace(mundo.cliente, 'req_Rewrite0001');
    const persistido = fila!['retrieval_params'] as Record<string, unknown>;
    expect(persistido['queryRewrite']).toEqual({ applied: true, reason: 'disparado' });
    expect(fila!['query_text']).toBe(PREGUNTA_Q_HER2);
  });

  it.each([
    ['con evidencia sin reescritura', SIN_REESCRITURA, { applied: false, reason: 'no_disparado' }],
    [
      'sin evidencia tras reescribir',
      REESCRITA_SIN_RESCATE,
      { applied: true, reason: 'disparado' },
    ],
  ] as const)(
    'persiste el queryRewrite recibido tal cual cuando la respuesta es %s [US-238 AC-3]',
    async (_nombre, escenario, esperado) => {
      rag.responder(escenario);
      const traceId = `req_Rewrite${esperado.reason}`;

      const respuesta = await solicitarAnalisis(traceId);

      expect(respuesta.status).toBe(200);
      const fila = await leerRegistroPorTrace(mundo.cliente, traceId);
      const persistido = fila!['retrieval_params'] as Record<string, unknown>;
      expect(persistido['queryRewrite']).toEqual(esperado);
    },
  );
});

describe('Base del análisis: sourcesConsulted.queryRewritten (D-d)', () => {
  it.each([
    ['rescate: applied true y con_evidencia', RESCATADA, true],
    ['sin reescritura: no_disparado', SIN_REESCRITURA, false],
    ['reescritura sin rescate: applied true y sin_evidencia', REESCRITA_SIN_RESCATE, false],
  ] as const)(
    'declara queryRewritten según el caso cuando hay %s [US-238 AC-1]',
    async (_nombre, escenario, esperado) => {
      rag.responder(escenario);

      const respuesta = await solicitarAnalisis(
        `req_Basew${esperado ? 'T' : 'F'}${_nombre.length}`,
      );

      expect(respuesta.status).toBe(200);
      const base = (respuesta.body as { analysisBasis: { sourcesConsulted: object } })
        .analysisBasis;
      expect(base.sourcesConsulted).toMatchObject({ queryRewritten: esperado });
      expect(JSON.stringify(respuesta.body)).not.toContain('"consulta reformulada"');
    },
  );
});

describe('regresión de US-049 con el segundo loop (RN-11)', () => {
  it('envía a rag-orchestrator la pregunta con la PII sembrada enmascarada cuando el doctor la incluye [US-238 AC-8]', async () => {
    rag.responder(RESCATADA);
    const correo = ['ana.sintetica', 'ejemplo.test'].join('@');

    await solicitarAnalisis('req_Rewrite0099', `¿Opciones para HER2 3+? Contacto ${correo}.`);

    expect(rag.llamadas()).toBe(1);
    const enviada = rag.capturadas[0]!.cuerpo['query'] as string;
    expect(enviada).not.toContain(correo);
    expect(enviada).toContain('[CORREO]');
  });
});
