import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  prepararSiembra,
  piiSinteticaDeFM2,
  sembrarFM2,
  type ContextoDeSiembra,
} from '../../support/completitud.js';
import { etiquetasDelCatalogo, montarCompletitud } from '../../support/completitud-http.js';
import { generadorDeIds } from '../../support/filas-sinteticas.js';
import {
  abrirSesion,
  prepararMundoConSeed,
  TRACE_ID_GENERADO,
  type MundoDeGateway,
} from '../../support/gateway.js';
import { capturarSalidas } from '../../support/captura-de-salidas.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';

const ESPACIO_DE_IDS = 9503;
let mundo: MundoDeGateway;
let siembra: ContextoDeSiembra;
let cookieDoctor: string;

beforeAll(async () => {
  mundo = await prepararMundoConSeed('compl_nofuga_ep', ESPACIO_DE_IDS);
  siembra = await prepararSiembra(mundo.cliente, generadorDeIds(ESPACIO_DE_IDS + 500));
  cookieDoctor = await abrirSesion(mundo, 'doc1@test.local', 'SINT-cookie-doctor-nofuga-ep-0001');
});
afterAll(() => mundo.cerrar());

describe('no-fuga de /completeness', () => {
  it('registra solo UUID, traceId, catalogVersion y conteos, sin identidad, valores ni etiquetas, cuando el doctor consulta F-M2', async () => {
    const fm2 = await sembrarFM2(siembra);
    const { app, logger } = montarCompletitud(mundo);
    const etiquetas = Object.values(etiquetasDelCatalogo('mama'));

    const salidas = await capturarSalidas(async () => {
      await clienteVerificado(app)
        .get(`/platform/patients/${fm2.patientId}/completeness`)
        .set('Cookie', cookieDoctor);
    });

    const linea = logger.lineas.find((l) => l.event === 'completeness.consulta');
    expect(linea).toEqual({
      event: 'completeness.consulta',
      resultado: 'ok',
      traceId: TRACE_ID_GENERADO,
      patientId: fm2.patientId,
      catalogVersion: 'test-1.0.0',
      total: 12,
      faltantes: 6,
    });
    const pii = piiSinteticaDeFM2();
    const todo = `${logger.texto()}\n${salidas}`;
    for (const secreto of [
      pii.nombre,
      pii.documento,
      'letrozol',
      'Positivo',
      'carcinoma',
      ...etiquetas,
    ]) {
      expect(todo).not.toContain(secreto);
    }
  });
});
