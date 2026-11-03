import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type {
  DatosDelCaso,
  RepositorioDeLaVistaDeCaso,
} from '../../../src/modules/case-view/ports.js';
import { piiSinteticaDePCaso, sembrarPCaso } from '../../support/caso.js';
import { montarCaso } from '../../support/caso-http.js';
import { prepararSiembra, sembrarFM2, type ContextoDeSiembra } from '../../support/completitud.js';
import { montarCompletitud } from '../../support/completitud-http.js';
import { generadorDeIds } from '../../support/filas-sinteticas.js';
import { abrirSesion, prepararMundoConSeed, type MundoDeGateway } from '../../support/gateway.js';
import { loggerJsonEnMemoria } from '../../support/usuarios.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';

const ESPACIO_DE_IDS = 7404;
const RUTA_DEL_EJEMPLO = new URL(
  '../../../../../contracts/examples/case-view-p-caso.json',
  import.meta.url,
);

let mundo: MundoDeGateway;
let siembra: ContextoDeSiembra;
let cookieDoctor: string;
let espacioDePCaso = 7440;

beforeAll(async () => {
  mundo = await prepararMundoConSeed('caso_contenido', ESPACIO_DE_IDS);
  siembra = await prepararSiembra(mundo.cliente, generadorDeIds(ESPACIO_DE_IDS + 500));
  cookieDoctor = await abrirSesion(mundo, 'doc1@test.local', 'SINT-cookie-doctor-caso-ct-0001');
});
afterAll(() => mundo.cerrar());

const pedirCaso = (id: string, opciones: Parameters<typeof montarCaso>[1] = {}) => {
  const { app, logger } = montarCaso(mundo, opciones);
  return {
    logger,
    respuesta: clienteVerificado(app)
      .get(`/platform/patients/${id}/case`)
      .set('Cookie', cookieDoctor),
  };
};

interface Vista {
  timeline: unknown[];
  priorTreatments: Record<string, unknown>[];
  attributes: Record<string, unknown>[];
  biomarkerSeries: {
    name: string;
    loincCode: string | null;
    points: {
      value: string;
      unit: string | null;
      performedAt: string;
      provenance: Record<string, unknown>;
    }[];
  }[];
  completeness: { item: string; status: string }[];
  catalogVersion: string;
}

async function vistaDeUnPCaso(): Promise<Vista> {
  const p = await sembrarPCaso(siembra, { espacio: ++espacioDePCaso });
  const respuesta = await pedirCaso(p.patientId).respuesta;
  expect(respuesta.status).toBe(200);
  return respuesta.body as Vista;
}

