import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { insertarFxT1aA, type FilasDeFxT1aA } from '../../support/filas-sinteticas.js';
import {
  PREGUNTA_Q_HER2,
  TODAS_LAS_FUENTES,
  abrirSesion,
  idDePaciente,
  leerRegistroPorTrace,
  montarGateway,
  prepararMundoConSeed,
  ragSimulado,
  type FilaDelRegistro,
  type MundoDeGateway,
} from '../../support/gateway.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';

const ESPACIO_DE_IDS = 1810;
const ESPACIO_DE_IDS_FX_T1A_A = 1811;

interface ProcedenciaEnviada {
  entryMethod: string;
  extractionConfidence: string | null;
  reviewStatus: string;
  conflict: boolean;
}
interface ContextoEnviado {
  diagnosis: { dataRef: string; provenance: ProcedenciaEnviada };
  biomarkers: {
    dataRef: string;
    biomarkerName: string;
    value: string;
    provenance: ProcedenciaEnviada;
  }[];
}
interface Analisis {
  contexto: ContextoEnviado;
  textoEnviado: string;
  registro: FilaDelRegistro;
}

const rag = ragSimulado();

beforeAll(() => rag.iniciar());
afterEach(() => rag.reiniciar());
afterAll(() => rag.detener());

/** Doc1 analiza al paciente `a`: devuelve el contexto enviado a Backend 2 y el registro persistido (misma consulta). */
async function analizarPacienteA(
  mundo: MundoDeGateway,
  cookie: string,
  traceId: string,
): Promise<Analisis> {
  const { app } = await montarGateway(mundo, { traceIds: { traceId: () => traceId } });
  const respuesta = await clienteVerificado(app)
    .post('/platform/evidence-analyses')
    .set('Cookie', cookie)
    .send({
      patientId: idDePaciente('a'),
      query: PREGUNTA_Q_HER2,
      sourcesSelected: TODAS_LAS_FUENTES,
    });
  expect(respuesta.status).toBe(200);
  const capturada = rag.capturadas[0]!;
  const registro = await leerRegistroPorTrace(mundo.cliente, traceId);
  return {
    contexto: capturada.cuerpo['clinicalContext'] as ContextoEnviado,
    textoEnviado: capturada.texto,
    registro: registro!,
  };
}

/** El `dataRef` que el registro enlaza con una fila concreta (el UUID nunca viaja en el contexto, RN-10). */
function dataRefDe(registro: FilaDelRegistro, entityId: string): string | undefined {
  return registro.patient_data_links.find((enlace) => enlace.entityId === entityId)?.dataRef;
}

describe('procedencia del contexto: paciente semilla sin datos por revisar', () => {
  let mundo: MundoDeGateway;
  let cookie: string;

  beforeAll(async () => {
    mundo = await prepararMundoConSeed('procedencia_seed', ESPACIO_DE_IDS);
    cookie = await abrirSesion(mundo, 'doc1@test.local', 'SINT-cookie-sesion-procedencia-0001');
  });
  afterAll(async () => {
    await mundo.cerrar();
  });

  it('lleva procedencia seed verificada y sin conflicto en el diagnóstico y cada biomarcador cuando doc1 analiza al paciente semilla (a) [US-065 AC-1]', async () => {
    const { contexto } = await analizarPacienteA(mundo, cookie, 'req_Procedencia01');

    expect(contexto.biomarkers.length).toBeGreaterThan(0);
    for (const dato of [contexto.diagnosis, ...contexto.biomarkers]) {
      expect(dato.provenance, dato.dataRef).toMatchObject({
        entryMethod: 'seed',
        reviewStatus: 'verificado',
        conflict: false,
      });
    }
  });
});

describe('procedencia del contexto: FX-T1a-a', () => {
  let mundo: MundoDeGateway;
  let cookie: string;
  let filas: FilasDeFxT1aA;

  beforeAll(async () => {
    mundo = await prepararMundoConSeed('procedencia_fx_t1a_a', ESPACIO_DE_IDS_FX_T1A_A);
    filas = await insertarFxT1aA(mundo.cliente, mundo.ids, idDePaciente('a'));
    cookie = await abrirSesion(mundo, 'doc1@test.local', 'SINT-cookie-sesion-procedencia-0002');
  });
  afterAll(async () => {
    await mundo.cerrar();
  });

  it('incluye el Ki-67 20 % con entryMethod ocr, extractionConfidence media y reviewStatus requiere_revision cuando el contexto viene de FX-T1a-a [US-065 AC-2]', async () => {
    const { contexto, registro } = await analizarPacienteA(mundo, cookie, 'req_Procedencia02');

    const dataRef = dataRefDe(registro, filas.ki67Id);
    const ki67 = contexto.biomarkers.find((biomarcador) => biomarcador.dataRef === dataRef);
    expect(dataRef).toBeDefined();
    expect(ki67).toMatchObject({
      value: '20 %',
      provenance: {
        entryMethod: 'ocr',
        extractionConfidence: 'media',
        reviewStatus: 'requiere_revision',
        conflict: false,
      },
    });
  });

  it('no envía ni persiste los receptores de progesterona rechazado y reemplazado cuando el contexto viene de FX-T1a-a [US-065 AC-3]', async () => {
    const { contexto, textoEnviado, registro } = await analizarPacienteA(
      mundo,
      cookie,
      'req_Procedencia03',
    );

    const descartados = [filas.progesteronaRechazadaId, filas.progesteronaReemplazadaId];
    for (const id of descartados) {
      expect(dataRefDe(registro, id), id).toBeUndefined();
      expect(textoEnviado, id).not.toContain(id);
      expect(JSON.stringify(registro.clinical_context_snapshot), id).not.toContain(id);
    }
    const estadosEnviados = [contexto.diagnosis, ...contexto.biomarkers].map(
      ({ provenance }) => provenance.reviewStatus,
    );
    expect(estadosEnviados).not.toContain('rechazado');
    expect(estadosEnviados).not.toContain('reemplazado');
    expect(JSON.stringify(registro.clinical_context_snapshot)).not.toMatch(
      /"reviewStatus":"(rechazado|reemplazado)"/,
    );
  });

  it('lleva provenance.conflict true en el receptor de estrógeno 90 % sembrado en conflicto cuando el contexto viene de FX-T1a-a [US-065 AC-4]', async () => {
    const { contexto, registro } = await analizarPacienteA(mundo, cookie, 'req_Procedencia04');

    const dataRef = dataRefDe(registro, filas.receptorEstrogenoEnConflictoId);
    const enConflicto = contexto.biomarkers.find((biomarcador) => biomarcador.dataRef === dataRef);
    expect(dataRef).toBeDefined();
    expect(enConflicto).toMatchObject({
      value: '90 %',
      provenance: { reviewStatus: 'requiere_revision', conflict: true },
    });
    const snapshot = registro.clinical_context_snapshot as unknown as ContextoEnviado;
    expect(snapshot.biomarkers.find((b) => b.dataRef === dataRef)?.provenance.conflict).toBe(true);
  });
});
