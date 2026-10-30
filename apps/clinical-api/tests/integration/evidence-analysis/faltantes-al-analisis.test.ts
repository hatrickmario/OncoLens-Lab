import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import respuestaConEvidencia from '../../../../../contracts/examples/rag-query-con-evidencia.json' with { type: 'json' };
import { assertMatchesSpec } from '../../../../../scripts/contracts/lib/responseValidator.mjs';
import { componerCompletitud } from '../../../src/modules/completeness/completeness.module.js';
import { ChecklistNoDisponibleError } from '../../../src/modules/evidence-analysis/ports.js';
import {
  RUTA_CATALOGO_TEST_1_0_0,
  TIPOS_HABILITADOS_DE_TEST,
  leerTexto,
  piiSinteticaDeFM2,
  prepararSiembra,
  sembrarAtributo,
  sembrarFM2,
  type ContextoDeSiembra,
  type PacienteSembrado,
} from '../../support/completitud.js';
import {
  PREGUNTA_AC1,
  SIN_EVIDENCIA,
  TODAS_LAS_FUENTES,
  abrirSesion,
  contarAnalisisDelPaciente,
  leerRegistroPorTrace,
  montarGateway,
  prepararMundoConSeed,
  ragSimulado,
  type EscenarioDeRag,
  type MundoDeGateway,
} from '../../support/gateway.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';

const ESPACIO_DE_IDS = 9801;
const TOKEN_DE_SESION = 'SINT-cookie-sesion-faltantes-0001';
const PUNTERO_REQUEST_INTERNO = '#/components/schemas/RagQueryInternalRequest';

/** Los seis faltantes de F-M2 en el orden de `datos-criticos.json` de FX-04-a (`test-1.0.0`). */
const FALTANTES_DE_FM2 = ['grado', 'rp', 'her2_ish', 'ki67', 'estado_menopausico', 'brca_germinal'];

/** rag-orchestrator devuelve en `meta.catalogVersion` la versión del request (si difiere responde 409): el simulado la repite. */
const RESPUESTA_CON_CATALOGO_DE_TEST: EscenarioDeRag = {
  tipo: 'json',
  status: 200,
  cuerpo: {
    ...respuestaConEvidencia,
    meta: { ...respuestaConEvidencia.meta, catalogVersion: 'test-1.0.0' },
  },
};

const rag = ragSimulado();
let mundo: MundoDeGateway;
let siembra: ContextoDeSiembra;
let cookie: string;

beforeAll(async () => {
  rag.iniciar();
  mundo = await prepararMundoConSeed('gw_faltantes', ESPACIO_DE_IDS);
  cookie = await abrirSesion(mundo, 'doc1@test.local', TOKEN_DE_SESION);
  siembra = await prepararSiembra(mundo.cliente, mundo.ids);
});
afterEach(() => rag.reiniciar());
afterAll(async () => {
  rag.detener();
  await mundo.cerrar();
});

const montar = (traceId: string, extra: Parameters<typeof montarGateway>[1] = {}) =>
  montarGateway(mundo, {
    rutaDelCatalogo: RUTA_CATALOGO_TEST_1_0_0,
    traceIds: { traceId: () => traceId },
    ...extra,
  });

function solicitar(
  app: Awaited<ReturnType<typeof montar>>['app'],
  paciente: PacienteSembrado,
  extra: Record<string, unknown> = {},
) {
  return clienteVerificado(app)
    .post('/platform/evidence-analyses')
    .set('Cookie', cookie)
    .send({
      patientId: paciente.patientId,
      query: PREGUNTA_AC1,
      sourcesSelected: TODAS_LAS_FUENTES,
      ...extra,
    });
}

const faltantesEnviados = (): unknown =>
  (rag.capturadas[0]!.cuerpo['clinicalContext'] as Record<string, unknown>)['missingCriticalData'];

