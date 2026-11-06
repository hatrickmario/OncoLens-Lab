import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { archivos } from '../support/recorrer-archivos';

const raizWeb = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const gitleaksToml = path.resolve(raizWeb, '../../.gitleaks.toml');

const URL_CENTINELA = 'http://clinical-api-centinela-l1d266.internal:3998';
const CUERPO_PEM = 'MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCcentinelaL1D266sintetico';
const PEM_CENTINELA = `-----BEGIN PRIVATE KEY-----\n${CUERPO_PEM}\n-----END PRIVATE KEY-----`;

/** Regla por defecto `private-key` de gitleaks (el toml la hereda con `useDefault`) más las reglas propias del toml. */
const PEM_CON_FORMA = /-----BEGIN[ A-Z0-9_-]{0,100}PRIVATE KEY(?: BLOCK)?-----/;

/** Patrones `regex = '''…'''` de las reglas propias de `.gitleaks.toml`: una sola fuente con el escáner de la CI. */
function patronesDelToml(): RegExp[] {
  const toml = readFileSync(gitleaksToml, 'utf8');
  const propias = toml.split('[[allowlists]]')[0] ?? '';
  const patrones = [...propias.matchAll(/^regex = '''(.+)'''$/gm)].map((m) => new RegExp(m[1]!));
  return [PEM_CON_FORMA, ...patrones];
}

describe('build de producción de web', () => {
  it('no deja secretos ni valores de servidor en .next/static: el reporte lista solo rutas [US-216 AC-4]', () => {
    execFileSync('npx', ['next', 'build'], {
      cwd: raizWeb,
      env: {
        ...process.env,
        CLINICAL_API_URL: URL_CENTINELA,
        CLINICAL_API_FIRMA_CENTINELA: PEM_CENTINELA,
        WEB_ALLOWED_ORIGIN: 'http://127.0.0.1:3000',
        WEB_UPSTREAM_TIMEOUT_MS: '40000',
        NEXT_TELEMETRY_DISABLED: '1',
      },
      stdio: 'pipe',
    });

    const patrones = patronesDelToml();
    const estaticos = archivos(path.join(raizWeb, '.next', 'static'));
    const conCoincidencia = estaticos
      .filter((ruta) => {
        const contenido = readFileSync(ruta, 'utf8');
        const esCentinela = contenido.includes(URL_CENTINELA) || contenido.includes(CUERPO_PEM);
        return esCentinela || patrones.some((patron) => patron.test(contenido));
      })
      .map((ruta) => path.relative(raizWeb, ruta));

    expect(estaticos.length).toBeGreaterThan(0);
    expect(conCoincidencia).toEqual([]);
  }, 300_000);
});
