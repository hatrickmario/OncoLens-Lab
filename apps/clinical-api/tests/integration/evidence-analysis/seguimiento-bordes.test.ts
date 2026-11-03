import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import errorDesidentificacion from '../../../../../contracts/examples/error-desidentificacion-no-disponible.json' with { type: 'json' };
import ragCatalogoEnConflicto from '../../../../../contracts/examples/rag-catalog-version-mismatch.json' with { type: 'json' };
import ragValidacion from '../../../../../contracts/examples/rag-validacion-422.json' with { type: 'json' };
import ragLlmNoDisponible from '../../../../../contracts/examples/rag-llm-local-no-disponible.json' with { type: 'json' };
import ragNliNoDisponible from '../../../../../contracts/examples/rag-nli-no-disponible.json' with { type: 'json' };
import { detectoresCaidos, lectorDeIdentidadFalso } from '../../support/desidentificacion.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';
import {
  SIN_EVIDENCIA,
  abrirSesion,
  idDePaciente,
  montarGateway,
  prepararMundoConSeed,
  ragSimulado,
  type MundoDeGateway,
} from '../../support/gateway.js';
import {
  PREGUNTA_DE_SEGUIMIENTO,
  crearAnalisisConEvidencia,
  instalarFalloDeEscrituraDelTurno,
  leerTurnos,
  rutaDeSeguimiento,
  sembrarTurnos,
  textoDeLosTurnos,
} from '../../support/seguimiento.js';

const ESPACIO_DE_IDS = 9650;
const UUID_INEXISTENTE = '00000000-0000-4000-8000-000000000000';

const rag = ragSimulado();
let mundo: MundoDeGateway;
let cookie: string;
let cookieAdmin: string;

beforeAll(async () => {
  rag.iniciar();
  mundo = await prepararMundoConSeed('gw_seguimiento_bordes', ESPACIO_DE_IDS);
  cookie = await abrirSesion(mundo, 'doc1@test.local', 'SINT-cookie-seguimiento-bordes-doc');
  cookieAdmin = await abrirSesion(mundo, 'admin@test.local', 'SINT-cookie-seguimiento-bordes-adm');
});
beforeEach(() => rag.reiniciar());
afterEach(() => rag.reiniciar());
afterAll(async () => {
  rag.detener();
  await mundo.cerrar();
});

const montar = (opciones: Parameters<typeof montarGateway>[1] = {}) =>
  montarGateway(mundo, { analysisMaxOptions: 3, ...opciones });

/** Análisis con evidencia sobre el paciente `a`, con la IA ya en cero llamadas. */
async function analisisConEvidencia(opciones: Parameters<typeof montarGateway>[1] = {}) {
  const { app } = await montar(opciones);
  const analisis = await crearAnalisisConEvidencia(app, cookie, rag, idDePaciente('a'));
  rag.reiniciar();
  return { app, analisis };
}

const preguntar = (
  app: Awaited<ReturnType<typeof montar>>['app'],
  analysisId: string,
  galleta: string | null = cookie,
) => {
  const peticion = clienteVerificado(app).post(rutaDeSeguimiento(analysisId));
  return (galleta === null ? peticion : peticion.set('Cookie', galleta)).send({
    question: PREGUNTA_DE_SEGUIMIENTO,
  });
};

