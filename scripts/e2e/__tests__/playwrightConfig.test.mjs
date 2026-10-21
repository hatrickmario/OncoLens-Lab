import { afterEach, describe, expect, it, vi } from 'vitest';

// L1D-278 (test después, ARR-02 AC-1): reintentos y traza solo en la CI. La config se carga con `CI` fijada y sin ella.
async function cargarConfig(ci) {
  vi.resetModules();
  vi.stubEnv('CI', ci);
  return (await import('../../../apps/web/playwright.config.ts')).default;
}
const nombresDeReporters = (config) => config.reporter.map(([nombre]) => nombre);

afterEach(() => vi.unstubAllEnvs());

describe('playwright.config.ts', () => {
  it('usa retries 1 y trace on-first-retry cuando CI=true [ARR-02 AC-1]', async () => {
    const config = await cargarConfig('true');

    expect(config.retries).toBe(1);
    expect(config.use.trace).toBe('on-first-retry');
  });

  it('usa retries 0 y sin traza cuando no hay CI [ARR-02 AC-1]', async () => {
    const config = await cargarConfig('');

    expect(config.retries).toBe(0);
    expect(config.use.trace).toBe('off');
  });

  it('emite los reporters github y html cuando CI=true', async () => {
    expect(nombresDeReporters(await cargarConfig('true'))).toEqual(expect.arrayContaining(['github', 'html']));
  });

  it('no emite el reporter html cuando no hay CI', async () => {
    expect(nombresDeReporters(await cargarConfig(''))).not.toEqual(expect.arrayContaining(['html']));
  });

  it('pone el reporter de depuración de trazas antes que el html para que el informe copie la traza ya depurada', async () => {
    for (const ci of ['true', '']) {
      const nombres = nombresDeReporters(await cargarConfig(ci));

      expect(nombres[0]).toMatch(/reporte-sin-secretos/);
    }
  });
});
