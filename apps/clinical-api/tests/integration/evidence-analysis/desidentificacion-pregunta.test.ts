import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  PII_FX_T4A_A,
  TODAS_LAS_FUENTES,
  abrirSesion,
  crearPacienteFxT4aA,
  crearPacienteSintetico,
  idDePaciente,
  montarGateway,
  prepararMundoConSeed,
  ragSimulado,
  type MundoDeGateway,
} from '../../support/gateway.js';
import { lectorDeIdentidadFalso } from '../../support/desidentificacion.js';
import { traceIdsFijos } from '../../support/usuarios.js';

const ESPACIO_DE_IDS = 501;
const TOKEN_DE_SESION = 'SINT-cookie-sesion-desidentificacion-0001';

// Datos FICTICIOS de FX-T4a-a y FX-T4a-c (backlog FEAT-T4a). Los números se arman por partes: el escáner de PII de la
// CI no distingue un valor sintético de uno real (US-036).
const CEDULA_DEL_MENOR = ['1098', '765432'].join('');
const IDENTIDAD_A = {
  nombreCompleto: PII_FX_T4A_A.nombre,
  documento: PII_FX_T4A_A.cedula,
  telefono: PII_FX_T4A_A.telefono,
};
const IDENTIDAD_C = {
  nombreCompleto: 'Tomás Rondón',
  documento: CEDULA_DEL_MENOR,
  representante: { nombreCompleto: PII_FX_T4A_A.nombre, documento: PII_FX_T4A_A.cedula },
};
const PREGUNTA_AC1 = `¿Qué opciones describe la evidencia para Lucía Rondón, CC ${PII_FX_T4A_A.cedula}, HER2 3+?`;
const TELEFONO_ESCRITO = ['300', '123', '4567'].join(' ');

// Un solo generador por archivo: los traceId de los registros persistidos no se repiten entre tests.
const generadorDeTraza = traceIdsFijos();
const rag = ragSimulado();
let mundo: MundoDeGateway;
let cookie: string;
let pacienteA: string;
let pacienteMenor: string;

beforeAll(async () => {
  rag.iniciar();
  mundo = await prepararMundoConSeed('gw_desid_pregunta', ESPACIO_DE_IDS);
  cookie = await abrirSesion(mundo, 'doc1@test.local', TOKEN_DE_SESION);
  pacienteA = await crearPacienteFxT4aA(mundo);
  pacienteMenor = await crearPacienteSintetico(mundo, { conDiagnostico: true });
});
beforeEach(() => rag.reiniciar());
afterEach(() => rag.reiniciar());
afterAll(async () => {
  rag.detener();
  await mundo.cerrar();
});

const montar = () =>
  montarGateway(mundo, {
    traceIds: { traceId: generadorDeTraza },
    identidades: lectorDeIdentidadFalso({
      [pacienteA]: IDENTIDAD_A,
      [pacienteMenor]: IDENTIDAD_C,
    }),
  });

async function analizar(
  app: Awaited<ReturnType<typeof montar>>['app'],
  patientId: string,
  query: string,
) {
  return request(app)
    .post('/platform/evidence-analyses')
    .set('Cookie', cookie)
    .send({ patientId, query, sourcesSelected: TODAS_LAS_FUENTES });
}

const consultaEnviada = (): string => (rag.capturadas[0]?.cuerpo['query'] as string) ?? '';

