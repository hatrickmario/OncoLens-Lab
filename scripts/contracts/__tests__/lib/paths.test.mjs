import { describe, expect, it } from 'vitest';
import { PATHS, generatedHeader } from '../../lib/paths.mjs';

describe('paths', () => {
  it.each(['clinical-api', 'rag-orchestrator'])('la cabecera de lo generado nombra el spec de %s cuando se arma desde PATHS [US-033 AC-16]', (provider) => {
    expect(generatedHeader(provider)).toContain(PATHS.specs[provider]);
  });
});
