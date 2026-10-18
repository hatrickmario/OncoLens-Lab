import request from 'supertest';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { nuevoSeudonimo } from '../../../src/infrastructure/ids.js';
import { huellaDelContexto } from '../../../src/modules/evidence-analysis/analysis-record.js';
import {
  PII_FX_T4A_A,
  TODAS_LAS_FUENTES,
  abrirSesion,
  crearPacienteFxT4aA,
  leerRegistroPorTrace,
  montarGateway,
  prepararMundoConSeed,
  ragSimulado,
  type MundoDeGateway,
} from '../../support/gateway.js';
import { lectorDeIdentidadFalso } from '../../support/desidentificacion.js';
import { traceIdsFijos } from '../../support/usuarios.js';

const ESPACIO_DE_IDS = 502;
const TOKEN_DE_SESION = 'SINT-cookie-sesion-desidentificacion-0002';
const PREGUNTA_AC1 = `¿Qué opciones describe la evidencia para Lucía Rondón, CC ${PII_FX_T4A_A.cedula}, HER2 3+?`;
const IDENTIDAD_A = {
  nombreCompleto: PII_FX_T4A_A.nombre,
  documento: PII_FX_T4A_A.cedula,
  telefono: PII_FX_T4A_A.telefono,
};

// Un solo generador por archivo: los traceId de los registros persistidos no se repiten entre tests.
const generadorDeTraza = traceIdsFijos();
const rag = ragSimulado();
let mundo: MundoDeGateway;
let cookie: string;
let pacienteA: string;

beforeAll(async () => {
  rag.iniciar();
  mundo = await prepararMundoConSeed('gw_desid_contexto', ESPACIO_DE_IDS);
  cookie = await abrirSesion(mundo, 'doc1@test.local', TOKEN_DE_SESION);
  pacienteA = await crearPacienteFxT4aA(mundo);
});
beforeEach(() => rag.reiniciar());
afterEach(() => rag.reiniciar());
afterAll(async () => {
  rag.detener();
  await mundo.cerrar();
});

type App = Awaited<ReturnType<typeof montarGateway>>['app'];

const montar = (opciones: Parameters<typeof montarGateway>[1] = {}) =>
  montarGateway(mundo, {
    traceIds: { traceId: generadorDeTraza },
    identidades: lectorDeIdentidadFalso({ [pacienteA]: IDENTIDAD_A }),
    ...opciones,
  });

const analizar = (app: App, query: string = PREGUNTA_AC1) =>
  request(app)
    .post('/platform/evidence-analyses')
    .set('Cookie', cookie)
    .send({ patientId: pacienteA, query, sourcesSelected: TODAS_LAS_FUENTES });

interface ContextoCapturado {
  pseudoPatientId: string;
  diagnosis: { monthsSinceDiagnosis: number };
  biomarkers: { biomarkerName: string; monthsAgo: number }[];
  priorTreatments: { monthsSinceStart: number; monthsSinceEnd: number }[];
  clinicalNotes: unknown[];
  [clave: string]: unknown;
}
const contextoDe = (indice: number): ContextoCapturado =>
  rag.capturadas[indice]!.cuerpo['clinicalContext'] as ContextoCapturado;

describe('desidentificación del contexto enviado a la IA', () => {
  it('envía pseudoPatientId distintos que no contienen el patientId y no se persisten cuando se ejecutan dos análisis seguidos [US-049 AC-2]', async () => {
    const { app } = await montar({ pseudonimos: { nuevo: nuevoSeudonimo } });

    await analizar(app);
    await analizar(app);

    expect(rag.llamadas()).toBe(2);
    const [primero, segundo] = [contextoDe(0).pseudoPatientId, contextoDe(1).pseudoPatientId];
    expect(primero).toMatch(/^psd_[A-Za-z0-9]+$/);
    expect(segundo).toMatch(/^psd_[A-Za-z0-9]+$/);
    expect(primero).not.toBe(segundo);
    for (const seudonimo of [primero, segundo]) {
      expect(seudonimo).not.toContain(pacienteA);
      expect(seudonimo).not.toContain(pacienteA.replaceAll('-', ''));
    }
    const { rows } = await mundo.cliente.query<{ fila: string }>(
      'SELECT row_to_json(r)::text AS fila FROM clinical.ai_analysis_record r WHERE patient_id = $1',
      [pacienteA],
    );
    expect(rows).toHaveLength(2);
    for (const { fila } of rows) {
      expect(fila).not.toContain(primero);
      expect(fila).not.toContain(segundo);
    }
  });

  it('el clinicalContext no contiene fechas AAAA-MM-DD y trae 14, 13, 12 y 8 meses relativos cuando se analiza FX-T4a-a con el reloj congelado [US-049 AC-3]', async () => {
    const { app } = await montar();

    await analizar(app);

    expect(rag.llamadas()).toBe(1);
    const contexto = contextoDe(0);
    expect(JSON.stringify(contexto)).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(contexto.diagnosis.monthsSinceDiagnosis).toBe(14);
    expect(contexto.biomarkers.find((b) => b.biomarkerName === 'HER2')?.monthsAgo).toBe(13);
    expect(contexto.priorTreatments[0]?.monthsSinceStart).toBe(12);
    expect(contexto.priorTreatments[0]?.monthsSinceEnd).toBe(8);
  });

  it('envía clinicalNotes vacío cuando FX-T4a-a tiene una nota con nombre, documento y teléfono [US-049 AC-4]', async () => {
    const { app } = await montar();

    await analizar(app);

    expect(rag.llamadas()).toBe(1);
    expect(contextoDe(0).clinicalNotes).toEqual([]);
    expect(rag.capturadas[0]!.texto).not.toContain(PII_FX_T4A_A.telefono);
  });

  it('persiste un clinical_context_snapshot con el mismo hash canónico que el clinicalContext enviado sin pseudoPatientId y sin identificadores, y un query_text enmascarado [US-049 AC-6]', async () => {
    const { app } = await montar({ traceIds: { traceId: () => 'req_AC6Snap01' } });

    await analizar(app);

    expect(rag.llamadas()).toBe(1);
    const registro = await leerRegistroPorTrace(mundo.cliente, 'req_AC6Snap01');
    expect(registro).toBeDefined();
    const { pseudoPatientId, ...enviadoSinSeudonimo } = contextoDe(0);
    expect(pseudoPatientId).toMatch(/^psd_/);
    expect(registro!.clinical_context_snapshot).toEqual(enviadoSinSeudonimo);
    expect(registro!.context_fingerprint).toBe(huellaDelContexto(enviadoSinSeudonimo));
    const persistido = JSON.stringify([registro!.clinical_context_snapshot, registro!.query_text]);
    for (const prohibido of [
      PII_FX_T4A_A.cedula,
      'Lucía',
      'Rondón',
      PII_FX_T4A_A.telefono,
      pacienteA,
      'birthYear',
      '1971',
      pseudoPatientId,
    ]) {
      expect(persistido).not.toContain(prohibido);
    }
    expect(registro!.query_text).toContain('[DOCUMENTO]');
    expect(registro!.query_text).toContain('HER2 3+');
  });
});
