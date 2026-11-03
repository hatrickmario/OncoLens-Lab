import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TIPOS_DE_EVENTO_DE_IA } from '../../../src/modules/case-view/timeline.reglas.js';
import type { CaseViewService } from '../../../src/modules/case-view/ports.js';
import {
  sembrarEventoReflejoDeAnalisis,
  sembrarPCaso,
  type PCasoSembrado,
} from '../../support/caso.js';
import { montarCaso } from '../../support/caso-http.js';
import {
  nuevoPaciente,
  prepararSiembra,
  sembrarBiomarcador,
  sembrarDiagnostico,
  type ContextoDeSiembra,
} from '../../support/completitud.js';
import { generadorDeIds } from '../../support/filas-sinteticas.js';
import { abrirSesion, prepararMundoConSeed, type MundoDeGateway } from '../../support/gateway.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';

const ESPACIO_DE_IDS = 7403;
/** UUID válido que ningún test ni el seed crean. */
const PACIENTE_INEXISTENTE = '00000000-0000-4000-8000-00000000dead';

let mundo: MundoDeGateway;
let siembra: ContextoDeSiembra;
let cookieDoctor: string;
let cookieAdmin: string;
let espacioDePCaso = 7430;

beforeAll(async () => {
  mundo = await prepararMundoConSeed('caso_derivados', ESPACIO_DE_IDS);
  siembra = await prepararSiembra(mundo.cliente, generadorDeIds(ESPACIO_DE_IDS + 500));
  cookieDoctor = await abrirSesion(mundo, 'doc1@test.local', 'SINT-cookie-doctor-caso-dd-0001');
  cookieAdmin = await abrirSesion(mundo, 'admin@test.local', 'SINT-cookie-admin-caso-dd-0001');
});
afterAll(() => mundo.cerrar());

/** Cada test siembra su P-CASO con ids propios (una base por archivo, no por test). */
const sembrarOtroPCaso = () => sembrarPCaso(siembra, { espacio: ++espacioDePCaso });

interface Procedencia {
  entryMethod: string;
  extractionConfidence: string;
  reviewStatus: string;
  sourceDocumentId: string | null;
}
interface EventoDeLaVista {
  id: string;
  eventType: string;
  derived: boolean;
  eventDate: string | null;
  datePrecision: string;
  description: string;
  provenance: Procedencia;
}
interface Vista {
  timeline: EventoDeLaVista[];
  priorTreatments: { regimenName: string }[];
  attributes: { key: string }[];
  biomarkerSeries: { name: string; points: { value: string }[] }[];
}

const pedir = (
  id: string,
  opciones: { cookie?: string | null; envolver?: (real: CaseViewService) => CaseViewService } = {},
) => {
  const { app, logger } = montarCaso(mundo, {
    ...(opciones.envolver !== undefined && { envolverServicio: opciones.envolver }),
  });
  const peticion = clienteVerificado(app).get(`/platform/patients/${id}/case`);
  const cookie = opciones.cookie === undefined ? cookieDoctor : opciones.cookie;
  return { logger, respuesta: cookie === null ? peticion : peticion.set('Cookie', cookie) };
};

async function pedirVista(p: PCasoSembrado | { patientId: string }): Promise<Vista> {
  const respuesta = await pedir(p.patientId).respuesta;
  expect(respuesta.status).toBe(200);
  return respuesta.body as Vista;
}

