/**
 * D5-53: las banderas REAL_*_ENABLED se leen de la configuración EFECTIVA de Compose, no de un fixture.
 * Sin esta prueba, `clinical-api` podía no declararlas y todo G-Demo real salía «activas» (siempre «no superado»).
 * Requiere `docker compose` (la CI lo trae). Solo se fijan las dos variables obligatorias de la interpolación; ninguna es secreta.
 */
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { extraerBanderas } from '../g-demo/banderas.mjs';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const entorno = (extra = {}) => ({
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  APP_ENV: 'desarrollo',
  MODEL_HOST_DIR: '/tmp/modelos-prueba',
  ...extra,
});
const configEfectiva = (extra) =>
  JSON.parse(
    execFileSync(
      'docker',
      ['compose', '-f', path.join(raiz, 'infra/docker/docker-compose.yml'), '--profile', 'seed', 'config', '--format', 'json'],
      { env: entorno(extra), encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    ),
  );

describe('banderas de datos reales sobre el docker-compose.yml real', () => {
  it('declara las dos banderas en clinical-api y clinical-seed, apagadas por defecto [US-142 AC-3] [D5-53]', () => {
    const { services } = configEfectiva();
    for (const servicio of ['clinical-api', 'clinical-seed']) {
      expect(services[servicio].environment.REAL_ANONYMIZED_ENABLED).toBe('false');
      expect(services[servicio].environment.REAL_IDENTIFIED_ENABLED).toBe('false');
    }
    expect(extraerBanderas({ services })).toEqual({
      REAL_ANONYMIZED_ENABLED: false,
      REAL_IDENTIFIED_ENABLED: false,
    });
  }, 60_000);

  it('reporta activa una bandera que el operador enciende [US-142 AC-3] [RN-13]', () => {
    const banderas = extraerBanderas(configEfectiva({ REAL_ANONYMIZED_ENABLED: 'true' }));
    expect(banderas).toEqual({ REAL_ANONYMIZED_ENABLED: true, REAL_IDENTIFIED_ENABLED: false });
  }, 60_000);
});
