import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { detectoresCaidos, lectorDeIdentidadFalso } from '../../support/desidentificacion.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';
import {
  TODAS_LAS_FUENTES,
  PREGUNTA_Q_HER2,
  abrirSesion,
  idDePaciente,
  montarGateway,
  prepararMundoConSeed,
  ragSimulado,
  type MundoDeGateway,
  type OpcionesDeGateway,
} from '../../support/gateway.js';
import {
  PREGUNTA_DE_SEGUIMIENTO,
  crearAnalisisConEvidencia,
  rutaDeSeguimiento,
} from '../../support/seguimiento.js';

const ESPACIO_DE_IDS = 9680;
const TRACE_ENTRANTE = 'req_Entrante001';

const rag = ragSimulado();
let mundo: MundoDeGateway;
let cookie: string;

beforeAll(async () => {
  rag.iniciar();
  mundo = await prepararMundoConSeed('gw_seguimiento_paridad', ESPACIO_DE_IDS);
  cookie = await abrirSesion(mundo, 'doc1@test.local', 'SINT-cookie-seguimiento-paridad-0001');
});
beforeEach(() => rag.reiniciar());
afterEach(() => rag.reiniciar());
afterAll(async () => {
  rag.detener();
  await mundo.cerrar();
});

const ESCENARIOS: [string, OpcionesDeGateway][] = [
  ['el detector de PII falla (503)', { detectores: detectoresCaidos() }],
  ['el entorno no es sintético (502)', { appEnv: 'piloto' }],
];

describe('los errores de desidentificación se traducen igual en el análisis y en el seguimiento', () => {
  it.each(ESCENARIOS)(
    'da el mismo status, código, resultado y traceIdEntrante en POST /evidence-analyses y en POST …/follow-ups cuando %s [US-218 AC-6]',
    async (_nombre, opciones) => {
      const sano = await montarGateway(mundo, { analysisMaxOptions: 3 });
      const analisis = await crearAnalisisConEvidencia(sano.app, cookie, rag, idDePaciente('a'));
      rag.reiniciar();
      const roto = await montarGateway(mundo, {
        identidades: lectorDeIdentidadFalso({}),
        ...opciones,
      });

      const deAnalisis = await clienteVerificado(roto.app)
        .post('/platform/evidence-analyses')
        .set('Cookie', cookie)
        .set('X-Trace-Id', TRACE_ENTRANTE)
        .send({
          patientId: idDePaciente('a'),
          query: PREGUNTA_Q_HER2,
          sourcesSelected: TODAS_LAS_FUENTES,
        });
      const lineaDeAnalisis = roto.logger.lineas.at(-1)!;
      roto.logger.lineas.length = 0;
      const deSeguimiento = await clienteVerificado(roto.app)
        .post(rutaDeSeguimiento(analisis.id))
        .set('Cookie', cookie)
        .set('X-Trace-Id', TRACE_ENTRANTE)
        .send({ question: PREGUNTA_DE_SEGUIMIENTO });
      const lineaDeSeguimiento = roto.logger.lineas.at(-1)!;

      expect(deSeguimiento.status).toBe(deAnalisis.status);
      expect(deSeguimiento.body.error).toBe(deAnalisis.body.error);
      expect(lineaDeSeguimiento['resultado']).toBe(lineaDeAnalisis['resultado']);
      expect(lineaDeSeguimiento['motivo']).toBe(lineaDeAnalisis['motivo']);
      expect(lineaDeAnalisis['traceIdEntrante']).toBe(TRACE_ENTRANTE);
      expect(lineaDeSeguimiento['traceIdEntrante']).toBe(TRACE_ENTRANTE);
    },
  );
});
