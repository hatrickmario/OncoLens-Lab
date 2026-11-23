import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { entornoDeClaves } from '../../support/identidad.js';
import {
  crearBaseDelSeed,
  entornoDelSeed,
  escribirArchivosDeContrasena,
  seedContraLaBase,
  type ArchivosDeContrasena,
} from '../../support/seed.js';
import type { BaseDeTest } from '../../support/db.js';
import { RAIZ_DEL_REPO } from '../../support/preparacion-chat.js';

/**
 * US-269 (L1D-326), AC-3 y AC-6: el comando REAL `npm run eval:chat-preparar` (proceso, composición de producción, TLS
 * verificado e identidad cifrada real) sobre la BD de test con el seed sintético: escribe una petición por caso y control,
 * sin identidad en la `peticion`, y no deja nada versionable bajo `apps/clinical-api/eval/results/tmp/`.
 */
const ESPACIO_DE_IDS = 9954;
const SALIDA = path.join(RAIZ_DEL_REPO, 'apps/clinical-api/eval/results/tmp');
const SECRETOS =
  process.env['ONCOLENS_SECRETS_DIR'] ?? path.join(RAIZ_DEL_REPO, 'infra/docker/secrets');

let base: BaseDeTest;
let archivos: ArchivosDeContrasena;

beforeAll(async () => {
  base = await crearBaseDelSeed(`chat_preparar_real_${ESPACIO_DE_IDS}`);
  archivos = escribirArchivosDeContrasena();
  await seedContraLaBase(base.url).ejecutar(entornoDelSeed(archivos));
});
afterAll(async () => {
  archivos.limpiar();
  await base.destruir();
});

function correrElComando() {
  const url = new URL(base.url);
  const entorno: Record<string, string> = {
    PATH: process.env['PATH'] ?? '',
    HOME: process.env['HOME'] ?? '',
    APP_ENV: 'test',
    CLINICAL_DATABASE_URL: `postgresql://${url.username}@${url.host}${url.pathname}`,
    PG_CLINICAL_API_PASSWORD_FILE: path.join(SECRETOS, 'pg_test_admin_password'),
    CLINICAL_DATABASE_CA_FILE: path.join(SECRETOS, 'pg_ca.crt'),
    EVAL_CHAT_DB_TLS_SERVERNAME: 'postgres',
    ...(entornoDeClaves(archivos.claves, 1) as Record<string, string>),
  };
  return spawnSync('npm', ['run', '--silent', 'eval:chat-preparar', '-w', 'apps/clinical-api'], {
    cwd: RAIZ_DEL_REPO,
    env: entorno,
    encoding: 'utf8',
    timeout: 120_000,
  });
}

describe('npm run eval:chat-preparar (comando real)', () => {
  it('escribe una petición por caso y control con la identidad real cifrada y no deja nada sin ignorar por git [US-269 AC-3] [US-269 AC-6]', () => {
    const resultado = correrElComando();

    expect(resultado.status, resultado.stderr).toBe(0);
    expect(readdirSync(SALIDA)).toHaveLength(15);
    const pii = JSON.parse(readFileSync(path.join(SALIDA, 'CHAT-AC01-MAMA-PII.json'), 'utf8')) as {
      peticion: unknown;
      identidad: string[];
    };
    expect(pii.identidad).toHaveLength(3);
    for (const texto of pii.identidad) expect(JSON.stringify(pii.peticion)).not.toContain(texto);
    const estado = spawnSync('git', ['status', '--porcelain', '--', SALIDA], {
      cwd: RAIZ_DEL_REPO,
      encoding: 'utf8',
    });
    expect(estado.stdout).toBe('');
  });

  it('borra las peticiones anteriores y no escribe ninguna cuando la base no es la de test sintética [RN-13]', () => {
    // el directorio de la corrida anterior (si quedó) lo vacía el comando antes de cualquier guarda
    mkdirSync(SALIDA, { recursive: true });
    writeFileSync(path.join(SALIDA, 'RESIDUO-DE-SIGKILL.json'), '{}', 'utf8');
    const url = new URL(base.url);
    const resultado = spawnSync(
      'npm',
      ['run', '--silent', 'eval:chat-preparar', '-w', 'apps/clinical-api'],
      {
        cwd: RAIZ_DEL_REPO,
        env: {
          PATH: process.env['PATH'] ?? '',
          HOME: process.env['HOME'] ?? '',
          APP_ENV: 'test',
          REAL_ANONYMIZED_ENABLED: 'true',
          CLINICAL_DATABASE_URL: `postgresql://${url.username}@${url.host}${url.pathname}`,
        },
        encoding: 'utf8',
        timeout: 120_000,
      },
    );

    expect(resultado.status).not.toBe(0);
    expect(resultado.stderr).toContain('REAL_ANONYMIZED_ENABLED');
    expect(existsSync(SALIDA)).toBe(false);
  });
});
