import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { rutaDeConversacion } from '../../support/conversacion.js';
import { montarCaso } from '../../support/caso-http.js';
import { montarCompletitud } from '../../support/completitud-http.js';
import {
  documentosDelPaciente,
  fixture,
  iniciarEscenarioDeDocumentos,
  montarDocumentos,
  type EscenarioDeDocumentos,
} from '../../support/documentos.js';
import { idDePaciente, montarGateway, ragSimulado } from '../../support/gateway.js';
import {
  INSTANTE_ANTERIOR,
  INSTANTE_POSTERIOR,
  LECTOR_DE_IDENTIDAD_UNICA,
  MOTIVO_DE_LA_MARCA,
  registrarMarca,
} from '../../support/opt-out.js';
import { montarPacientes } from '../../support/pacientes.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';

const ESPACIO_DE_IDS = 8131;
/** Paciente semilla (d): opt-out de analisis_ia registrado (referencia sembrada `OPTOUT-SEED-D`). */
const P_OPT_IA = idDePaciente('d');
const P_SIN_MARCAS = idDePaciente('a');
const P_OPT_REVOCADO = idDePaciente('b');
const REFERENCIA_SEMBRADA = 'OPTOUT-SEED-D';

const rag = ragSimulado();
let escenario: EscenarioDeDocumentos;

beforeAll(async () => {
  rag.iniciar();
  escenario = await iniciarEscenarioDeDocumentos('opt_out_ficha_lecturas', ESPACIO_DE_IDS);
  await registrarMarca(escenario.mundo, P_OPT_REVOCADO, {
    accion: 'registrado',
    instante: INSTANTE_ANTERIOR,
  });
  await registrarMarca(escenario.mundo, P_OPT_REVOCADO, {
    accion: 'revocado',
    instante: INSTANTE_POSTERIOR,
  });
});
beforeEach(() => escenario.entorno.reiniciar());
afterEach(() => rag.reiniciar());
afterAll(async () => {
  rag.detener();
  await escenario.cerrar();
});

describe('la ficha expone la disponibilidad de la IA sin detalle de la marca (RN-15, RN-10)', () => {
  it('trae aiAnalysisAvailable false sin referencia ni motivo con opt-out y true sin marca vigente [US-148 AC-8]', async () => {
    const { app } = montarPacientes(escenario.mundo);
    const pedir = (patientId: string) =>
      clienteVerificado(app)
        .get(`/platform/patients/${patientId}`)
        .set('Cookie', escenario.cookieDoctor);

    const conOptOut = await pedir(P_OPT_IA);
    const sinMarcas = await pedir(P_SIN_MARCAS);
    const revocado = await pedir(P_OPT_REVOCADO);

    expect(conOptOut.status).toBe(200);
    expect(conOptOut.body.aiAnalysisAvailable).toBe(false);
    expect(sinMarcas.body.aiAnalysisAvailable).toBe(true);
    expect(revocado.body.aiAnalysisAvailable).toBe(true);
    const texto = JSON.stringify(conOptOut.body);
    expect(texto).not.toContain(REFERENCIA_SEMBRADA);
    expect(texto).not.toContain(MOTIVO_DE_LA_MARCA);
    expect(texto).not.toContain('opt_out');
  });
});

describe('lo que no es generación sigue funcionando con opt-out (FR-16, RN-26)', () => {
  it('responde la ficha, el caso, los faltantes, la carga y la conversación con normalidad cuando el paciente tiene opt-out [US-148 AC-7]', async () => {
    const cookie = escenario.cookieDoctor;
    const { app: gateway } = await montarGateway(escenario.mundo, {
      identidades: LECTOR_DE_IDENTIDAD_UNICA,
    });
    // La conversación se abre sobre el paciente con opt-out: abrirla y leerla no genera con IA.
    const ficha = await clienteVerificado(montarPacientes(escenario.mundo).app)
      .get(`/platform/patients/${P_OPT_IA}`)
      .set('Cookie', cookie);
    const caso = await clienteVerificado(montarCaso(escenario.mundo).app)
      .get(`/platform/patients/${P_OPT_IA}/case`)
      .set('Cookie', cookie);
    const faltantes = await clienteVerificado(montarCompletitud(escenario.mundo).app)
      .get(`/platform/patients/${P_OPT_IA}/completeness`)
      .set('Cookie', cookie);
    const carga = await clienteVerificado(montarDocumentos(escenario.mundo).app)
      .post(`/platform/patients/${P_OPT_IA}/documents`)
      .set('Cookie', cookie)
      .field('documentType', 'examen')
      .attach('file', fixture('mama-examen.pdf'), 'mama-examen.pdf');
    const apertura = await clienteVerificado(gateway)
      .post(`/platform/patients/${P_OPT_IA}/conversations`)
      .set('Cookie', cookie);
    const lectura = await clienteVerificado(gateway)
      .get(rutaDeConversacion(apertura.body.conversationId))
      .set('Cookie', cookie);

    expect([
      ficha.status,
      caso.status,
      faltantes.status,
      carga.status,
      apertura.status,
      lectura.status,
    ]).toEqual([200, 200, 200, 202, 201, 200]);
    const cola = await documentosDelPaciente(escenario.mundo, P_OPT_IA);
    expect(cola.map((fila) => fila.ocr_status)).toEqual(['pendiente']);
    expect(rag.chat.llamadas() + rag.llamadas() + rag.seguimiento.llamadas()).toBe(0);
  });
});