describe('GET /platform/patients/{id}/case · eventos derivados y descartados', () => {
  it('muestra cada evento derivado una vez y deja clinical_event solo con progresion, toxicidad y cirugia [US-088 AC-2]', async () => {
    const p = await sembrarOtroPCaso();

    const vista = await pedirVista(p);
    const { rows } = await mundo.cliente.query<{ event_type: string }>(
      'SELECT DISTINCT event_type::text FROM clinical.clinical_event WHERE patient_id = $1',
      [p.patientId],
    );

    const ids = vista.timeline.map((evento) => evento.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(vista.timeline).toHaveLength(11);
    expect(rows.map((fila) => fila.event_type).sort()).toEqual([
      'cirugia',
      'progresion',
      'toxicidad',
    ]);
  });

  it('pone la toxicidad incierta con eventDate null después de los eventos fechados [US-088 AC-3]', async () => {
    const p = await sembrarOtroPCaso();

    const vista = await pedirVista(p);

    expect(vista.timeline).toHaveLength(11);
    expect(vista.timeline.slice(0, 10).every((evento) => evento.eventDate !== null)).toBe(true);
    expect(vista.timeline[10]).toMatchObject({
      eventType: 'toxicidad',
      eventDate: null,
      datePrecision: 'incierta',
      derived: false,
    });
  });

  it('no muestra la cirugía rechazada [US-088 AC-4]', async () => {
    const p = await sembrarOtroPCaso();

    const vista = await pedirVista(p);

    expect(vista.timeline.map((evento) => evento.eventType)).not.toContain('cirugia');
    expect(vista.timeline.map((evento) => evento.id)).not.toContain(p.filas.cirugia);
  });

  it('no muestra en ninguna sección un tratamiento, un atributo y un biomarcador reemplazados [US-088 AC-4]', async () => {
    const p = await sembrarOtroPCaso();
    await mundo.cliente.query(
      "UPDATE clinical.prior_treatment SET review_status = 'reemplazado' WHERE id = $1",
      [p.filas.leuprorelina],
    );
    await mundo.cliente.query(
      "UPDATE clinical.clinical_attribute SET review_status = 'reemplazado' WHERE id = $1",
      [p.filas.atributoCastracion],
    );
    await mundo.cliente.query(
      "UPDATE clinical.biomarker SET review_status = 'reemplazado' WHERE id = $1",
      [p.filas.testosterona],
    );

    const vista = await pedirVista(p);

    expect(vista.timeline.map((evento) => evento.description)).not.toContain('Leuprorelina');
    expect(vista.priorTreatments.map((t) => t.regimenName)).toEqual(['Bicalutamida']);
    expect(vista.attributes.map((a) => a.key)).toEqual(['sitios_metastasicos']);
    expect(vista.biomarkerSeries.map((serie) => serie.name)).toEqual(['PSA']);
    expect(vista.biomarkerSeries[0]?.points.map((punto) => punto.value)).toEqual([
      '4.1',
      '6.8',
      '9.5',
    ]);
  });

  it('no produce evento de examen cuando todos sus biomarcadores están rechazados [US-088 AC-4]', async () => {
    const paciente = await nuevoPaciente(siembra);
    await sembrarDiagnostico(paciente, {
      cancerType: 'prostata',
      histology: 'adenocarcinoma acinar',
      grade: null,
      stagingSystem: null,
      stageValue: null,
      performanceValue: 1,
    });
    await sembrarBiomarcador(paciente, {
      name: 'PSA',
      value: '12',
      reviewStatus: 'rechazado',
      entryMethod: 'ocr',
      examType: 'laboratorio',
    });

    const vista = await pedirVista(paciente);

    expect(vista.timeline.map((evento) => evento.eventType)).toEqual(['diagnostico']);
    expect(vista.biomarkerSeries).toEqual([]);
  });

  it('muestra el análisis y el resumen como Análisis de IA y Resumen del caso con derived true y sin fila en clinical_event [US-088 AC-5]', async () => {
    const p = await sembrarOtroPCaso();

    const vista = await pedirVista(p);
    const { rows } = await mundo.cliente.query<{ n: number }>(
      'SELECT count(*)::int AS n FROM clinical.clinical_event WHERE patient_id = $1 AND analysis_id IS NOT NULL',
      [p.patientId],
    );

    const deIa = vista.timeline.filter((evento) =>
      ['Análisis de IA', 'Resumen del caso'].includes(evento.description),
    );
    expect(deIa.map((e) => [e.eventDate, e.description, e.derived])).toEqual([
      ['2026-08-01', 'Análisis de IA', true],
      ['2026-08-02', 'Resumen del caso', true],
    ]);
    expect(rows[0]?.n).toBe(0);
  });

  it('no muestra en el timeline una fila de clinical_event con analysis_id [US-088 AC-5] [ADR-32]', async () => {
    const p = await sembrarOtroPCaso();
    const idDelReflejo = mundo.ids();
    await sembrarEventoReflejoDeAnalisis(p, idDelReflejo, 'verificado');

    const vista = await pedirVista(p);

    expect(vista.timeline.map((evento) => evento.id)).not.toContain(idDelReflejo);
    expect(vista.timeline).toHaveLength(11);
  });

  it('marca los eventos de IA con provenance n_a, auto_aceptado y sourceDocumentId null, y su eventType en la lista de eventos de IA [US-088 AC-5]', async () => {
    const p = await sembrarOtroPCaso();

    const vista = await pedirVista(p);

    const deIa = vista.timeline.filter((evento) =>
      (TIPOS_DE_EVENTO_DE_IA as readonly string[]).includes(evento.eventType),
    );
    expect(deIa.map((evento) => evento.eventType)).toEqual(['analisis_ia', 'resumen_caso']);
    for (const evento of deIa) {
      expect(evento.provenance).toMatchObject({
        extractionConfidence: 'n_a',
        reviewStatus: 'auto_aceptado',
        sourceDocumentId: null,
      });
    }
    expect([...TIPOS_DE_EVENTO_DE_IA].sort()).toEqual(['analisis_ia', 'resumen_caso']);
  });

  it('responde 404 { error, message } con un UUID inexistente y con uno mal formado [US-088 AC-6]', async () => {
    const inexistente = await pedir(PACIENTE_INEXISTENTE).respuesta;
    const malFormado = pedir('no-es-un-uuid');
    const resultadoMalFormado = await malFormado.respuesta;

    for (const respuesta of [inexistente, resultadoMalFormado]) {
      expect(respuesta.status).toBe(404);
      expect(respuesta.body).toMatchObject({ error: 'NO_ENCONTRADO' });
      expect(typeof (respuesta.body as { message: unknown }).message).toBe('string');
    }
    expect(malFormado.logger.texto()).not.toMatch(/invalid input syntax|error de la base/i);
  });

  it('responde 403 al admin sin invocar al servicio y 401 sin sesión [US-088 AC-6]', async () => {
    const p = await sembrarOtroPCaso();
    let invocaciones = 0;
    const contar = (real: CaseViewService): CaseViewService => ({
      obtener: (id) => {
        invocaciones += 1;
        return real.obtener(id);
      },
    });

    const admin = await pedir(p.patientId, { cookie: cookieAdmin, envolver: contar }).respuesta;
    const sinSesion = await pedir(p.patientId, { cookie: null }).respuesta;

    expect(admin.status).toBe(403);
    expect(admin.body).toMatchObject({ error: 'PERMISO_DENEGADO' });
    expect(invocaciones).toBe(0);
    expect(sinSesion.status).toBe(401);
  });

  it('responde 200 con las cuatro listas vacías a un paciente sin datos [US-088 AC-7]', async () => {
    const paciente = await nuevoPaciente(siembra);

    const vista = await pedirVista(paciente);

    expect(vista.timeline).toEqual([]);
    expect(vista.priorTreatments).toEqual([]);
    expect(vista.attributes).toEqual([]);
    expect(vista.biomarkerSeries).toEqual([]);
  });

  it('devuelve el mismo orden y los mismos id en dos llamadas cuando un diagnóstico y un examen comparten fecha [S5 resp. 13]', async () => {
    const paciente = await nuevoPaciente(siembra);
    await sembrarDiagnostico(paciente, {
      cancerType: 'prostata',
      histology: 'adenocarcinoma acinar',
      grade: null,
      stagingSystem: null,
      stageValue: null,
      performanceValue: 1,
    });
    await sembrarBiomarcador(paciente, {
      name: 'PSA',
      value: '4',
      reviewStatus: 'verificado',
      entryMethod: 'ocr',
      examType: 'laboratorio',
    });

    const primera = await pedirVista(paciente);
    const segunda = await pedirVista(paciente);

    expect(primera.timeline.map((e) => e.eventType)).toEqual(['diagnostico', 'examen']);
    expect(segunda.timeline).toEqual(primera.timeline);
  });
});
