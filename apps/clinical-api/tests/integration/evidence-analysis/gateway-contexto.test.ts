import { jwtVerify } from 'jose';
import { clienteVerificado } from '../../support/verificarProveedor.js';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { assertMatchesSpec } from '../../../../../scripts/contracts/lib/responseValidator.mjs';
import {
  AHORA,
  PREGUNTA_AC1,
  TODAS_LAS_FUENTES,
  TRACE_ID_GENERADO,
  abrirSesion,
  idDePaciente,
  leerRegistroPorTrace,
  montarGateway,
  prepararMundoConSeed,
  ragSimulado,
  versionDelCatalogo,
  type MundoDeGateway,
} from '../../support/gateway.js';
import { FX_T4A_A } from '../../support/identidad.js';

const ESPACIO_DE_IDS = 201;
const TOKEN_DE_SESION = 'SINT-cookie-sesion-contexto-0001';
const PUNTERO_REQUEST_INTERNO = '#/components/schemas/RagQueryInternalRequest';
const PUNTERO_CONTEXTO = '#/components/schemas/ClinicalContext';

const rag = ragSimulado();
let mundo: MundoDeGateway;
let cookie: string;

beforeAll(async () => {
  rag.iniciar();
  mundo = await prepararMundoConSeed('gw_contexto', ESPACIO_DE_IDS);
  cookie = await abrirSesion(mundo, 'doc1@test.local', TOKEN_DE_SESION);
});
beforeEach(() => rag.reiniciar());
afterEach(() => rag.reiniciar());
afterAll(async () => {
  rag.detener();
  await mundo.cerrar();
});

const cuerpoDelAnalisis = (extra: Record<string, unknown> = {}) => ({
  patientId: idDePaciente('b'),
  query: PREGUNTA_AC1,
  sourcesSelected: TODAS_LAS_FUENTES,
  ...extra,
});

describe('gateway de análisis: request interno hacia rag-orchestrator', () => {
  it('envía traceId, query, sourcesSelected, dataClassification sintetico, catalogVersion, maxOptions 1 y un clinicalContext con diagnóstico de próstata, grupo ISUP, ADT y progresión cuando doc1 pregunta por el paciente semilla (b) [US-052 AC-1]', async () => {
    const { app } = await montarGateway(mundo);

    await clienteVerificado(app)
      .post('/platform/evidence-analyses')
      .set('Cookie', cookie)
      .send(cuerpoDelAnalisis());

    expect(rag.llamadas()).toBe(1);
    const enviado = rag.capturadas[0]!.cuerpo as {
      clinicalContext: {
        diagnosis: { cancerType: string; grade: string };
        priorTreatments: { regimenName: string }[];
        events: { eventType: string }[];
      };
    };
    assertMatchesSpec('rag-orchestrator', PUNTERO_REQUEST_INTERNO, enviado);
    expect(enviado).toMatchObject({
      traceId: TRACE_ID_GENERADO,
      query: PREGUNTA_AC1,
      sourcesSelected: TODAS_LAS_FUENTES,
      dataClassification: 'sintetico',
      catalogVersion: versionDelCatalogo(),
      maxOptions: 1,
    });
    expect(enviado.clinicalContext.diagnosis.cancerType).toBe('prostata');
    expect(enviado.clinicalContext.diagnosis.grade).toContain('ISUP 3');
    expect(enviado.clinicalContext.priorTreatments.map((t) => t.regimenName)).toEqual([
      'Deprivación androgénica',
    ]);
    expect(enviado.clinicalContext.events.map((e) => e.eventType)).toContain('progresion');
  });

  it('envía Authorization Bearer verificable y ninguna cabecera Cookie hacia /rag/query cuando doc1 solicita un análisis con su cookie de sesión [US-054 AC-4]', async () => {
    const { app, clavePublica } = await montarGateway(mundo);

    await clienteVerificado(app)
      .post('/platform/evidence-analyses')
      .set('Cookie', cookie)
      .send(cuerpoDelAnalisis());

    expect(rag.llamadas()).toBe(1);
    const { headers } = rag.capturadas[0]!;
    const autorizacion = headers.get('authorization') ?? '';
    expect(autorizacion).toMatch(/^Bearer /);
    await jwtVerify(autorizacion.slice('Bearer '.length), clavePublica, {
      algorithms: ['ES256'],
      issuer: 'clinical-api',
      audience: 'rag-orchestrator',
      currentDate: new Date(AHORA),
    });
    expect(headers.has('cookie')).toBe(false);
    for (const [nombre, valor] of headers) {
      expect(`${nombre}: ${valor}`, nombre).not.toContain(TOKEN_DE_SESION);
    }
  });

  it('el clinicalContext valida contra ClinicalContext con additionalProperties false y no contiene patientId, identification, birthYear, agreementReference ni sourceDataset [US-052 AC-4]', async () => {
    const { app } = await montarGateway(mundo);

    await clienteVerificado(app)
      .post('/platform/evidence-analyses')
      .set('Cookie', cookie)
      .send(cuerpoDelAnalisis());

    expect(rag.llamadas()).toBe(1);
    const { cuerpo, texto } = rag.capturadas[0]!;
    const contexto = cuerpo['clinicalContext'] as Record<string, unknown>;
    assertMatchesSpec('rag-orchestrator', PUNTERO_CONTEXTO, contexto);
    for (const prohibido of [
      'patientId',
      'identification',
      'birthYear',
      'agreementReference',
      'sourceDataset',
      idDePaciente('b'),
    ]) {
      expect(texto, prohibido).not.toContain(prohibido);
    }
    for (const lista of [
      'clinicalNotes',
      'biomarkerTrends',
      'missingCriticalData',
      'priorAnalyses',
    ]) {
      expect(contexto[lista], lista).toEqual([]);
    }
  });

  it('reenvía ultimosSeisMeses true sin cambiar el clinicalContext respecto del AC-1 [US-052 AC-5]', async () => {
    const { app } = await montarGateway(mundo);
    const enviar = (extra: Record<string, unknown>) =>
      clienteVerificado(app)
        .post('/platform/evidence-analyses')
        .set('Cookie', cookie)
        .send(cuerpoDelAnalisis(extra));

    await enviar({});
    await enviar({ filtersApplied: { ultimosSeisMeses: true } });

    expect(rag.llamadas()).toBe(2);
    const [base, conFiltro] = rag.capturadas.map(({ cuerpo }) => cuerpo) as [
      { clinicalContext: Record<string, unknown>; filtersApplied: unknown },
      { clinicalContext: Record<string, unknown>; filtersApplied: unknown },
    ];
    // Distintos solo en el seudónimo, que es aleatorio por consulta (RN-11).
    const { pseudoPatientId: seudonimoBase, ...contextoBase } = base.clinicalContext;
    const { pseudoPatientId: seudonimoConFiltro, ...contextoConFiltro } = conFiltro.clinicalContext;
    expect(contextoConFiltro).toEqual(contextoBase);
    expect(seudonimoConFiltro).not.toBe(seudonimoBase);
    expect(conFiltro.filtersApplied).toEqual({
      historiaCompleta: false,
      soloBiomarcadoresRelevantes: false,
      ultimosSeisMeses: true,
      antecedentesFamiliares: false,
      publishedFromYear: 2016,
    });
    assertMatchesSpec('rag-orchestrator', PUNTERO_REQUEST_INTERNO, conFiltro);
  });
});

