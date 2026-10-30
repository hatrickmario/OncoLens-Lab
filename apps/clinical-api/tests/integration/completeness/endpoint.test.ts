import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  nuevoPaciente,
  prepararSiembra,
  sembrarDiagnostico,
  sembrarFM1,
  sembrarFM2,
  type ContextoDeSiembra,
} from '../../support/completitud.js';
import { etiquetasDelCatalogo, montarCompletitud } from '../../support/completitud-http.js';
import { generadorDeIds, insertar } from '../../support/filas-sinteticas.js';
import { abrirSesion, prepararMundoConSeed, type MundoDeGateway } from '../../support/gateway.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';

const ESPACIO_DE_IDS = 9501;
/** UUID válido que ningún test ni el seed crean. */
const PACIENTE_INEXISTENTE = '00000000-0000-4000-8000-00000000dead';
/** Texto del fragmento del documento: nunca debe salir en la respuesta (RN-10). */
const TEXTO_DEL_FRAGMENTO = 'SINT-fragmento-del-documento-no-debe-salir';

let mundo: MundoDeGateway;
let siembra: ContextoDeSiembra;
let cookieDoctor: string;
let cookieAdmin: string;

beforeAll(async () => {
  mundo = await prepararMundoConSeed('compl_endpoint', ESPACIO_DE_IDS);
  siembra = await prepararSiembra(mundo.cliente, generadorDeIds(ESPACIO_DE_IDS + 500));
  cookieDoctor = await abrirSesion(mundo, 'doc1@test.local', 'SINT-cookie-doctor-compl-ep-0001');
  cookieAdmin = await abrirSesion(mundo, 'admin@test.local', 'SINT-cookie-admin-compl-ep-0001');
});
afterAll(() => mundo.cerrar());

const pedir = (
  id: string,
  cookie: string | null = cookieDoctor,
  opciones: Parameters<typeof montarCompletitud>[1] = {},
) => {
  const { app, logger } = montarCompletitud(mundo, opciones);
  const peticion = clienteVerificado(app).get(`/platform/patients/${id}/completeness`);
  return { logger, respuesta: cookie === null ? peticion : peticion.set('Cookie', cookie) };
};

interface ItemDeLaVista {
  item: string;
  label: string;
  status: string;
  origin: string;
  provenance: {
    entryMethod: string;
    reviewStatus: string;
    sourceDocumentId: string | null;
    page?: number;
  } | null;
  destination: { entity: string; field: string | null };
  condition: { item: string; operator: string; values: string[] } | null;
}

const porClave = (items: ItemDeLaVista[], clave: string): ItemDeLaVista => {
  const encontrado = items.find((item) => item.item === clave);
  if (encontrado === undefined) throw new Error(`falta el ítem ${clave}`);
  return encontrado;
};

/** `re` de F-M2 pasa a venir de un documento, con página y con el texto del fragmento en `source_span`. */
async function vincularReAUnDocumento(patientId: string, pagina: number): Promise<string> {
  const { cliente, ids, userId } = siembra;
  const documento = await insertar(cliente, 'clinical.document', {
    id: ids(),
    patient_id: patientId,
    document_type: 'examen',
    object_storage_key: `sintetico/${patientId}.pdf`,
    checksum: `sha256-sintetico-${patientId}`,
    original_filename: 'sintetico.pdf',
    mime_type: 'application/pdf',
    ocr_status: 'completado',
    attempts: 0,
    uploaded_by: userId,
    uploaded_at: '2026-10-16T12:00:00.000Z',
  });
  const documentoId = documento['id'] as string;
  await cliente.query(
    `UPDATE clinical.exam SET source_document_id = $2
      WHERE id IN (SELECT b.exam_id FROM clinical.biomarker b
                    JOIN clinical.exam e ON e.id = b.exam_id
                   WHERE e.patient_id = $1 AND b.name = 'Receptor de estrógeno')`,
    [patientId, documentoId],
  );
  await cliente.query(
    `UPDATE clinical.biomarker SET source_span = $2::jsonb
      WHERE name = 'Receptor de estrógeno'
        AND exam_id IN (SELECT id FROM clinical.exam WHERE patient_id = $1)`,
    [
      patientId,
      JSON.stringify({ page: pagina, bbox: null, textOffset: 10, text: TEXTO_DEL_FRAGMENTO }),
    ],
  );
  return documentoId;
}

