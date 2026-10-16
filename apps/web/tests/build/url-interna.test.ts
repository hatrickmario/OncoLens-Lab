import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const raizWeb = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CENTINELA = 'http://clinical-api-centinela-l1d139.internal:3999';
const HOST_CENTINELA = 'clinical-api-centinela-l1d139';

function archivos(directorio: string): string[] {
  return readdirSync(directorio).flatMap((nombre) => {
    const ruta = path.join(directorio, nombre);
    return statSync(ruta).isDirectory() ? archivos(ruta) : [ruta];
  });
}

describe('build de producción de web', () => {
  it('no incluye el valor de CLINICAL_API_URL en .next/static [US-060 AC-5]', () => {
    execFileSync('npx', ['next', 'build'], {
      cwd: raizWeb,
      env: {
        ...process.env,
        CLINICAL_API_URL: CENTINELA,
        WEB_ALLOWED_ORIGIN: 'http://127.0.0.1:3000',
        WEB_UPSTREAM_TIMEOUT_MS: '40000',
        NEXT_TELEMETRY_DISABLED: '1',
      },
      stdio: 'pipe',
    });

    const estaticos = archivos(path.join(raizWeb, '.next', 'static'));
    const conCentinela = estaticos.filter((ruta) => {
      const contenido = readFileSync(ruta, 'utf8');
      return contenido.includes(CENTINELA) || contenido.includes(HOST_CENTINELA);
    });

    expect(estaticos.length).toBeGreaterThan(0);
    expect(conCentinela).toEqual([]);
  }, 300_000);
});