describe('fixture FX-04-b: F-M2 contra el catálogo FX-04-a', () => {
  it('calcula los seis faltantes de F-M2 en el orden del catálogo cuando se carga test-1.0.0', async () => {
    const fm2 = await sembrarFM2(siembra);

    const checklist = await componerCompletitud({
      db: mundo.cliente,
      rutaDelCatalogo: RUTA_CATALOGO_TEST_1_0_0,
      leerArchivo: leerTexto,
      tiposHabilitados: TIPOS_HABILITADOS_DE_TEST,
    }).calcular(fm2.patientId);

    expect(checklist.catalogVersion).toBe('test-1.0.0');
    expect(checklist.items.filter((i) => i.status === 'faltante').map((i) => i.key)).toEqual(
      FALTANTES_DE_FM2,
    );
  });
});

describe('faltantes críticos del análisis: envío y persistencia', () => {
  it('envía los seis faltantes de F-M2 en el orden del catálogo y catalogVersion test-1.0.0 cuando el oncólogo continúa con aviso [US-006 AC-1]', async () => {
    const fm2 = await sembrarFM2(siembra);
    const { app } = await montar('req_Faltantes0001');

    const respuesta = await solicitar(app, fm2, { continueWithWarning: true });

    expect(respuesta.status).toBe(200);
    expect(faltantesEnviados()).toEqual(FALTANTES_DE_FM2);
    expect(rag.capturadas[0]!.cuerpo['catalogVersion']).toBe('test-1.0.0');
    assertMatchesSpec('rag-orchestrator', PUNTERO_REQUEST_INTERNO, rag.capturadas[0]!.cuerpo);
  });

  it('persiste los seis faltantes, continued_with_warning true y catalog_version test-1.0.0 cuando se completa el análisis [US-006 AC-2]', async () => {
    const fm2 = await sembrarFM2(siembra);
    rag.responder(RESPUESTA_CON_CATALOGO_DE_TEST);
    const { app } = await montar('req_Faltantes0002');

    const respuesta = await solicitar(app, fm2, { continueWithWarning: true });

    expect(respuesta.status).toBe(200);
    const registro = await leerRegistroPorTrace(mundo.cliente, 'req_Faltantes0002');
    expect(registro).toMatchObject({
      missing_critical_data: FALTANTES_DE_FM2,
      continued_with_warning: true,
      catalog_version: 'test-1.0.0',
    });
  });

  it('responde 200, persiste continued_with_warning false y envía los mismos faltantes cuando no llega continueWithWarning [US-006 AC-3]', async () => {
    const fm2 = await sembrarFM2(siembra);
    const { app } = await montar('req_Faltantes0003');

    const respuesta = await solicitar(app, fm2);

    expect(respuesta.status).toBe(200);
    expect(faltantesEnviados()).toEqual(FALTANTES_DE_FM2);
    const registro = await leerRegistroPorTrace(mundo.cliente, 'req_Faltantes0003');
    expect(registro).toMatchObject({
      missing_critical_data: FALTANTES_DE_FM2,
      continued_with_warning: false,
    });
  });

  it('envía cinco faltantes sin estado_menopausico cuando se registra antes del POST [US-006 AC-4]', async () => {
    const fm2 = await sembrarFM2(siembra);
    const completitud = componerCompletitud({
      db: mundo.cliente,
      rutaDelCatalogo: RUTA_CATALOGO_TEST_1_0_0,
      leerArchivo: leerTexto,
      tiposHabilitados: TIPOS_HABILITADOS_DE_TEST,
    });
    const previo = await completitud.calcular(fm2.patientId);
    expect(previo.items.filter((i) => i.status === 'faltante')).toHaveLength(6);
    await sembrarAtributo(fm2, {
      key: 'estado_menopausico',
      value: 'posmenopausica',
      reviewStatus: 'verificado',
    });
    const { app } = await montar('req_Faltantes0004');

    const respuesta = await solicitar(app, fm2);

    expect(respuesta.status).toBe(200);
    expect(faltantesEnviados()).toEqual(['grado', 'rp', 'her2_ish', 'ki67', 'brca_germinal']);
  });

  it('persiste los seis faltantes cuando rag-orchestrator responde sin_evidencia [US-006 AC-5]', async () => {
    const fm2 = await sembrarFM2(siembra);
    rag.responder(SIN_EVIDENCIA);
    const { app } = await montar('req_Faltantes0005');

    const respuesta = await solicitar(app, fm2, { continueWithWarning: true });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toMatchObject({ status: 'sin_evidencia' });
    const registro = await leerRegistroPorTrace(mundo.cliente, 'req_Faltantes0005');
    expect(registro?.missing_critical_data).toEqual(FALTANTES_DE_FM2);
  });
});

