import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sembrarPCaso, type PCasoSembrado } from '../../support/caso.js';
import { montarCaso } from '../../support/caso-http.js';
import { prepararSiembra, type ContextoDeSiembra } from '../../support/completitud.js';
import { generadorDeIds } from '../../support/filas-sinteticas.js';
import { abrirSesion, prepararMundoConSeed, type MundoDeGateway } from '../../support/gateway.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';

const ESPACIO_DE_IDS = 7402;

let mundo: MundoDeGateway;
let siembra: ContextoDeSiembra;
let cookieDoctor: string;

beforeAll(async () => {
  mundo = await prepararMundoConSeed('caso_timeline', ESPACIO_DE_IDS);
  siembra = await prepararSiembra(mundo.cliente, generadorDeIds(ESPACIO_DE_IDS + 500));
  cookieDoctor = await abrirSesion(mundo, 'doc1@test.local', 'SINT-cookie-doctor-caso-tl-0001');
});
afterAll(() => mundo.cerrar());

interface EventoDeLaVista {
  id: string;
  eventType: string;
  derived: boolean;
  eventDate: string | null;
  datePrecision: string;
  description: string;
  provenance: {
    entryMethod: string;
    extractionConfidence: string;
    reviewStatus: string;
    sourceDocumentId: string | null;
  };
}

const pedirCaso = (p: PCasoSembrado) =>
  clienteVerificado(montarCaso(mundo).app)
    .get(`/platform/patients/${p.patientId}/case`)
    .set('Cookie', cookieDoctor);

describe('GET /platform/patients/{id}/case · timeline', () => {
  it('responde 200 con CaseView cuyo timeline trae los 10 eventos fechados de P-CASO en orden, con provenance y derived según el origen cuando doc1 pide /case [US-088 AC-1]', async () => {
    const p = await sembrarPCaso(siembra);

    const respuesta = await pedirCaso(p);

    expect(respuesta.status).toBe(200);
    const timeline = (respuesta.body as { timeline: EventoDeLaVista[] }).timeline;
    const fechados = timeline.filter((evento) => evento.eventDate !== null);
    expect(fechados.map((e) => [e.eventDate, e.eventType, e.description, e.derived])).toEqual([
      ['2025-10-05', 'diagnostico', 'adenocarcinoma acinar', true],
      ['2025-10-20', 'inicio_tratamiento_previo', 'Bicalutamida', true],
      ['2025-11-01', 'inicio_tratamiento_previo', 'Leuprorelina', true],
      ['2025-11-15', 'fin_tratamiento_previo', 'Bicalutamida', true],
      ['2026-01-10', 'examen', 'laboratorio', true],
      ['2026-04-12', 'examen', 'laboratorio', true],
      ['2026-07-15', 'examen', 'laboratorio', true],
      ['2026-07-20', 'progresion', 'Progresión bioquímica por PSA', false],
      ['2026-08-01', 'analisis_ia', 'Análisis de IA', true],
      ['2026-08-02', 'resumen_caso', 'Resumen del caso', true],
    ]);
    for (const evento of fechados) expect(evento.datePrecision).toBe('dia');
    expect(fechados[0]?.provenance).toEqual({
      entryMethod: 'ocr',
      extractionConfidence: 'alta',
      reviewStatus: 'verificado',
      conflict: false,
      sourceDocumentId: p.filas.documentos.d1,
      additionalSourceDocumentIds: [],
    });
    expect(fechados[1]?.provenance).toMatchObject({
      entryMethod: 'manual',
      extractionConfidence: 'n_a',
      sourceDocumentId: null,
    });
    expect(fechados[6]?.provenance).toMatchObject({
      entryMethod: 'ocr',
      reviewStatus: 'requiere_revision',
      sourceDocumentId: p.filas.documentos.d3,
    });
  });
});