describe('GET /platform/patients/{id}/case · contenido y contrato', () => {
  it('trae Leuprorelina con atcCodes [L02AE02] y luego Bicalutamida con [L02BB03], con su provenance [US-088 AC-1] (D-8) [S5 resp. 10]', async () => {
    const vista = await vistaDeUnPCaso();

    expect(vista.priorTreatments).toMatchObject([
      {
        lineNumber: 1,
        setting: 'primera_linea_metastasica',
        regimenName: 'Leuprorelina',
        atcCodes: ['L02AE02'],
        endedAt: null,
        ongoing: true,
        provenance: { entryMethod: 'ocr', reviewStatus: 'verificado' },
      },
      {
        lineNumber: null,
        regimenName: 'Bicalutamida',
        atcCodes: ['L02BB03'],
        endedAt: '2025-11-15',
        endReason: 'completado',
        provenance: { entryMethod: 'manual', reviewStatus: 'verificado', sourceDocumentId: null },
      },
    ]);
  });

  it('responde igual que contracts/examples/case-view-p-caso.json cuando FX-02b-a se siembra sin PII [US-088 AC-1] [US-213]', async () => {
    const p = await sembrarPCaso(siembra);

    const respuesta = await pedirCaso(p.patientId).respuesta;

    expect(respuesta.status).toBe(200);
    expect(respuesta.body).toEqual(JSON.parse(readFileSync(RUTA_DEL_EJEMPLO, 'utf8')));
  });

  it('lleva Cache-Control no-store en el 200 de /case [S5 resp. 12]', async () => {
    const vista = await sembrarPCaso(siembra, { espacio: ++espacioDePCaso });

    const respuesta = await pedirCaso(vista.patientId).respuesta;

    expect(respuesta.status).toBe(200);
    expect(respuesta.headers['cache-control']).toBe('no-store');
  });

  it('trae attributes con estado_castracion y sitios_metastasicos con su provenance [US-088 AC-1] (D-8)', async () => {
    const vista = await vistaDeUnPCaso();

    expect(vista.attributes).toMatchObject([
      {
        key: 'estado_castracion',
        value: 'castrado',
        observedAt: '2026-07-15',
        provenance: { reviewStatus: 'auto_aceptado' },
      },
      { key: 'sitios_metastasicos', value: 'oseo', provenance: { reviewStatus: 'verificado' } },
    ]);
  });

  it('trae la serie de PSA con 4,1 · 6,8 · 9,5 y additionalSourceDocumentIds vacío, y la testosterona con 1 punto [US-088 AC-1] (D-8)', async () => {
    const vista = await vistaDeUnPCaso();

    const [psa, testosterona] = vista.biomarkerSeries;
    expect(psa?.name).toBe('PSA');
    expect(psa?.points.map((punto) => [punto.performedAt, punto.value, punto.unit])).toEqual([
      ['2026-01-10', '4.1', 'ng/mL'],
      ['2026-04-12', '6.8', 'ng/mL'],
      ['2026-07-15', '9.5', 'ng/mL'],
    ]);
    for (const punto of psa?.points ?? []) {
      expect(punto.provenance['additionalSourceDocumentIds']).toEqual([]);
    }
    expect(testosterona?.name).toBe('Testosterona');
    expect(testosterona?.points).toHaveLength(1);
  });

  it('copia completeness y catalogVersion de F-M2 con test-1.0.0 iguales a los de /completeness [US-088 AC-8]', async () => {
    const fm2 = await sembrarFM2(siembra);

    const caso = await pedirCaso(fm2.patientId).respuesta;
    const checklist = await clienteVerificado(montarCompletitud(mundo).app)
      .get(`/platform/patients/${fm2.patientId}/completeness`)
      .set('Cookie', cookieDoctor);

    expect(caso.status).toBe(200);
    expect(checklist.status).toBe(200);
    const vista = caso.body as Vista;
    const esperado = checklist.body as {
      catalogVersion: string;
      items: { item: string; status: string }[];
    };
    expect(vista.completeness).toHaveLength(12);
    expect(vista.completeness).toEqual(
      esperado.items.map(({ item, status }) => ({ item, status })),
    );
    expect(vista.catalogVersion).toBe('test-1.0.0');
    expect(vista.catalogVersion).toBe(esperado.catalogVersion);
  });

  it('responde completeness [] y el timeline completo cuando el tipo de cáncer no está habilitado', async () => {
    const p = await sembrarPCaso(siembra, { espacio: ++espacioDePCaso });

    const respuesta = await pedirCaso(p.patientId, { habilitados: ['mama'] }).respuesta;

    expect(respuesta.status).toBe(200);
    const vista = respuesta.body as Vista;
    expect(vista.completeness).toEqual([]);
    expect(vista.timeline).toHaveLength(11);
  });

  it('no registra en los logs de /case la PII sintética, la description ni los valores de PSA [RN-10]', async () => {
    const logger = loggerJsonEnMemoria();
    const pii = piiSinteticaDePCaso();
    const p = await sembrarPCaso(siembra, {
      espacio: ++espacioDePCaso,
      conPiiEnLaToxicidad: true,
    });

    const respuesta = await pedirCaso(p.patientId, { logger }).respuesta;

    expect(respuesta.status).toBe(200);
    expect(logger.lineas.length).toBeGreaterThan(0);
    const texto = logger.texto();
    for (const prohibido of [
      pii.nombre,
      pii.documento,
      pii.descripcion,
      'Leuprorelina',
      '9.5',
      '6.8',
    ]) {
      expect(texto).not.toContain(prohibido);
    }
  });

  it('responde 500 ErrorInterno sin datos del paciente cuando falla el repositorio [S5 resp. 13]', async () => {
    const p = await sembrarPCaso(siembra, { espacio: ++espacioDePCaso, conPiiEnLaToxicidad: true });
    // Fake del puerto: mismo contrato de errores que el real (lanza; nunca devuelve un CaseView parcial).
    const repositorioQueFalla: RepositorioDeLaVistaDeCaso = {
      existePaciente: () => Promise.resolve(true),
      leerDatosDelCaso: (): Promise<DatosDelCaso> =>
        Promise.reject(new Error('SINT conexión rechazada')),
    };

    const respuesta = await pedirCaso(p.patientId, { repositorio: repositorioQueFalla }).respuesta;

    expect(respuesta.status).toBe(500);
    expect(respuesta.body).toMatchObject({ error: 'ERROR_INTERNO' });
    expect(JSON.stringify(respuesta.body)).not.toContain(piiSinteticaDePCaso().nombre);
    expect(JSON.stringify(respuesta.body)).not.toContain('timeline');
  });
});