describe('faltantes críticos del análisis: privacidad y fallos', () => {
  it('envía solo claves del catálogo y ninguna PII sembrada cuando F-M2 tiene una nota con nombre y documento [US-006 AC-6]', async () => {
    const fm2 = await sembrarFM2(siembra);
    const pii = piiSinteticaDeFM2();
    const { app } = await montar('req_Faltantes0006');

    const respuesta = await solicitar(app, fm2, { continueWithWarning: true });

    expect(respuesta.status).toBe(200);
    const faltantes = faltantesEnviados() as string[];
    expect(faltantes.length).toBeGreaterThan(0);
    for (const clave of faltantes) expect(clave).toMatch(/^[a-z0-9_]+$/);
    const { texto } = rag.capturadas[0]!;
    expect(texto).not.toContain(pii.nombre);
    expect(texto).not.toContain(pii.documento);
  });

  it('responde 504 y no persiste registro cuando rag-orchestrator no responde a tiempo [US-006 AC-7]', async () => {
    const fm2 = await sembrarFM2(siembra);
    rag.responder({ tipo: 'tardia' });
    const { app } = await montar('req_Faltantes0007');

    const respuesta = await solicitar(app, fm2, { continueWithWarning: true });

    expect(respuesta.status).toBe(504);
    expect(respuesta.body).toMatchObject({ error: 'DEADLINE_VENCIDO' });
    expect(faltantesEnviados()).toEqual(FALTANTES_DE_FM2);
    expect(await contarAnalisisDelPaciente(mundo.cliente, fm2.patientId)).toBe(0);
  });

  it('responde 500 ERROR_INTERNO sin llamar a rag-orchestrator ni persistir cuando el checklist falla [US-006 AC-8]', async () => {
    const fm2 = await sembrarFM2(siembra);
    const { app, logger } = await montar('req_Faltantes0008', {
      checklist: {
        faltantes: () => Promise.reject(new ChecklistNoDisponibleError()),
      },
    });

    const respuesta = await solicitar(app, fm2, { continueWithWarning: true });

    expect(respuesta.status).toBe(500);
    expect(respuesta.body).toMatchObject({
      error: 'ERROR_INTERNO',
      traceId: 'req_Faltantes0008',
    });
    expect(typeof (respuesta.body as { message: unknown }).message).toBe('string');
    expect(rag.llamadas()).toBe(0);
    expect(await contarAnalisisDelPaciente(mundo.cliente, fm2.patientId)).toBe(0);
    expect(logger.texto()).toContain('checklist_no_disponible');
  });
});

describe('faltantes críticos: regresiones de alcance y de logs', () => {
  it('no registra ninguna clave de la lista de faltantes en el log cuando el análisis se completa', async () => {
    const fm2 = await sembrarFM2(siembra);
    const { app, logger } = await montar('req_Faltantes0009');

    const respuesta = await solicitar(app, fm2, { continueWithWarning: true });

    expect(respuesta.status).toBe(200);
    for (const clave of FALTANTES_DE_FM2) expect(logger.texto(), clave).not.toContain(clave);
  });

  it('cierra sin IA con missing_critical_data vacío y sin calcular el checklist cuando el tipo no está habilitado', async () => {
    const fm2 = await sembrarFM2(siembra);
    const { app } = await montar('req_Faltantes0010', {
      tiposHabilitados: ['prostata'],
      checklist: { faltantes: () => Promise.reject(new ChecklistNoDisponibleError()) },
    });

    const respuesta = await solicitar(app, fm2, { continueWithWarning: true });

    expect(respuesta.status).toBe(200);
    expect(rag.llamadas()).toBe(0);
    const registro = await leerRegistroPorTrace(mundo.cliente, 'req_Faltantes0010');
    expect(registro?.missing_critical_data).toEqual([]);
  });
});
