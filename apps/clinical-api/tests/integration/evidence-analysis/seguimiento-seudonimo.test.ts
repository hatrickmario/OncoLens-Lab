import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { clienteVerificado } from '../../support/verificarProveedor.js';
import {
  abrirSesion,
  idDePaciente,
  montarGateway,
  prepararMundoConSeed,
  pseudonimosFijos,
  ragSimulado,
  type MundoDeGateway,
} from '../../support/gateway.js';
import { traceIdsFijos } from '../../support/usuarios.js';
import {
  PREGUNTA_DE_SEGUIMIENTO,
  crearAnalisisConEvidencia,
  leerTurnos,
  rutaDeSeguimiento,
  textoDeLosTurnos,
} from '../../support/seguimiento.js';

const ESPACIO_DE_IDS = 9630;
const TOKEN_DE_SESION = 'SINT-cookie-sesion-seguimiento-seudonimo-0001';

const rag = ragSimulado();
let mundo: MundoDeGateway;
let cookie: string;

beforeAll(async () => {
  rag.iniciar();
  mundo = await prepararMundoConSeed('gw_seguimiento_seudonimo', ESPACIO_DE_IDS);
  cookie = await abrirSesion(mundo, 'doc1@test.local', TOKEN_DE_SESION);
});
beforeEach(() => rag.reiniciar());
afterEach(() => rag.reiniciar());
afterAll(async () => {
  rag.detener();
  await mundo.cerrar();
});

describe('seudónimo y traceId por turno de seguimiento (RN-11)', () => {
  it('usa seudónimo y traceId nuevos por turno, persiste el trace_id del turno y nunca el seudónimo [US-218 AC-8]', async () => {
    // Un solo generador de cada tipo: el análisis consume el primer traceId y el primer seudónimo.
    const { app } = await montarGateway(mundo, {
      traceIds: { traceId: traceIdsFijos() },
      pseudonimos: pseudonimosFijos(),
      analysisMaxOptions: 3,
    });
    const analisis = await crearAnalisisConEvidencia(app, cookie, rag, idDePaciente('a'));
    const delAnalisis = rag.capturadas[0]!;
    rag.reiniciar();

    const turnos = [];
    for (let n = 0; n < 2; n += 1) {
      turnos.push(
        await clienteVerificado(app)
          .post(rutaDeSeguimiento(analisis.id))
          .set('Cookie', cookie)
          .send({ question: PREGUNTA_DE_SEGUIMIENTO }),
      );
    }

    expect(turnos.map((t) => t.status)).toEqual([201, 201]);
    const [primero, segundo] = rag.seguimiento.capturadas;
    const seudonimoDe = (cuerpo: Record<string, unknown>) =>
      (cuerpo['clinicalContext'] as { pseudoPatientId: string }).pseudoPatientId;
    const seudonimos = [
      seudonimoDe(delAnalisis.cuerpo),
      seudonimoDe(primero!.cuerpo),
      seudonimoDe(segundo!.cuerpo),
    ];
    expect(new Set(seudonimos).size).toBe(3);
    const trazas = [
      delAnalisis.cuerpo['traceId'],
      primero!.cuerpo['traceId'],
      segundo!.cuerpo['traceId'],
    ];
    expect(new Set(trazas).size).toBe(3);
    // La cabecera lleva el mismo traceId que el cuerpo (NFR-10).
    expect(primero!.headers.get('x-trace-id')).toBe(primero!.cuerpo['traceId']);
    const filas = await leerTurnos(mundo.cliente, analisis.id);
    expect(filas.map((fila) => fila.trace_id)).toEqual([
      primero!.cuerpo['traceId'],
      segundo!.cuerpo['traceId'],
    ]);
    const persistido = await textoDeLosTurnos(mundo.cliente, analisis.id);
    for (const seudonimo of seudonimos) expect(persistido).not.toContain(seudonimo);
  });
});
