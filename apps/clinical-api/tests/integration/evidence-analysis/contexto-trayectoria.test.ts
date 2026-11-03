import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { assertMatchesSpec } from '../../../../../scripts/contracts/lib/responseValidator.mjs';
import { sembrarPCaso, type PCasoSembrado } from '../../support/caso.js';
import {
  sembrarPacienteSinTrayectoria,
  sembrarRespuestaIncierta,
  sembrarTratamientoYAtributoReemplazados,
} from '../../support/caso-trayectoria.js';
import { prepararSiembra, type ContextoDeSiembra } from '../../support/completitud.js';
import { generadorDeIds } from '../../support/filas-sinteticas.js';
import {
  PREGUNTA_Q_HER2,
  TODAS_LAS_FUENTES,
  abrirSesion,
  leerRegistroPorTrace,
  montarGateway,
  prepararMundoConSeed,
  ragSimulado,
  type MundoDeGateway,
} from '../../support/gateway.js';
import { traceIdsFijos } from '../../support/usuarios.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';

const ESPACIO_DE_IDS = 7405;
const ESPACIO_DE_PCASO_BASE = 7430;
const PUNTERO_CONTEXTO = '#/components/schemas/ClinicalContext';

interface Procedencia {
  entryMethod: string;
  extractionConfidence: string | null;
  reviewStatus: string;
  conflict: boolean;
}
interface ContextoDeLaTrayectoria {
  biomarkers: { biomarkerName: string; value: string; provenance: Procedencia }[];
  events: {
    dataRef: string;
    eventType: string;
    monthsAgo: number | null;
    provenance: Procedencia;
  }[];
  priorTreatments: {
    dataRef: string;
    lineNumber: number | null;
    regimenName: string;
    atcCodes: string[];
    monthsSinceStart: number | null;
    provenance: Procedencia;
  }[];
  attributes: { dataRef: string; provenance: Procedencia }[];
  currentLine: number | null;
  biomarkerTrends: unknown[];
}

const generadorDeTraza = traceIdsFijos();
const rag = ragSimulado();
let mundo: MundoDeGateway;
let siembra: ContextoDeSiembra;
let cookie: string;
let siguienteEspacioDePCaso = ESPACIO_DE_PCASO_BASE;

beforeAll(async () => {
  rag.iniciar();
  mundo = await prepararMundoConSeed('gw_contexto_trayectoria', ESPACIO_DE_IDS);
  siembra = await prepararSiembra(mundo.cliente, generadorDeIds(ESPACIO_DE_IDS + 500));
  cookie = await abrirSesion(mundo, 'doc1@test.local', 'SINT-cookie-sesion-trayectoria-0001');
});
beforeEach(() => rag.reiniciar());
afterEach(() => rag.reiniciar());
afterAll(async () => {
  rag.detener();
  await mundo.cerrar();
});

const pCaso = () => sembrarPCaso(siembra, { espacio: siguienteEspacioDePCaso++ });

/** Doc1 analiza al paciente: el contexto enviado a Backend 2 y el `dataRef` → fila que quedó persistido. */
async function analizar(
  patientId: string,
): Promise<{ contexto: ContextoDeLaTrayectoria; filaDe: (dataRef: string) => string | undefined }> {
  const traceId = generadorDeTraza();
  const { app } = await montarGateway(mundo, { traceIds: { traceId: () => traceId } });
  const respuesta = await clienteVerificado(app)
    .post('/platform/evidence-analyses')
    .set('Cookie', cookie)
    .send({ patientId, query: PREGUNTA_Q_HER2, sourcesSelected: TODAS_LAS_FUENTES });
  expect(respuesta.status).toBe(200);
  const contexto = rag.capturadas[0]!.cuerpo['clinicalContext'] as ContextoDeLaTrayectoria;
  const registro = await leerRegistroPorTrace(mundo.cliente, traceId);
  return {
    contexto,
    filaDe: (dataRef) =>
      registro?.patient_data_links.find((enlace) => enlace.dataRef === dataRef)?.entityId,
  };
}

const tipos = (contexto: ContextoDeLaTrayectoria) => contexto.events.map((e) => e.eventType);
const regimenes = (contexto: ContextoDeLaTrayectoria) =>
  contexto.priorTreatments.map((t) => t.regimenName).sort();

