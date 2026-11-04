import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import peticionFxT3a from '../../../../../contracts/examples/rag-query-request-fx-t3-a.json' with { type: 'json' };
import ragFxT3a from '../../../../../contracts/examples/rag-query-fx-t3-a.json' with { type: 'json' };
import type { EvidenceAnalysis } from '../../../../../packages/api-contracts/src/client/clinical-api/index.js';
import {
  TODAS_LAS_FUENTES,
  abrirSesion,
  idDePaciente,
  leerRegistroPorTrace,
  montarGateway,
  prepararMundoConSeed,
  ragSimulado,
  versionDelCatalogo,
  type MundoDeGateway,
} from '../../support/gateway.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';

const ESPACIO_DE_IDS = 9710;
const TOKEN_DE_SESION = 'SINT-cookie-sesion-avisos-no-bloquean-0001';

/** FX-T3-a es el paciente semilla (f): la misma fila que recorre el E2E. */
const PACIENTE_FX_T3_A = idDePaciente('f');
const CLAVE_DEL_FALTANTE = 'estado_menopausico';

const AVISOS_FUERA_DE_WARNINGS = ['datos_faltantes', 'datos_sin_verificar', 'datos_en_conflicto'];

/** Los meses relativos dependen del reloj del seed y el seudónimo es por consulta: lo demás debe coincidir con el ejemplo. */
const CAMPOS_RELATIVOS = new Set(['monthsAgo', 'monthsSinceDiagnosis', 'pseudoPatientId']);
function sinCamposRelativos(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(sinCamposRelativos);
  if (valor === null || typeof valor !== 'object') return valor;
  return Object.fromEntries(
    Object.entries(valor)
      .filter(([clave]) => !CAMPOS_RELATIVOS.has(clave))
      .map(([clave, hijo]) => [clave, sinCamposRelativos(hijo)]),
  );
}

const rag = ragSimulado();
let mundo: MundoDeGateway;
let cookie: string;

beforeAll(async () => {
  rag.iniciar();
  mundo = await prepararMundoConSeed('gw_avisos_no_bloquean', ESPACIO_DE_IDS);
  cookie = await abrirSesion(mundo, 'doc1@test.local', TOKEN_DE_SESION);
});
afterEach(() => rag.reiniciar());
afterAll(async () => {
  rag.detener();
  await mundo.cerrar();
});

/** `rag-orchestrator` devuelve en `meta.catalogVersion` la versión del request (si difiere responde 409). */
const respuestaDeFxT3a = {
  tipo: 'json' as const,
  status: 200,
  cuerpo: { ...ragFxT3a, meta: { ...ragFxT3a.meta, catalogVersion: versionDelCatalogo() } },
};

describe('POST /platform/evidence-analyses · FX-T3-a acumula todos los avisos clínicos (RN-26)', () => {
  it('responde 200 con poblacion_no_comparable en warnings y declara faltantes y sin verificar en la Base del análisis sin emitirlos en warnings cuando FX-T3-a pide el análisis con continueWithWarning [US-071 AC-1]', async () => {
    rag.responder(respuestaDeFxT3a);
    const { app } = await montarGateway(mundo, {
      traceIds: { traceId: () => 'req_AvisosNoBloq01' },
    });

    const respuesta = await clienteVerificado(app)
      .post('/platform/evidence-analyses')
      .set('Cookie', cookie)
      .send({
        patientId: PACIENTE_FX_T3_A,
        query: peticionFxT3a.query,
        sourcesSelected: TODAS_LAS_FUENTES,
        continueWithWarning: true,
      });

    expect(respuesta.status).toBe(200);
    // El ejemplo que sirve el modo fingido es lo que el gateway le envía a rag-orchestrator para este paciente (US-213).
    expect(sinCamposRelativos(rag.capturadas[0]?.cuerpo['clinicalContext'])).toEqual(
      sinCamposRelativos(peticionFxT3a.clinicalContext),
    );
    const analisis = respuesta.body as EvidenceAnalysis;
    expect(analisis.evidenceOptions).toHaveLength(1);
    const [opcion] = analisis.evidenceOptions;
    expect(opcion).toMatchObject({
      populationNotComparable: true,
      warnings: ['poblacion_no_comparable'],
    });
    for (const aviso of AVISOS_FUERA_DE_WARNINGS) expect(opcion?.warnings).not.toContain(aviso);
    const base = analisis.analysisBasis;
    expect(base.missingCriticalData).toContain(CLAVE_DEL_FALTANTE);
    expect(base.continuedWithWarning).toBe(true);
    const ki67 = base.patientDataUsed.find((dato) => dato.label.startsWith('Ki-67'));
    expect(ki67).toMatchObject({ reviewStatus: 'requiere_revision' });
    const registro = await leerRegistroPorTrace(mundo.cliente, 'req_AvisosNoBloq01');
    expect(registro).toMatchObject({
      missing_critical_data: base.missingCriticalData,
      continued_with_warning: true,
    });
  });
});
