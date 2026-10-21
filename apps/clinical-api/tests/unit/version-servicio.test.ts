import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import YAML from 'yaml';
import { versionDelServicio } from '../../src/infrastructure/version-servicio.js';

const RUTA_DEL_SPEC = new URL('../../openapi.yaml', import.meta.url);

describe('versionDelServicio', () => {
  it('devuelve el info.version del openapi.yaml del servicio cuando se lee con el lector real [US-037 AC-6]', () => {
    const esperada = (
      YAML.parse(readFileSync(RUTA_DEL_SPEC, 'utf8')) as { info: { version: string } }
    ).info.version;

    expect(versionDelServicio()).toBe(esperada);
    expect(versionDelServicio()).not.toBe('0.0.0');
  });

  it('devuelve la versión del texto que entrega el lector inyectado, sin tocar el sistema de archivos', () => {
    const texto = 'openapi: 3.1.0\ninfo:\n  title: X\n  version: 7.8.9\npaths: {}\n';

    expect(versionDelServicio(() => texto)).toBe('7.8.9');
  });

  it('devuelve desconocida cuando el spec no se puede leer', () => {
    expect(
      versionDelServicio(() => {
        throw new Error('sin archivo');
      }),
    ).toBe('desconocida');
  });
});