describe('la trayectoria del caso en el contexto enviado a la IA', () => {
  it('envía la progresión con monthsAgo 2, Leuprorelina y Bicalutamida con monthsSinceStart y currentLine 1, sin la cirugía rechazada, cuando se analiza P-CASO [US-093 AC-1]', async () => {
    const p: PCasoSembrado = await pCaso();

    const { contexto, filaDe } = await analizar(p.patientId);

    assertMatchesSpec('rag-orchestrator', PUNTERO_CONTEXTO, contexto);
    const progresion = contexto.events.find((e) => e.eventType === 'progresion');
    expect(progresion?.monthsAgo).toBe(2);
    expect(tipos(contexto)).not.toContain('cirugia');
    expect(contexto.events.map((e) => filaDe(e.dataRef))).not.toContain(p.filas.cirugia);
    const leuprorelina = contexto.priorTreatments.find((t) => t.regimenName === 'Leuprorelina');
    const bicalutamida = contexto.priorTreatments.find((t) => t.regimenName === 'Bicalutamida');
    expect(leuprorelina).toMatchObject({ lineNumber: 1, atcCodes: ['L02AE02'] });
    expect(bicalutamida).toMatchObject({ lineNumber: null, atcCodes: ['L02BB03'] });
    expect(leuprorelina?.monthsSinceStart).not.toBeNull();
    expect(bicalutamida?.monthsSinceStart).not.toBeNull();
    expect(contexto.currentLine).toBe(1);
    expect(contexto.biomarkerTrends).toEqual([]);
  });

  it('envía el PSA de 9,5 con reviewStatus requiere_revision y la toxicidad etiquetada cuando se analiza P-CASO [US-093 AC-3]', async () => {
    const p = await pCaso();

    const { contexto } = await analizar(p.patientId);

    const psa = contexto.biomarkers.find((b) => b.biomarkerName === 'PSA');
    expect(psa?.value).toBe('9.5');
    expect(psa?.provenance.reviewStatus).toBe('requiere_revision');
    const toxicidad = contexto.events.find((e) => e.eventType === 'toxicidad');
    expect(toxicidad?.provenance.reviewStatus).toBe('requiere_revision');
  });

  it('envía la toxicidad sin fecha confiable con monthsAgo null cuando se analiza P-CASO [US-093 AC-5]', async () => {
    const p = await pCaso();

    const { contexto } = await analizar(p.patientId);

    const toxicidad = contexto.events.find((e) => e.eventType === 'toxicidad');
    expect(toxicidad).toBeDefined();
    expect(toxicidad?.monthsAgo).toBeNull();
  });

  it('envía con monthsAgo null un evento con fecha y precisión incierta cuando se analiza P-CASO con una respuesta incierta [US-093 AC-5]', async () => {
    const p = await pCaso();
    await sembrarRespuestaIncierta(p, siembra.ids());

    const { contexto } = await analizar(p.patientId);

    const respuesta = contexto.events.find((e) => e.eventType === 'respuesta');
    expect(respuesta).toBeDefined();
    expect(respuesta?.monthsAgo).toBeNull();
  });

  it('no envía ni persiste el tratamiento ni el atributo reemplazados cuando se analiza P-CASO [RN-07]', async () => {
    const p = await pCaso();
    const reemplazados = await sembrarTratamientoYAtributoReemplazados(p, siembra.ids);

    const { contexto, filaDe } = await analizar(p.patientId);

    expect(regimenes(contexto)).toEqual(['Bicalutamida', 'Leuprorelina']);
    expect(contexto.attributes).toHaveLength(2);
    const refs = [...contexto.events, ...contexto.priorTreatments, ...contexto.attributes].map(
      (dato) => filaDe(dato.dataRef),
    );
    expect(refs).not.toContain(reemplazados.tratamiento);
    expect(refs).not.toContain(reemplazados.atributo);
    const estados = [...contexto.events, ...contexto.priorTreatments, ...contexto.attributes].map(
      (dato) => dato.provenance.reviewStatus,
    );
    expect(estados).not.toContain('rechazado');
    expect(estados).not.toContain('reemplazado');
    const { rows } = await mundo.cliente.query<{ snapshot: string }>(
      `SELECT clinical_context_snapshot::text AS snapshot FROM clinical.ai_analysis_record
        WHERE patient_id = $1 AND clinical_context_snapshot IS NOT NULL`,
      [p.patientId],
    );
    expect(rows.length).toBeGreaterThan(0);
    for (const { snapshot } of rows) {
      expect(snapshot).not.toContain('Esquema reemplazado');
      expect(snapshot).not.toContain('valor reemplazado');
    }
  });

  it('envía listas vacías y currentLine null cuando el paciente no tiene trayectoria [US-093]', async () => {
    const p = await sembrarPacienteSinTrayectoria(siembra);

    const { contexto } = await analizar(p.patientId);

    expect(contexto.events).toEqual([]);
    expect(contexto.priorTreatments).toEqual([]);
    expect(contexto.attributes).toEqual([]);
    expect(contexto.currentLine).toBeNull();
  });
});