describe('bordes del seguimiento sin invocar a la IA', () => {
  it('responde 401 sin llamar a la IA cuando no hay sesión [US-218 AC-6]', async () => {
    const { app, analisis } = await analisisConEvidencia();

    const respuesta = await preguntar(app, analisis.id, null);

    expect(respuesta.status).toBe(401);
    expect(rag.seguimiento.llamadas()).toBe(0);
  });

  it('responde 403 al administrador en POST y en GET, sin llamar a la IA [US-218 AC-6]', async () => {
    const { app, analisis } = await analisisConEvidencia();

    const crear = await preguntar(app, analisis.id, cookieAdmin);
    const leer = await clienteVerificado(app)
      .get(rutaDeSeguimiento(analisis.id))
      .set('Cookie', cookieAdmin);

    expect([crear.status, leer.status]).toEqual([403, 403]);
    expect(rag.seguimiento.llamadas()).toBe(0);
    expect(await leerTurnos(mundo.cliente, analisis.id)).toEqual([]);
  });

  it('responde 404 sin llamar a la IA cuando el análisis no existe o el identificador está mal formado [US-218 AC-1]', async () => {
    const { app } = await montar();

    const inexistente = await preguntar(app, UUID_INEXISTENTE);
    const malFormado = await preguntar(app, 'no-es-un-uuid');
    const lectura = await clienteVerificado(app)
      .get(rutaDeSeguimiento(UUID_INEXISTENTE))
      .set('Cookie', cookie);

    expect([inexistente.status, malFormado.status, lectura.status]).toEqual([404, 404, 404]);
    expect(rag.seguimiento.llamadas()).toBe(0);
  });

  it('responde 422 ANALISIS_SIN_EVIDENCIA sin llamar a la IA cuando el análisis es sin_evidencia [US-218 AC-3]', async () => {
    const { app } = await montar();
    rag.responder(SIN_EVIDENCIA);
    const creado = await clienteVerificado(app)
      .post('/platform/evidence-analyses')
      .set('Cookie', cookie)
      .send({
        patientId: idDePaciente('a'),
        query: '¿Qué opciones describe la evidencia para un tumor inexistente en el corpus?',
        sourcesSelected: { guias: true, ensayos: true, publicaciones: true },
      });
    expect(creado.body.status).toBe('sin_evidencia');
    rag.reiniciar();

    const respuesta = await preguntar(app, creado.body.id as string);

    expect(respuesta.status).toBe(422);
    expect(respuesta.body.error).toBe('ANALISIS_SIN_EVIDENCIA');
    expect(rag.seguimiento.llamadas()).toBe(0);
  });

  it('responde 503 DESIDENTIFICACION_NO_DISPONIBLE sin llamar a la IA ni persistir cuando el detector de PII falla [US-218 AC-6]', async () => {
    const { analisis } = await analisisConEvidencia();
    const { app } = await montar({
      traceIds: { traceId: () => 'req_SegDesid0001' },
      identidades: lectorDeIdentidadFalso({}),
      detectores: detectoresCaidos(),
    });

    const respuesta = await preguntar(app, analisis.id);

    expect(respuesta.status).toBe(503);
    expect(respuesta.body).toEqual({ ...errorDesidentificacion, traceId: 'req_SegDesid0001' });
    expect(rag.seguimiento.llamadas()).toBe(0);
    expect(await leerTurnos(mundo.cliente, analisis.id)).toEqual([]);
  });
});

describe('fallos de rag-orchestrator sin consumir turno', () => {
  it('responde 503 LOCAL_LLM_UNAVAILABLE y no persiste turno cuando el LLM local no está disponible [US-218 AC-1]', async () => {
    const { app, analisis } = await analisisConEvidencia();
    rag.seguimiento.responder({ tipo: 'json', status: 503, cuerpo: ragLlmNoDisponible });

    const respuesta = await preguntar(app, analisis.id);

    expect(respuesta.status).toBe(503);
    expect(respuesta.body.error).toBe('LOCAL_LLM_UNAVAILABLE');
    expect(await leerTurnos(mundo.cliente, analisis.id)).toEqual([]);
  });

  it('responde 504 y no persiste turno cuando rag-orchestrator no responde antes del deadline [US-218 AC-1]', async () => {
    const { app, analisis } = await analisisConEvidencia();
    rag.seguimiento.responder({ tipo: 'tardia' });

    const respuesta = await preguntar(app, analisis.id);

    expect(respuesta.status).toBe(504);
    expect(await leerTurnos(mundo.cliente, analisis.id)).toEqual([]);
  });

  it('responde 502 sin texto generado y no persiste turno cuando el NLI de rag-orchestrator no está disponible [US-218 AC-1]', async () => {
    const { app, analisis } = await analisisConEvidencia();
    rag.seguimiento.responder({ tipo: 'json', status: 503, cuerpo: ragNliNoDisponible });

    const respuesta = await preguntar(app, analisis.id);

    expect(respuesta.status).toBe(502);
    expect(respuesta.body).not.toHaveProperty('answer');
    expect(await leerTurnos(mundo.cliente, analisis.id)).toEqual([]);
  });

  it('responde 502 y no persiste turno cuando la respuesta de rag-orchestrator no cumple el contrato [US-218 AC-1]', async () => {
    const { app, analisis } = await analisisConEvidencia();
    rag.seguimiento.responder({ tipo: 'json', status: 200, cuerpo: { status: 'con_evidencia' } });

    const respuesta = await preguntar(app, analisis.id);

    expect(respuesta.status).toBe(502);
    expect(await leerTurnos(mundo.cliente, analisis.id)).toEqual([]);
  });
});

describe('409 y 422 de rag-orchestrator se exponen como 502 (el spec del seguimiento no los declara)', () => {
  it('responde 502 con resultado catalogo_en_conflicto, sin persistir turno, cuando rag responde 409 CATALOG_VERSION_MISMATCH [US-218 AC-1]', async () => {
    const { analisis } = await analisisConEvidencia();
    const { app, logger } = await montar();
    rag.seguimiento.responder({ tipo: 'json', status: 409, cuerpo: ragCatalogoEnConflicto });

    const respuesta = await preguntar(app, analisis.id);

    expect(respuesta.status).toBe(502);
    expect(respuesta.body.error).toBe('ERROR_SERVICIO_IA');
    expect(logger.lineas.map((l) => l['resultado'])).toContain('catalogo_en_conflicto');
    expect(await leerTurnos(mundo.cliente, analisis.id)).toEqual([]);
  });

  it('responde 502 con resultado validacion_rechazada_por_rag, sin persistir turno, cuando rag responde 422 [US-218 AC-1]', async () => {
    const { analisis } = await analisisConEvidencia();
    const { app, logger } = await montar();
    rag.seguimiento.responder({ tipo: 'json', status: 422, cuerpo: ragValidacion });

    const respuesta = await preguntar(app, analisis.id);

    expect(respuesta.status).toBe(502);
    expect(logger.lineas.map((l) => l['resultado'])).toContain('validacion_rechazada_por_rag');
    expect(await leerTurnos(mundo.cliente, analisis.id)).toEqual([]);
  });
});

