import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// Secretos ficticios en un directorio temporal: ningún valor es real (RN-13, RN-14).
const RAIZ_CLINICAL_API = path.resolve(import.meta.dirname, '../../..');
const CONTRASENA_EN_URL = 'contrasena-ficticia-en-la-url';

let directorio: string;
beforeEach(() => {
  directorio = mkdtempSync(path.join(tmpdir(), 'clinical-api-config-'));
});
afterEach(() => rmSync(directorio, { recursive: true, force: true }));

function archivo(nombre: string, contenido: string): string {
  const ruta = path.join(directorio, nombre);
  writeFileSync(ruta, contenido);
  return ruta;
}

/** Arranca el proceso real (`src/server.ts`) con los secretos de identidad presentes y lo que se indique. */
function arrancarProceso(extra: Record<string, string>) {
  return spawnSync(process.execPath, ['--import', 'tsx', 'src/server.ts'], {
    cwd: RAIZ_CLINICAL_API,
    env: {
      PATH: process.env['PATH'] ?? '',
      PORT: '4999',
      IDENTITY_AES_KEY_FILE: archivo('aes', 'aes-ficticia'),
      BLIND_INDEX_HMAC_KEY_FILE: archivo('hmac', 'hmac-ficticia'),
      SERVICE_JWT_PRIVATE_KEY_FILE: archivo('jwt.pem', 'clave-servicio-ficticia'),
      ...extra,
    },
    encoding: 'utf8',
    timeout: 30_000,
  });
}

describe('arranque de clinical-api con el login montado', () => {
  it.each([
    ['APP_ENV', {}],
    ['CLINICAL_DATABASE_URL', { APP_ENV: 'test' }],
    [
      'CLINICAL_DATABASE_URL',
      {
        APP_ENV: 'test',
        CLINICAL_DATABASE_URL: `postgresql://clinical_api:${CONTRASENA_EN_URL}@postgres:5432/oncolens`,
      },
    ],
    [
      'PG_CLINICAL_API_PASSWORD_FILE',
      {
        APP_ENV: 'test',
        CLINICAL_DATABASE_URL: 'postgresql://clinical_api@postgres:5432/oncolens',
      },
    ],
    ['SESSION_TTL_HOURS', { APP_ENV: 'test', SESSION_TTL_HOURS: 'abc' }],
    ['ARGON2_TIME_COST', { APP_ENV: 'test', ARGON2_TIME_COST: '0' }],
    ['PORT', { PORT: 'abc' }],
    [
      'SERVICE_JWT_TTL_SECONDS',
      (crear: (nombre: string, contenido: string) => string) => ({
        APP_ENV: 'test',
        CLINICAL_DATABASE_URL: 'postgresql://clinical_api@postgres:5432/oncolens',
        PG_CLINICAL_API_PASSWORD_FILE: crear('pg_password', 'contrasena-ficticia'),
        CLINICAL_DATABASE_CA_FILE: crear('pg_ca.crt', 'ca-ficticia'),
        SERVICE_JWT_TTL_SECONDS: 'abc',
      }),
    ],
  ])(
    'termina con código 1 sin escuchar y su stderr nombra %s, sin ningún valor, cuando la configuración es inválida',
    (variable, extraOFabrica) => {
      const extra = typeof extraOFabrica === 'function' ? extraOFabrica(archivo) : extraOFabrica;
      const proceso = arrancarProceso(extra);

      expect(proceso.status).toBe(1);
      expect(JSON.parse(proceso.stderr.trim())).toEqual({
        level: 'error',
        event: 'configuracion_invalida',
        variable,
        regla: expect.any(String),
        motivo: expect.stringMatching(/^(valor_invalido|variable_ausente)$/),
      });
      expect(proceso.stderr).not.toContain(CONTRASENA_EN_URL);
      expect(proceso.stdout).not.toContain('escuchando');
    },
  );
});