describe('GET /platform/patients/{id}/completeness', () => {
  it('devuelve 200 con los items de F-M2 y catalogVersion test-1.0.0 [US-003 AC-1]', async () => {
    const fm2 = await sembrarFM2(siembra);
    const etiquetas = etiquetasDelCatalogo('mama');

    const { respuesta } = pedir(fm2.patientId);
    const resultado = await respuesta;
    const cuerpo = resultado.body as {
      catalogVersion: string;
      cancerTypeEnabled: boolean;
      items: ItemDeLaVista[];
    };

    expect(resultado.status).toBe(200);
    expect(cuerpo.catalogVersion).toBe('test-1.0.0');
    expect(cuerpo.cancerTypeEnabled).toBe(true);
    expect(cuerpo.items.map((i) => [i.item, i.status])).toEqual([
      ['histologia', 'presente_verificado'],
      ['grado', 'faltante'],
      ['tnm', 'presente_verificado'],
      ['ecog', 'presente_verificado'],
      ['re', 'presente_sin_verificar'],
      ['rp', 'faltante'],
      ['her2_ihq', 'presente_verificado'],
      ['her2_ish', 'faltante'],
      ['ki67', 'faltante'],
      ['estado_menopausico', 'faltante'],
      ['tratamientos_previos', 'presente_verificado'],
      ['brca_germinal', 'faltante'],
    ]);
    expect(cuerpo.items.filter((i) => i.status === 'faltante')).toHaveLength(6);
    for (const item of cuerpo.items) expect(item.label).toBe(etiquetas[item.item]);
  });

  it('devuelve 200 y la respuesta no lleva identidad ni el texto del fragmento [US-003 AC-1]', async () => {
    const fm2 = await sembrarFM2(siembra);
    await vincularReAUnDocumento(fm2.patientId, 2);

    const { respuesta } = pedir(fm2.patientId);
    const resultado = await respuesta;

    expect(resultado.status).toBe(200);
    expect(JSON.stringify(resultado.body)).not.toContain(TEXTO_DEL_FRAGMENTO);
    expect(JSON.stringify(resultado.body)).not.toContain('Sintetica');
  });
});

describe('origen y procedencia de cada ítem', () => {
  it('trae origin y provenance por estado y destination en los faltantes [US-003 AC-3]', async () => {
    const fm2 = await sembrarFM2(siembra);
    const documentoId = await vincularReAUnDocumento(fm2.patientId, 2);

    const { respuesta } = pedir(fm2.patientId);
    const items = ((await respuesta).body as { items: ItemDeLaVista[] }).items;

    expect(porClave(items, 're')).toMatchObject({
      origin: 'documento',
      provenance: {
        entryMethod: 'ocr',
        reviewStatus: 'requiere_revision',
        sourceDocumentId: documentoId,
        page: 2,
      },
    });
    expect(porClave(items, 'tratamientos_previos')).toMatchObject({
      origin: 'manual',
      provenance: { entryMethod: 'manual', reviewStatus: 'verificado', sourceDocumentId: null },
      destination: { entity: 'PriorTreatment', field: null },
    });
    expect(porClave(items, 'her2_ihq')).toMatchObject({
      origin: 'correccion',
      provenance: { entryMethod: 'manual_correction', reviewStatus: 'corregido' },
    });
    expect(porClave(items, 'histologia')).toMatchObject({
      origin: 'seed',
      provenance: { entryMethod: 'seed', reviewStatus: 'verificado', sourceDocumentId: null },
    });
    expect(porClave(items, 'histologia').provenance).not.toHaveProperty('page');
    for (const clave of [
      'grado',
      'rp',
      'her2_ish',
      'ki67',
      'brca_germinal',
      'estado_menopausico',
    ]) {
      expect(porClave(items, clave)).toMatchObject({
        status: 'faltante',
        origin: 'regla',
        provenance: null,
        condition: null,
      });
    }
    expect(porClave(items, 'grado').destination).toEqual({ entity: 'Diagnosis', field: 'grade' });
    expect(porClave(items, 'brca_germinal').destination).toEqual({
      entity: 'Biomarker',
      field: 'value',
    });
    expect(porClave(items, 'estado_menopausico').destination).toEqual({
      entity: 'ClinicalAttribute',
      field: 'value',
    });
  });

  it('trae origin regla, provenance null y la condición del catálogo en los no_aplica de F-M1 [US-003 AC-3]', async () => {
    const fm1 = await sembrarFM1(siembra);

    const { respuesta } = pedir(fm1.patientId);
    const items = ((await respuesta).body as { items: ItemDeLaVista[] }).items;

    expect(items.filter((i) => i.status === 'faltante')).toHaveLength(0);
    expect(porClave(items, 'her2_ish')).toMatchObject({
      status: 'no_aplica',
      origin: 'regla',
      provenance: null,
      condition: { item: 'her2_ihq', operator: 'prefijo', values: ['2+'] },
    });
    expect(porClave(items, 'brca_germinal').condition).toEqual({
      item: 'tnm',
      operator: 'prefijo',
      values: ['IV'],
    });
    expect(porClave(items, 'histologia').condition).toBeNull();
  });
});

