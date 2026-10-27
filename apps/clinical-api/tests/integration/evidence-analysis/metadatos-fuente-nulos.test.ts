import { clienteVerificado } from '../../support/verificarProveedor.js';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  PREGUNTA_Q_HER2,
  TODAS_LAS_FUENTES,
  abrirSesion,
  idDePaciente,
  leerRegistroPorTrace,
  montarGateway,
  prepararMundoConSeed,
  ragSimulado,
  type MundoDeGateway,
} from '../../support/gateway.js';

const ESPACIO_DE_IDS = 1820;
const TOKEN_DE_SESION = 'SINT-cookie-sesion-metadatos-fuente-0182';

const rag = ragSimulado();
let mundo: MundoDeGateway;
let cookie: string;

beforeAll(async () => {
  rag.iniciar();
  mundo = await prepararMundoConSeed('gw_metadatos_fuente', ESPACIO_DE_IDS);
  cookie = await abrirSesion(mundo, 'doc1@test.local', TOKEN_DE_SESION);
});
beforeEach(() => rag.reiniciar());
afterEach(() => rag.reiniciar());
afterAll(async () => {
  rag.detener();
  await mundo.cerrar();
});

type Cita = Record<string, unknown>;

/** Recoge toda cita (objeto con `chunkId`) de cualquier parte del análisis, sin asumir su ubicación. */
function citasDe(valor: unknown, acumulado: Cita[] = []): Cita[] {
  if (Array.isArray(valor)) valor.forEach((elemento) => citasDe(elemento, acumulado));
  else if (valor !== null && typeof valor === 'object') {
    const objeto = valor as Cita;
    if ('chunkId' in objeto && 'primaryEndpoint' in objeto) acumulado.push(objeto);
    Object.values(objeto).forEach((elemento) => citasDe(elemento, acumulado));
  }
  return acumulado;
}

describe('metadatos de la fuente en la cita (US-127)', () => {
  it('persiste y devuelve primaryEndpoint y sampleSize en null cuando rag-orchestrator los devuelve null [US-127 AC-3]', async () => {
    const { app } = await montarGateway(mundo, { traceIds: { traceId: () => 'req_MetaNulos001' } });

    const respuesta = await clienteVerificado(app)
      .post('/platform/evidence-analyses')
      .set('Cookie', cookie)
      .send({
        patientId: idDePaciente('a'),
        query: PREGUNTA_Q_HER2,
        sourcesSelected: TODAS_LAS_FUENTES,
      });

    expect(respuesta.status).toBe(200);
    const enRespuesta = citasDe(respuesta.body.evidenceOptions);
    expect(enRespuesta.length).toBeGreaterThan(0);
    for (const cita of enRespuesta) {
      expect(cita.primaryEndpoint).toBeNull();
      expect(cita.sampleSize).toBeNull();
    }
    const fila = await leerRegistroPorTrace(mundo.cliente, 'req_MetaNulos001');
    const persistidas = citasDe(fila!.evidence_options);
    expect(persistidas.length).toBe(enRespuesta.length);
    for (const cita of persistidas) {
      expect(cita).toHaveProperty('primaryEndpoint', null);
      expect(cita).toHaveProperty('sampleSize', null);
    }
  });
});