describe('desidentificación de la pregunta enviada a la IA', () => {
  it('envía la query con marcadores en lugar de nombre y documento y conserva HER2 3+, sin patientId ni birthYear en el payload, cuando doc1 pregunta por el nombre y el documento sintéticos de FX-T4a-a [US-049 AC-1]', async () => {
    const { app } = await montar();

    await analizar(app, pacienteA, PREGUNTA_AC1);

    expect(rag.llamadas()).toBe(1);
    const payload = rag.capturadas[0]!.texto;
    for (const prohibido of [
      PII_FX_T4A_A.cedula,
      'Lucía',
      'Rondón',
      PII_FX_T4A_A.telefono,
      pacienteA,
      'birthYear',
      '1971',
    ]) {
      expect(payload).not.toContain(prohibido);
    }
    expect(consultaEnviada()).toContain('HER2 3+');
    expect(consultaEnviada()).toContain('[NOMBRE]');
    expect(consultaEnviada()).toContain('[DOCUMENTO]');
  });

  it('enmascara la identidad del representante cuando la pregunta nombra a la representante de FX-T4a-c [US-049 AC-1]', async () => {
    const { app } = await montar();
    const pregunta = `¿Qué describe la evidencia para Tomás, documento ${CEDULA_DEL_MENOR}, acompañado por su madre Lucía Rondón, CC ${PII_FX_T4A_A.cedula}?`;

    await analizar(app, pacienteMenor, pregunta);

    expect(rag.llamadas()).toBe(1);
    for (const prohibido of ['Tomás', 'Lucía', 'Rondón', CEDULA_DEL_MENOR, PII_FX_T4A_A.cedula]) {
      expect(consultaEnviada()).not.toContain(prohibido);
    }
  });

  it('aplica solo los formatos de config/pii-formats.json cuando el paciente no tiene identidad registrada [US-049 AC-1]', async () => {
    const { app } = await montar();
    const documento = ['DNI', ['1234', '5678'].join('')].join(' ');
    const pregunta = `¿Opciones para HER2 3+? Contacto ana.sintetica@ejemplo.test, ${documento}.`;

    await analizar(app, idDePaciente('b'), pregunta);

    expect(rag.llamadas()).toBe(1);
    expect(consultaEnviada()).toBe('¿Opciones para HER2 3+? Contacto [CORREO], DNI [DOCUMENTO].');
  });

  it('enmascara como [TELEFONO] un teléfono escrito con separadores tras la palabra clave teléfono con el formato de L1D-166 [US-049 AC-1]', async () => {
    const { app } = await montar();

    await analizar(
      app,
      idDePaciente('b'),
      `¿Qué opciones describe la evidencia para HER2 3+? Teléfono ${TELEFONO_ESCRITO}`,
    );

    expect(rag.llamadas()).toBe(1);
    expect(consultaEnviada()).not.toContain(TELEFONO_ESCRITO);
    expect(consultaEnviada()).not.toContain(PII_FX_T4A_A.telefono);
    expect(consultaEnviada()).toContain('[TELEFONO]');
    expect(consultaEnviada()).toContain('HER2 3+');
  });

  it('sustituye 15/03/2024 y 15 de marzo de 2024 por [FECHA] y conserva Gleason 4+3 [US-049 AC-3]', async () => {
    const { app } = await montar();

    await analizar(
      app,
      idDePaciente('b'),
      '¿Qué describe la evidencia tras progresión del 15/03/2024 con Gleason 4+3, confirmada el 15 de marzo de 2024?',
    );

    expect(rag.llamadas()).toBe(1);
    expect(consultaEnviada()).toBe(
      '¿Qué describe la evidencia tras progresión del [FECHA] con Gleason 4+3, confirmada el [FECHA]?',
    );
  });

  it('enmascara la descripción del evento con nombre, documento y teléfono sembrados en FX-T4a-a antes de enviarla [US-049 AC-1]', async () => {
    const { app } = await montar();

    await analizar(app, pacienteA, PREGUNTA_AC1);

    expect(rag.llamadas()).toBe(1);
    const contexto = rag.capturadas[0]!.cuerpo['clinicalContext'] as {
      events: { description: string }[];
    };
    expect(contexto.events).toHaveLength(1);
    expect(contexto.events[0]!.description).toBe(
      'Paciente [NOMBRE] [NOMBRE] (CC [DOCUMENTO]), tel. [TELEFONO], refiere dolor leve.',
    );
  });
});

describe('desidentificación: los logs solo llevan tipos', () => {
  it('registra traceId y los tipos nombre y documento, sin valores detectados ni la pregunta, cuando FX-T4a-a pregunta con PII [US-049 AC-1]', async () => {
    const { app, logger } = await montar();

    await analizar(app, pacienteA, PREGUNTA_AC1);

    expect(rag.llamadas()).toBe(1);
    const lineas = logger.lineas.filter((linea) =>
      String(linea['event']).startsWith('desidentificacion'),
    );
    expect(lineas.length).toBeGreaterThan(0);
    const texto = JSON.stringify(lineas);
    for (const prohibido of [PII_FX_T4A_A.cedula, 'Lucía', 'Rondón', PREGUNTA_AC1]) {
      expect(texto).not.toContain(prohibido);
    }
    expect(lineas.every((linea) => /^req_\d{8}$/.test(String(linea['traceId'])))).toBe(true);
    expect(texto).toContain('"nombre"');
    expect(texto).toContain('"documento"');
  });
});