describe('sesión y permiso', () => {
  it('responde 401 sin invocar al servicio cuando no hay cookie de sesión [US-003 AC-4]', async () => {
    const invocaciones: string[] = [];
    const { respuesta } = pedir(PACIENTE_INEXISTENTE, null, {
      envolver: (real) => ({
        calcular: (id) => {
          invocaciones.push(id);
          return real.calcular(id);
        },
      }),
    });

    const resultado = await respuesta;

    expect(resultado.status).toBe(401);
    expect(invocaciones).toEqual([]);
  });

  it('responde 403 PERMISO_DENEGADO sin invocar al servicio cuando la sesión es de admin [US-003 AC-4]', async () => {
    const fm1 = await sembrarFM1(siembra);
    const invocaciones: string[] = [];

    const { respuesta } = pedir(fm1.patientId, cookieAdmin, {
      envolver: (real) => ({
        calcular: (id) => {
          invocaciones.push(id);
          return real.calcular(id);
        },
      }),
    });
    const resultado = await respuesta;

    expect(resultado.status).toBe(403);
    expect(resultado.body.error).toBe('PERMISO_DENEGADO');
    expect(invocaciones).toEqual([]);
  });
});

describe('paciente inexistente', () => {
  it('responde 404 con error y message cuando el UUID no corresponde a ningún paciente [US-003 AC-5]', async () => {
    const { respuesta } = pedir(PACIENTE_INEXISTENTE);

    const resultado = await respuesta;

    expect(resultado.status).toBe(404);
    expect(resultado.body).toMatchObject({ error: 'NO_ENCONTRADO' });
    expect(typeof resultado.body.message).toBe('string');
  });

  it('responde 404 sin registrar errores de la base de datos cuando el patientId está mal formado [US-003 AC-5]', async () => {
    const { respuesta, logger } = pedir('no-es-un-uuid');

    const resultado = await respuesta;

    expect(resultado.status).toBe(404);
    expect(logger.texto()).not.toMatch(/invalid input syntax|uuid/i);
  });
});

describe('tipo de cáncer no habilitado', () => {
  it('devuelve 200 con items vacíos y cancerTypeEnabled false cuando el tipo del diagnóstico no está en ENABLED_CANCER_TYPES [US-003 AC-6]', async () => {
    const fm1 = await sembrarFM1(siembra);

    const { respuesta } = pedir(fm1.patientId, cookieDoctor, { habilitados: ['prostata'] });
    const resultado = await respuesta;

    expect(resultado.status).toBe(200);
    expect(resultado.body).toEqual({
      catalogVersion: 'test-1.0.0',
      cancerTypeEnabled: false,
      items: [],
    });
  });

  it('devuelve 200 con items vacíos y cancerTypeEnabled false cuando el paciente no tiene diagnóstico activo [US-003 AC-6]', async () => {
    const sinDiagnostico = await nuevoPaciente(siembra);

    const { respuesta } = pedir(sinDiagnostico.patientId);
    const resultado = await respuesta;

    expect(resultado.status).toBe(200);
    expect(resultado.body).toEqual({
      catalogVersion: 'test-1.0.0',
      cancerTypeEnabled: false,
      items: [],
    });
  });

  it('devuelve 200 cuando el diagnóstico activo está rechazado y no queda ninguno vigente [US-003 AC-6]', async () => {
    const rechazado = await nuevoPaciente(siembra);
    await sembrarDiagnostico(rechazado, {
      cancerType: 'mama',
      histology: 'carcinoma ductal infiltrante',
      grade: '2',
      stagingSystem: 'TNM_8',
      stageValue: 'IIA',
      performanceValue: 1,
      reviewStatus: 'rechazado',
    });

    const { respuesta } = pedir(rechazado.patientId);
    const resultado = await respuesta;

    expect(resultado.status).toBe(200);
    expect(resultado.body.items).toEqual([]);
    expect(resultado.body.cancerTypeEnabled).toBe(false);
  });
});
