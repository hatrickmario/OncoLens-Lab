import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
  idDePaciente,
  prepararMundoConSeed,
  type MundoDeGateway,
} from '../../support/gateway.js';

const ESPACIO_DE_IDS = 663;

let mundo: MundoDeGateway;

beforeAll(async () => {
  mundo = await prepararMundoConSeed('base_datos_por_revisar', ESPACIO_DE_IDS);
  await insertarFxT1aA(mundo.cliente, mundo.ids, idDePaciente('a'));
});
afterAll(async () => {
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
      label: 'Receptor de estrógeno 90 %',
      reviewStatus: 'requiere_revision',
      conflict: true,
    });
    expect(base.patientDataUsed.map(({ label }) => label).join('|')).not.toMatch(/progesterona/i);
  });
});
