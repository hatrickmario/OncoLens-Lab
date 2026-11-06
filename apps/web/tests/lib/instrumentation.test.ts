import { afterEach, describe, expect, it, vi } from 'vitest';
import { register } from '../../instrumentation';

describe('register (arranque de web)', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('lanza nombrando WEB_CSP_MODO cuando es solo_informe en producción [US-216 AC-1]', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('WEB_CSP_MODO', 'solo_informe');

    await expect(register()).rejects.toThrow('WEB_CSP_MODO');
  });
});