describe('datos no sintéticos no salen hacia la IA en el seguimiento (RN-12, defensa en profundidad)', () => {
  it('responde 502 sin llamar a rag-orchestrator ni persistir turno cuando el análisis es de datos reales anonimizados [US-218 AC-6]', async () => {
    const { app, analisis } = await analisisConEvidencia();
    // El análisis es inmutable por trigger: el test lo reclasifica con el trigger apagado, solo en su base.
    await mundo.cliente.query(
      'ALTER TABLE clinical.ai_analysis_record DISABLE TRIGGER ai_analysis_record_inmutable',
    );
    await mundo.cliente.query(
      `UPDATE clinical.ai_analysis_record SET data_classification = 'real_anonimizado' WHERE id = $1`,
      [analisis.id],
    );
    await mundo.cliente.query(
      'ALTER TABLE clinical.ai_analysis_record ENABLE TRIGGER ai_analysis_record_inmutable',
    );

    const respuesta = await preguntar(app, analisis.id);

    expect(respuesta.status).toBe(502);
    expect(respuesta.body.error).toBe('ERROR_SERVICIO_IA');
    expect(rag.seguimiento.llamadas()).toBe(0);
    expect(await leerTurnos(mundo.cliente, analisis.id)).toEqual([]);
  });
});

describe('persistencia del turno antes de responder (RN-06)', () => {
  it('responde 500 ERROR_INTERNO sin contenido generado ni eco del error cuando falla la inserción del turno [US-218 AC-1]', async () => {
    const { app, analisis } = await analisisConEvidencia();
    const quitar = await instalarFalloDeEscrituraDelTurno(mundo.cliente, 'FALLO-SINTETICO-TURNO');
    try {
      const respuesta = await preguntar(app, analisis.id);

      expect(respuesta.status).toBe(500);
      expect(respuesta.body.error).toBe('ERROR_INTERNO');
      expect(JSON.stringify(respuesta.body)).not.toContain('FALLO-SINTETICO-TURNO');
      expect(respuesta.body).not.toHaveProperty('answer');
    } finally {
      await quitar();
    }
    expect(await leerTurnos(mundo.cliente, analisis.id)).toEqual([]);
  });
});

describe('límite de seguimiento (RN-22)', () => {
  it('responde 409 con el tope de la configuración vigente aunque la Base guarde otro, sin llamar a la IA [US-218 AC-4]', async () => {
    const { analisis } = await analisisConEvidencia({ analysisFollowupMax: 4 });
    await sembrarTurnos(mundo, analisis.id, 2);
    const { app } = await montar({ analysisFollowupMax: 2 });

    const respuesta = await preguntar(app, analisis.id);

    expect(respuesta.status).toBe(409);
    expect(respuesta.body.error).toBe('LIMITE_SEGUIMIENTO');
    expect(rag.seguimiento.llamadas()).toBe(0);
  });

  it('con 9 turnos, dos preguntas simultáneas dan un 201 con turnNumber 10 y un 409, y la tabla queda con 10 turnos [US-218 AC-4]', async () => {
    const { app, analisis } = await analisisConEvidencia({ analysisFollowupMax: 10 });
    await sembrarTurnos(mundo, analisis.id, 9);

    const respuestas = await Promise.all([
      preguntar(app, analisis.id),
      preguntar(app, analisis.id),
    ]);

    expect(respuestas.map((r) => r.status).sort()).toEqual([201, 409]);
    const creada = respuestas.find((r) => r.status === 201)!;
    expect(creada.body.turnNumber).toBe(10);
    expect(await leerTurnos(mundo.cliente, analisis.id)).toHaveLength(10);
  });
});

describe('lectura del hilo de seguimiento', () => {
  it('devuelve los turnos en orden de creación con la pregunta enmascarada [US-218 AC-1]', async () => {
    const { app, analisis } = await analisisConEvidencia();
    await sembrarTurnos(mundo, analisis.id, 2);

    const respuesta = await clienteVerificado(app)
      .get(rutaDeSeguimiento(analisis.id))
      .set('Cookie', cookie);

    expect(respuesta.status).toBe(200);
    expect(respuesta.body.map((t: { turnNumber: number }) => t.turnNumber)).toEqual([1, 2]);
    expect(respuesta.body[0].question).toBe('pregunta sintética 1');
    expect(await textoDeLosTurnos(mundo.cliente, analisis.id)).toContain('pregunta sintética 2');
  });
});
