import { execFile } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { assertMatchesSpec, matchesSpec } from '../lib/responseValidator.mjs';
import { ROOT } from './helpers/parches.mjs';

const run = promisify(execFile);
const example = (name) => JSON.parse(readFileSync(path.join(ROOT, 'contracts/examples', name), 'utf8'));

describe('assertMatchesSpec', () => {
  it('no lanza cuando el ejemplo cumple el schema del proveedor', () => {
    expect(() => assertMatchesSpec('clinical-api', '#/components/schemas/HealthStatus', example('health-ok.json'))).not.toThrow();
    expect(() => assertMatchesSpec('rag-orchestrator', '#/components/schemas/RagQueryInternalResponse', example('rag-query-con-evidencia.json'))).not.toThrow();
  });

  it('valida una respuesta de error por el puntero de la respuesta del path', () => {
    expect(matchesSpec('rag-orchestrator', '#/paths/~1health/get/responses/503', example('rag-health-llm-no-disponible.json'))).toEqual([]);
  });

  it('lanza nombrando el campo cuando falta uno requerido', () => {
    const { error, ...incompleto } = example('rag-health-llm-no-disponible.json');
    expect(error).toBe('LOCAL_LLM_UNAVAILABLE');
    expect(() => assertMatchesSpec('rag-orchestrator', '#/paths/~1health/get/responses/503', incompleto)).toThrow(/error/);
  });

  it('lanza cuando el cuerpo trae una propiedad que el schema cerrado no declara', () => {
    expect(() => assertMatchesSpec('clinical-api', '#/components/schemas/HealthStatus', { status: 'ok', extra: 1 })).toThrow(/extra|additional/i);
  });

  it('lanza cuando el destino no existe en el spec', () => {
    expect(() => matchesSpec('clinical-api', '#/components/schemas/NoExiste', {})).toThrow(/NoExiste/);
  });
});

describe('bundle-json', () => {
  it('imprime a stdout el spec empaquetado de rag-orchestrator con /health y los schemas compartidos', async () => {
    const { stdout } = await run('node', [path.join(ROOT, 'scripts/contracts/bundle-json.mjs'), 'rag-orchestrator'], { maxBuffer: 32 * 1024 * 1024 });
    const spec = JSON.parse(stdout);
    expect(spec.paths['/health'].get.operationId).toBe('getHealth');
    expect(spec.components.schemas.EvidenceOption).toBeDefined();
  });
});
