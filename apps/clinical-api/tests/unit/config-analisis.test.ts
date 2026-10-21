import { describe, expect, it } from 'vitest';
import { ConfiguracionInvalidaError, readEvidenceAnalysisConfig } from '../../src/config/index.js';

const ENV_VALIDO = {
  RAG_ORCHESTRATOR_URL: 'http://rag-orchestrator:8000',
  CLINICAL_CATALOG_PATH: '/catalogs',
  AI_DISCLAIMER_TEXT: 'Texto de aviso sintético de test.',
  ANALYSIS_BASIS_S1_ASSUMPTION_TEXT: 'Supuesto fijo sintético de test.',
};

function variableInvalida(env: NodeJS.ProcessEnv): string {
  try {
    readEvidenceAnalysisConfig(env);
  } catch (error) {
    if (error instanceof ConfiguracionInvalidaError) return error.variable;
    throw error;
  }
  throw new Error('la configuración debía ser inválida');
}

describe('readEvidenceAnalysisConfig', () => {
  it('aplica los valores por defecto del S1: maxOptions 1, 10 años de antigüedad y 30 s de plazo hacia rag-orchestrator', () => {
    expect(readEvidenceAnalysisConfig(ENV_VALIDO)).toEqual({
      ragOrchestratorUrl: 'http://rag-orchestrator:8000',
      catalogPath: '/catalogs',
      analysisMaxOptions: 1,
      evidenceDefaultYears: 10,
      ragTimeoutMs: 30_000,
      aiDisclaimerText: 'Texto de aviso sintético de test.',
      analysisBasisAssumptionText: 'Supuesto fijo sintético de test.',
    });
  });

  it('lee RAG_TIMEOUT_MS del entorno', () => {
    const config = readEvidenceAnalysisConfig({ ...ENV_VALIDO, RAG_TIMEOUT_MS: '45000' });

    expect(config.ragTimeoutMs).toBe(45_000);
  });

  it('lee ANALYSIS_MAX_OPTIONS y EVIDENCE_DEFAULT_YEARS del entorno', () => {
    const config = readEvidenceAnalysisConfig({
      ...ENV_VALIDO,
      ANALYSIS_MAX_OPTIONS: '3',
      EVIDENCE_DEFAULT_YEARS: '5',
    });

    expect(config).toMatchObject({ analysisMaxOptions: 3, evidenceDefaultYears: 5 });
  });

  it('trata las variables vacías como ausentes (Compose las pasa vacías para usar el valor por defecto)', () => {
    const config = readEvidenceAnalysisConfig({
      ...ENV_VALIDO,
      ANALYSIS_MAX_OPTIONS: '',
      EVIDENCE_DEFAULT_YEARS: '',
    });

    expect(config).toMatchObject({ analysisMaxOptions: 1, evidenceDefaultYears: 10 });
  });

  it.each([
    ['RAG_ORCHESTRATOR_URL', { CLINICAL_CATALOG_PATH: '/catalogs' }],
    ['RAG_ORCHESTRATOR_URL', { ...ENV_VALIDO, RAG_ORCHESTRATOR_URL: 'no-es-una-url' }],
    ['RAG_ORCHESTRATOR_URL', { ...ENV_VALIDO, RAG_ORCHESTRATOR_URL: 'ftp://rag-orchestrator' }],
    ['CLINICAL_CATALOG_PATH', { RAG_ORCHESTRATOR_URL: ENV_VALIDO.RAG_ORCHESTRATOR_URL }],
    ['ANALYSIS_MAX_OPTIONS', { ...ENV_VALIDO, ANALYSIS_MAX_OPTIONS: '0' }],
    ['ANALYSIS_MAX_OPTIONS', { ...ENV_VALIDO, ANALYSIS_MAX_OPTIONS: '4' }],
    ['ANALYSIS_MAX_OPTIONS', { ...ENV_VALIDO, ANALYSIS_MAX_OPTIONS: 'abc' }],
    ['EVIDENCE_DEFAULT_YEARS', { ...ENV_VALIDO, EVIDENCE_DEFAULT_YEARS: '0' }],
    ['RAG_TIMEOUT_MS', { ...ENV_VALIDO, RAG_TIMEOUT_MS: '0' }],
    ['RAG_TIMEOUT_MS', { ...ENV_VALIDO, RAG_TIMEOUT_MS: '-5' }],
    ['RAG_TIMEOUT_MS', { ...ENV_VALIDO, RAG_TIMEOUT_MS: 'abc' }],
    ['AI_DISCLAIMER_TEXT', { ...ENV_VALIDO, AI_DISCLAIMER_TEXT: undefined }],
    ['AI_DISCLAIMER_TEXT', { ...ENV_VALIDO, AI_DISCLAIMER_TEXT: '' }],
    ['AI_DISCLAIMER_TEXT', { ...ENV_VALIDO, AI_DISCLAIMER_TEXT: '   ' }],
    [
      'ANALYSIS_BASIS_S1_ASSUMPTION_TEXT',
      { ...ENV_VALIDO, ANALYSIS_BASIS_S1_ASSUMPTION_TEXT: undefined },
    ],
  ])('rechaza nombrando %s cuando el entorno es inválido', (variable, env) => {
    expect(variableInvalida(env)).toBe(variable);
  });

  it('no cita el valor inválido en el mensaje del error', () => {
    expect(() =>
      readEvidenceAnalysisConfig({ ...ENV_VALIDO, RAG_ORCHESTRATOR_URL: 'usuario:secreto@host' }),
    ).toThrow(/RAG_ORCHESTRATOR_URL/);
    try {
      readEvidenceAnalysisConfig({ ...ENV_VALIDO, RAG_ORCHESTRATOR_URL: 'usuario:secreto@host' });
    } catch (error) {
      expect((error as Error).message).not.toContain('secreto');
    }
  });
});
