import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import respuestaConEvidencia from '../../../../../contracts/examples/rag-query-con-evidencia.json' with { type: 'json' };
import type { EvidenceAnalysis } from '../../../../../packages/api-contracts/src/client/clinical-api/index.js';
import {
  RUTA_CATALOGO_TEST_1_0_0,
  leerTexto,
  prepararSiembra,
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

const ESPACIO_DE_IDS = 9810;
const TOKEN_DE_SESION = 'SINT-cookie-sesion-base-faltantes-0001';

/** Los seis faltantes de F-M2 en el orden de `datos-criticos.json` de FX-04-a (`test-1.0.0`). */
const FALTANTES_DE_FM2 = ['grado', 'rp', 'her2_ish', 'ki67', 'estado_menopausico', 'brca_germinal'];

/** `label.es` de cada clave leído directo del JSON del catálogo de test, independiente del código bajo prueba. */
function etiquetasDelCatalogo(claves: readonly string[]): string[] {
  const catalogo = JSON.parse(
    leerTexto(`${RUTA_CATALOGO_TEST_1_0_0}/mama/datos-criticos.json`),
  ) as {
    items: { key: string; label: { es: string } }[];
  };
  return claves.map((clave) => catalogo.items.find((item) => item.key === clave)!.label.es);
}

/** rag-orchestrator devuelve en `meta.catalogVersion` la versión del request (si difiere responde 409). */
function conCatalogoDeTest(sobreescribe: Record<string, unknown> = {}): EscenarioDeRag {
  return {
    tipo: 'json',
    status: 200,
    cuerpo: {
      ...respuestaConEvidencia,
      ...sobreescribe,
      meta: { ...respuestaConEvidencia.meta, catalogVersion: 'test-1.0.0' },
    },
  };
}

const rag = ragSimulado();
let mundo: MundoDeGateway;
let siembra: ContextoDeSiembra;
let cookie: string;

beforeAll(async () => {
  rag.iniciar();
  mundo = await prepararMundoConSeed('gw_base_faltantes', ESPACIO_DE_IDS);
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

describe('inciso (b) de la Base: faltantes calculados por clinical-api', () => {
  it('trae los seis faltantes de F-M2 con sus etiquetas y continuedWithWarning true, iguales a lo persistido, cuando se continúa con aviso [US-128 AC-1]', async () => {
    const fm2 = await sembrarFM2(siembra);
    rag.responder(conCatalogoDeTest());
    const { app } = await montar('req_BaseFalt0001');

    const respuesta = await solicitar(app, fm2, { continueWithWarning: true });

    expect(respuesta.status).toBe(200);
    const { analysisBasis: base } = respuesta.body as EvidenceAnalysis;
    expect(base.missingCriticalData).toEqual(FALTANTES_DE_FM2);
    expect(base.missingCriticalDataLabels).toEqual(etiquetasDelCatalogo(FALTANTES_DE_FM2));
    expect(base.missingCriticalDataLabels).toHaveLength(6);
    expect(base.continuedWithWarning).toBe(true);
    const registro = await leerRegistroPorTrace(mundo.cliente, 'req_BaseFalt0001');
    expect(registro).toMatchObject({
      missing_critical_data: base.missingCriticalData,
      continued_with_warning: true,
    });
    expect(registro!.analysis_basis).toEqual(base);
  });

  it('declara continuedWithWarning false y las seis claves cuando no llega continueWithWarning [US-128 AC-1]', async () => {
    const fm2 = await sembrarFM2(siembra);
    rag.responder(conCatalogoDeTest());
    const { app } = await montar('req_BaseFalt0002');

    const respuesta = await solicitar(app, fm2);

    expect(respuesta.status).toBe(200);
    const { analysisBasis: base } = respuesta.body as EvidenceAnalysis;
    expect(base.continuedWithWarning).toBe(false);
    expect(base.missingCriticalData).toEqual(FALTANTES_DE_FM2);
    expect(base.missingCriticalDataLabels).toEqual(etiquetasDelCatalogo(FALTANTES_DE_FM2));
  });

  it('declara las seis claves y continuedWithWarning cuando rag-orchestrator responde sin_evidencia a Q-SIN [US-128 AC-2]', async () => {
    const fm2 = await sembrarFM2(siembra);
    rag.responder(SIN_EVIDENCIA);
    const { app } = await montar('req_BaseFalt0003');

    const respuesta = await solicitar(app, fm2, { continueWithWarning: true });

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toMatchObject({ status: 'sin_evidencia' });
    const { analysisBasis: base } = respuesta.body as EvidenceAnalysis;
    expect(base.missingCriticalData).toEqual(FALTANTES_DE_FM2);
    expect(base.missingCriticalDataLabels).toEqual(etiquetasDelCatalogo(FALTANTES_DE_FM2));
    expect(base.continuedWithWarning).toBe(true);
  });

  it('es la lista calculada por clinical-api cuando la IA menciona otros faltantes en supuestos y limitaciones [US-128 AC-3]', async () => {
    const fm2 = await sembrarFM2(siembra);
    rag.responder(
      conCatalogoDeTest({
        assumptions: [{ text: 'Falta el estado HER2 y el PSA' }],
        limitations: [{ text: 'Faltan datos de ECOG', origin: 'estructural' }],
      }),
    );
    const { app } = await montar('req_BaseFalt0004');

    const respuesta = await solicitar(app, fm2, { continueWithWarning: true });

    expect(respuesta.status).toBe(200);
    const { analysisBasis: base } = respuesta.body as EvidenceAnalysis;
    expect(base.missingCriticalData).toEqual(FALTANTES_DE_FM2);
    expect(base.missingCriticalDataLabels).toEqual(etiquetasDelCatalogo(FALTANTES_DE_FM2));
    for (const clave of ['her2', 'psa', 'ecog'])
      expect(base.missingCriticalData).not.toContain(clave);
    expect(base.assumptions).toEqual([
      { text: 'Falta el estado HER2 y el PSA', origin: 'llm_verificado' },
    ]);
  });
});

describe('inciso (b) de la Base: falla cerrado sin etiqueta', () => {
  it('responde 500 ERROR_INTERNO sin persistir y registra solo traceId y código cuando una clave no tiene etiqueta en el catálogo [US-128 AC-1]', async () => {
    const fm2 = await sembrarFM2(siembra);
    rag.responder(conCatalogoDeTest());
    const { app, logger } = await montar('req_BaseFalt0005', {
      etiquetaDe: (clave) => (clave === 'ki67' ? undefined : clave),
    });

    const respuesta = await solicitar(app, fm2, { continueWithWarning: true });

    expect(respuesta.status).toBe(500);
    expect(respuesta.body).toMatchObject({ error: 'ERROR_INTERNO', traceId: 'req_BaseFalt0005' });
    expect(await contarAnalisisDelPaciente(mundo.cliente, fm2.patientId)).toBe(0);
    const log = logger.texto();
    expect(log).toContain('req_BaseFalt0005');
    expect(log).toContain('etiqueta_de_dato_critico_no_disponible');
    expect(log).not.toContain('ki67');
    expect(log).not.toMatch(/Etiqueta de dato cr/i);
  });

  it('no registra ninguna clave ni etiqueta de los faltantes en el log cuando el análisis se completa', async () => {
    const fm2 = await sembrarFM2(siembra);
    rag.responder(conCatalogoDeTest());
    const { app, logger } = await montar('req_BaseFalt0006');

    const respuesta = await solicitar(app, fm2, { continueWithWarning: true });

    expect(respuesta.status).toBe(200);
    for (const clave of FALTANTES_DE_FM2) expect(logger.texto(), clave).not.toContain(clave);
  });
});
