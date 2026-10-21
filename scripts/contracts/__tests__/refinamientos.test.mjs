import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import * as zodClinical from '../../../packages/api-contracts/src/zod/clinical-api/zod.gen.ts';
import * as refinadoClinical from '../../../packages/api-contracts/src/zod/clinical-api/refinamientos.gen.ts';
import * as zodRag from '../../../packages/api-contracts/src/zod/rag-orchestrator/zod.gen.ts';
import * as refinadoRag from '../../../packages/api-contracts/src/zod/rag-orchestrator/refinamientos.gen.ts';
import { generarRefinamientos } from '../lib/refinamientos.mjs';
import { ROOT, patchedContracts, realContracts } from './helpers/parches.mjs';

const base = await realContracts();
const MODULOS = { 'clinical-api': { base: zodClinical, refinado: refinadoClinical }, 'rag-orchestrator': { base: zodRag, refinado: refinadoRag } };
const leer = (archivo) => JSON.parse(readFileSync(path.join(ROOT, 'contracts/examples', archivo), 'utf8'));
const indice = leer('index.json').examples;
const campos = (resultado) => resultado.error.issues.map((incidencia) => incidencia.path.join('.'));

describe('Zod refinado generado (US-214 AC-6)', () => {
  it('acepta todos los ejemplos del contrato cuyo schema tiene versión refinada [US-214 AC-6]', () => {
    const conRefinado = indice.flatMap((entrada) => {
      const nombre = /^#\/components\/schemas\/([A-Za-z0-9]+)$/.exec(entrada.target)?.[1];
      const modulos = MODULOS[entrada.spec];
      return nombre && modulos?.refinado[`z${nombre}Refinado`] ? [{ entrada, schema: modulos.refinado[`z${nombre}Refinado`] }] : [];
    });

    expect(conRefinado.length).toBeGreaterThanOrEqual(10);
    for (const { entrada, schema } of conRefinado) {
      const resultado = schema.safeParse(leer(entrada.file));
      expect(resultado.success, `${entrada.file}: ${resultado.success ? '' : campos(resultado)}`).toBe(true);
    }
  });

  it.each([
    ['clinical-api', 'EvidenceAnalysis', 'sin-evidencia.json'],
    ['clinical-api', 'EvidenceAnalysis', 'tipo-no-habilitado.json'],
    ['rag-orchestrator', 'RagQueryInternalResponse', 'rag-query-sin-evidencia.json'],
  ])('rechaza %s %s con topRelevanceScore 0.0 que el Zod estricto aceptaba [US-214 AC-6] [RN-02]', (proveedor, nombre, ejemplo) => {
    const { base, refinado } = MODULOS[proveedor];
    const respuesta = { ...leer(ejemplo), topRelevanceScore: 0.0 };

    expect(base[`z${nombre}`].safeParse(respuesta).success).toBe(true);
    const resultado = refinado[`z${nombre}Refinado`].safeParse(respuesta);
    expect(resultado.success).toBe(false);
    expect(campos(resultado)).toContain('topRelevanceScore');
  });

  it('rechaza un análisis con evidencia cuyo topRelevanceScore es null [US-214 AC-6] [RN-02]', () => {
    const respuesta = { ...leer('con-evidencia-s1.json'), topRelevanceScore: null };

    expect(zodClinical.zEvidenceAnalysis.safeParse(respuesta).success).toBe(true);
    expect(campos(refinadoClinical.zEvidenceAnalysisRefinado.safeParse(respuesta))).toContain('topRelevanceScore');
  });

  it('rechaza sin_evidencia con evidenceOptions no vacío [US-214 AC-6]', () => {
    const respuesta = { ...leer('sin-evidencia.json'), evidenceOptions: leer('con-evidencia-s1.json').evidenceOptions };

    expect(campos(refinadoClinical.zEvidenceAnalysisRefinado.safeParse(respuesta))).toContain('evidenceOptions');
  });

  it('rechaza una propiedad no evaluada en una cita anidada de EvidenceAnalysis con su ruta [US-214 AC-6]', () => {
    const analisis = leer('con-evidencia-s1.json');
    analisis.evidenceOptions[0].citedSources[0].campoNoEvaluado = 'x';

    const resultado = refinadoClinical.zEvidenceAnalysisRefinado.safeParse(analisis);

    expect(resultado.success).toBe(false);
    expect(campos(resultado)).toContain('evidenceOptions.0.citedSources.0.campoNoEvaluado');
  });

  it('rechaza una propiedad no evaluada en un FollowUpCitedSource y acepta isNewSource [US-214 AC-6]', () => {
    const turno = leer('follow-up-turn.json');
    expect(refinadoClinical.zFollowUpTurnRefinado.safeParse(turno).success).toBe(true);
    turno.citedSources[0].campoNoEvaluado = 'x';

    expect(campos(refinadoClinical.zFollowUpTurnRefinado.safeParse(turno))).toContain('citedSources.0.campoNoEvaluado');
  });

  it('rechaza un turno sin_evidencia con respuesta no vacía [US-214 AC-6]', () => {
    const turno = { ...leer('follow-up-fuera-de-contexto.json'), answer: leer('follow-up-turn.json').answer };

    expect(campos(refinadoClinical.zFollowUpTurnRefinado.safeParse(turno))).toContain('answer');
  });

  it('rechaza una búsqueda de pacientes que no cumple ninguna rama del anyOf [US-214 AC-6]', () => {
    expect(zodClinical.zPatientSearchRequest.safeParse({ page: 1 }).success).toBe(true);
    expect(refinadoClinical.zPatientSearchRequestRefinado.safeParse({ page: 1 }).success).toBe(false);
    expect(refinadoClinical.zPatientSearchRequestRefinado.safeParse({ idType: 'sintetico', nationalId: 'SINT-0000001' }).success).toBe(true);
    expect(refinadoClinical.zPatientSearchRequestRefinado.safeParse({ name: 'Paciente Sintético' }).success).toBe(true);
  });

  it('rechaza una petición de análisis sin ninguna fuente en true [US-214 AC-6]', () => {
    const peticion = { ...leer('evidence-analysis-request.json'), sourcesSelected: { guias: false, ensayos: false, publicaciones: false } };

    expect(campos(refinadoClinical.zEvidenceAnalysisRequestRefinado.safeParse(peticion))).toContain('sourcesSelected');
  });

  it('rechaza una afirmación sin citas ni datos del paciente [US-214 AC-6]', () => {
    const afirmacion = { text: 'afirmación sintética', citedSources: [], patientDataRefs: [] };

    expect(refinadoClinical.zSupportedClaimRefinado.safeParse(afirmacion).success).toBe(false);
  });
});