describe('gateway de análisis: los filtros recibidos quedan persistidos', () => {
  it('responde 200 y persiste filters_applied con ultimosSeisMeses en true cuando la petición trae el filtro [US-052 AC-5]', async () => {
    const { app } = await montarGateway(mundo, { traceIds: { traceId: () => 'req_Filtros0001' } });

    const respuesta = await clienteVerificado(app)
      .post('/platform/evidence-analyses')
      .set('Cookie', cookie)
      .send(cuerpoDelAnalisis({ filtersApplied: { ultimosSeisMeses: true } }));

    expect(respuesta.status).toBe(200);
    const fila = await leerRegistroPorTrace(mundo.cliente, 'req_Filtros0001');
    expect(fila).toBeDefined();
    expect(fila!.id).toBe(respuesta.body.id);
    expect(fila!.filters_applied).toMatchObject({ ultimosSeisMeses: true });
  });
});

describe('gateway de análisis: el traceId lo genera siempre clinical-api', () => {
  const PII_EN_LA_CABECERA = `Lucía Rondón ${FX_T4A_A.numeroDeDocumento}`;

  it('envía y responde el traceId generado y no registra el X-Trace-Id entrante cuando este contiene PII sembrada [US-052 AC-1]', async () => {
    const { app, logger } = await montarGateway(mundo);

    const respuesta = await clienteVerificado(app)
      .post('/platform/evidence-analyses')
      .set('Cookie', cookie)
      .set('X-Trace-Id', PII_EN_LA_CABECERA)
      .send(cuerpoDelAnalisis());

    expect(rag.llamadas()).toBe(1);
    const capturada = rag.capturadas[0]!;
    expect(capturada.cuerpo['traceId']).toBe(TRACE_ID_GENERADO);
    const todoLoEnviado = `${capturada.texto}\n${[...capturada.headers].join('\n')}`;
    for (const pii of ['Lucía', 'Rondón', FX_T4A_A.numeroDeDocumento]) {
      expect(todoLoEnviado, pii).not.toContain(pii);
      expect(JSON.stringify(respuesta.body), pii).not.toContain(pii);
      expect(logger.texto(), pii).not.toContain(pii);
    }
    expect(respuesta.body.traceId).toBe(TRACE_ID_GENERADO);
    expect(respuesta.status).toBe(200);
    expect(logger.texto()).not.toContain('traceIdEntrante');
  });

  it('registra traceIdEntrante solo en el log cuando el X-Trace-Id entrante cumple el patrón [US-052 AC-1]', async () => {
    const { app, logger } = await montarGateway(mundo);

    const respuesta = await clienteVerificado(app)
      .post('/platform/evidence-analyses')
      .set('Cookie', cookie)
      .set('X-Trace-Id', 'req_Entrante01')
      .send(cuerpoDelAnalisis());

    expect(rag.llamadas()).toBe(1);
    const capturada = rag.capturadas[0]!;
    expect(capturada.cuerpo['traceId']).toBe(TRACE_ID_GENERADO);
    expect(respuesta.body.traceId).toBe(TRACE_ID_GENERADO);
    expect(`${capturada.texto}\n${[...capturada.headers].join('\n')}`).not.toContain(
      'req_Entrante01',
    );
    expect(JSON.stringify(respuesta.body)).not.toContain('req_Entrante01');
    expect(logger.lineas).toContainEqual(
      expect.objectContaining({ traceId: TRACE_ID_GENERADO, traceIdEntrante: 'req_Entrante01' }),
    );
  });
});
