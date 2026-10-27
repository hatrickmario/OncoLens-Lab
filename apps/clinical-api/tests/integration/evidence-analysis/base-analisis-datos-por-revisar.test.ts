import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import conEvidencia from '../../../../../contracts/examples/rag-query-con-evidencia.json' with { type: 'json' };
import peticion from '../../../../../contracts/examples/rag-query-request.json' with { type: 'json' };
import { crearBaseDelAnalisis } from '../../../src/modules/evidence-analysis/analysis-basis.js';
import { validarRespuestaInterna } from '../../../src/modules/evidence-analysis/analysis-completion.js';
import { construirContextoPermitido } from '../../../src/modules/evidence-analysis/clinical-context.builder.js';
import { createEvidenceAnalysisRepository } from '../../../src/modules/evidence-analysis/evidence-analysis.repository.js';
import type { RagQueryInternalRequest } from '../../../../../packages/api-contracts/src/client/rag-orchestrator/index.js';
import { insertarFxT1aA } from '../../support/filas-sinteticas.js';
import {
  AHORA,
  PREGUNTA_Q_HER2,
  TODAS_LAS_FUENTES,
  abrirSesion,
  idDePaciente,
  montarGateway,
  prepararMundoConSeed,
  ragSimulado,
  type MundoDeGateway,
} from '../../support/gateway.js';
import { clienteVerificado } from '../../support/verificarProveedor.js';

const ESPACIO_DE_IDS = 663;

const rag = ragSimulado();
let mundo: MundoDeGateway;
let cookie: string;

beforeAll(async () => {
  rag.iniciar();
  mundo = await prepararMundoConSeed('base_datos_por_revisar', ESPACIO_DE_IDS);
  await insertarFxT1aA(mundo.cliente, mundo.ids, idDePaciente('a'));
  cookie = await abrirSesion(mundo, 'doc1@test.local', 'SINT-cookie-sesion-base-revisar-0001');
});
afterEach(() => rag.reiniciar());
afterAll(async () => {
  rag.detener();
  await mundo.cerrar();
});

describe('Base del análisis con FX-T1a-a', () => {
  it('lista el Ki-67 por revisar y el receptor de estrógeno en conflicto y omite los rechazados cuando el contexto viene de FX-T1a-a [US-066 AC-6]', async () => {
    const caso = await createEvidenceAnalysisRepository(mundo.cliente).leerCaso(idDePaciente('a'));
    const { contexto } = construirContextoPermitido(caso!, new Date(AHORA));
    const solicitud: RagQueryInternalRequest = {
      ...(peticion as RagQueryInternalRequest),
      clinicalContext: { pseudoPatientId: 'psd_TestPseudonimo0001', ...contexto },
    };

    const base = crearBaseDelAnalisis().construir(
      solicitud,
      validarRespuestaInterna(conEvidencia),
      false,
    );

    expect(base.patientDataUsed).toContainEqual({
      label: 'Ki-67 20 %',
      reviewStatus: 'requiere_revision',
      conflict: false,
    });
    expect(base.patientDataUsed).toContainEqual({
      label: 'RE 90 %',
      reviewStatus: 'requiere_revision',
      conflict: true,
    });
    expect(base.patientDataUsed.map(({ label }) => label).join('|')).not.toMatch(/progesterona/i);
  });
  it('lista el diagnóstico primero y el atributo al final, en el orden de asignación de los dataRef, cuando el contexto viene de construirContextoPermitido() [US-066 AC-1]', async () => {
    const caso = await createEvidenceAnalysisRepository(mundo.cliente).leerCaso(idDePaciente('a'));
    const { contexto } = construirContextoPermitido(caso!, new Date(AHORA));
    const solicitud: RagQueryInternalRequest = {
      ...(peticion as RagQueryInternalRequest),
      clinicalContext: { pseudoPatientId: 'psd_TestPseudonimo0001', ...contexto },
    };

    const base = crearBaseDelAnalisis().construir(
      solicitud,
      validarRespuestaInterna(conEvidencia),
      false,
    );

    const etiquetas = base.patientDataUsed.map(({ label }) => label);
    expect(etiquetas[0]).toBe('mama · TNM_8 IIA');
    expect(etiquetas.at(-1)).toBe('estado_menopausico: posmenopausica');
    expect(etiquetas).toHaveLength(5);
  });

  it('responde con el Ki-67 por revisar y el receptor de estrógeno en conflicto cuando el doctor analiza a FX-T1a-a [US-066 AC-6]', async () => {
    const { app } = await montarGateway(mundo, {
      traceIds: { traceId: () => 'req_BaseRevisar01' },
    });

    const respuesta = await clienteVerificado(app)
      .post('/platform/evidence-analyses')
      .set('Cookie', cookie)
      .send({
        patientId: idDePaciente('a'),
        query: PREGUNTA_Q_HER2,
        sourcesSelected: TODAS_LAS_FUENTES,
      });

    expect(respuesta.status).toBe(200);
    const usados = respuesta.body.analysisBasis.patientDataUsed;
    expect(usados).toContainEqual({
      label: 'Ki-67 20 %',
      reviewStatus: 'requiere_revision',
      conflict: false,
    });
    expect(usados).toContainEqual({
      label: 'RE 90 %',
      reviewStatus: 'requiere_revision',
      conflict: true,
    });
    expect(JSON.stringify(usados)).not.toMatch(/progesterona/i);
  });
});