describe('generarRefinamientos falla cerrado (US-214 AC-6)', () => {
  const generar = async (proveedor, parches) => {
    const contexto = await patchedContracts(base, [{ destino: proveedor, operaciones: parches }]);
    return generarRefinamientos(contexto.specs[proveedor].bundled, '// cabecera');
  };

  it('genera el mismo texto dos veces para el mismo spec', async () => {
    expect(await generar('clinical-api', [])).toBe(await generar('clinical-api', []));
  });

  it('nombra el schema y la palabra clave cuando la condición de un if usa una restricción desconocida [US-214 AC-6]', async () => {
    const parche = [{ op: 'add', path: '/components/schemas/EvidenceAnalysis/if/properties/status/pattern', value: '^sin' }];

    await expect(generar('clinical-api', parche)).rejects.toThrow(/EvidenceAnalysis \(if\).*«pattern».*«status»/);
  });

  it('nombra el schema cuando una rama then usa una palabra clave desconocida [US-214 AC-6]', async () => {
    const parche = [{ op: 'add', path: '/components/schemas/EvidenceAnalysis/then/minProperties', value: 1 }];

    await expect(generar('clinical-api', parche)).rejects.toThrow(/EvidenceAnalysis \(then\).*«minProperties»/);
  });

  it('falla ante una palabra clave que ningún traductor cubre, como not [US-214 AC-6]', async () => {
    const parche = [{ op: 'add', path: '/components/schemas/HealthStatus/not', value: { type: 'null' } }];

    await expect(generar('clinical-api', parche)).rejects.toThrow(/HealthStatus.*«not»/);
  });

  it('falla cuando una alternativa de un oneOf lleva refinamientos [US-214 AC-6]', async () => {
    const parche = [{ op: 'add', path: '/components/schemas/Envoltorio', value: { oneOf: [{ $ref: '#/components/schemas/EvidenceOption' }, { type: 'null' }] } }];

    await expect(generar('clinical-api', parche)).rejects.toThrow(/Envoltorio.*oneOf cuyas alternativas llevan refinamientos/);
  });

  it('falla cuando additionalProperties apunta a un schema con refinamientos [US-214 AC-6]', async () => {
    const parche = [{ op: 'add', path: '/components/schemas/Diccionario', value: { type: 'object', additionalProperties: { $ref: '#/components/schemas/EvidenceOption' } } }];

    await expect(generar('clinical-api', parche)).rejects.toThrow(/Diccionario.*additionalProperties cuyo schema lleva refinamientos/);
  });

  it('falla cuando un if aparece en un schema en línea de una operación [US-214 AC-6]', async () => {
    const parche = [{ op: 'add', path: '/paths/~1health/get/responses/200/content/application~1json/schema', value: { type: 'object', if: { required: ['status'] }, then: { required: ['status'] } } }];

    await expect(generar('clinical-api', parche)).rejects.toThrow(/schema en línea de una operación/);
  });

  it('falla cuando un anyOf mezcla restricciones sueltas y schemas completos [US-214 AC-6]', async () => {
    const parche = [{ op: 'add', path: '/components/schemas/Mezcla', value: { type: 'object', anyOf: [{ required: ['a'] }, { type: 'object' }] } }, { op: 'add', path: '/components/schemas/Mezcla/properties', value: { a: { type: 'string' } } }];

    await expect(generar('clinical-api', parche)).rejects.toThrow(/Mezcla.*anyOf que mezcla/);
  });

  it('falla cuando un allOf con unevaluatedProperties compone un miembro con oneOf [US-214 AC-6]', async () => {
    const parche = [{ op: 'add', path: '/components/schemas/Compuesto', value: { type: 'object', allOf: [{ oneOf: [{ type: 'object' }] }], unevaluatedProperties: false } }];

    await expect(generar('clinical-api', parche)).rejects.toThrow(/Compuesto.*«oneOf»/);
  });
});
