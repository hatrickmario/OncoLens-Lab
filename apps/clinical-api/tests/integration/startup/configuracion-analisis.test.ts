import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// Secretos y rutas ficticios en un directorio temporal: ningún valor es real (RN-13, RN-14).
const RAIZ_CLINICAL_API = path.resolve(import.meta.dirname, '../../..');
const RAIZ_REPO = path.resolve(RAIZ_CLINICAL_API, '../..');
const CATALOGO_DEL_MONOREPO = path.join(RAIZ_REPO, 'packages/clinical-catalogs');
const FORMATOS_DE_PII = path.join(RAIZ_REPO, 'config/pii-formats.json');
const MASCARAS_DE_PII = path.join(RAIZ_CLINICAL_API, 'config/pii-masks.json');

let directorio: string;
beforeEach(() => {
  directorio = mkdtempSync(path.join(tmpdir(), 'clinical-api-analisis-'));
});
afterEach(() => rmSync(directorio, { recursive: true, force: true }));

function archivo(nombre: string, contenido: string): string {
  const ruta = path.join(directorio, nombre);
  writeFileSync(ruta, contenido);
  return ruta;
}

/** Entorno válido hasta la configuración del gateway; cada caso quita o rompe una variable. */
function entornoValido(): Record<string, string> {
  return {
    PATH: process.env['PATH'] ?? '',
    PORT: '4998',
    APP_ENV: 'test',
    IDENTITY_AES_KEY_FILE: archivo('aes', 'aes-ficticia'),
    BLIND_INDEX_HMAC_KEY_FILE: archivo('hmac', 'hmac-ficticia'),
    SERVICE_JWT_PRIVATE_KEY_FILE: archivo('jwt.pem', 'clave-servicio-ficticia'),
    CLINICAL_DATABASE_URL: 'postgresql://clinical_api@postgres:5432/oncolens',
    PG_CLINICAL_API_PASSWORD_FILE: archivo('pg_password', 'contrasena-ficticia'),
    CLINICAL_DATABASE_CA_FILE: archivo('pg_ca.crt', 'ca-ficticia'),
    RAG_ORCHESTRATOR_URL: 'http://rag-orchestrator:8000',
    CLINICAL_CATALOG_PATH: CATALOGO_DEL_MONOREPO,
    PII_FORMATS_PATH: FORMATOS_DE_PII,
    PII_MASKS_PATH: MASCARAS_DE_PII,
    AI_DISCLAIMER_TEXT: 'Aviso sintético de test.',
  };
}

function arrancarConEntorno(cambios: Record<string, string | undefined>) {
  const env = { ...entornoValido(), ...cambios };
  for (const [clave, valor] of Object.entries(cambios)) if (valor === undefined) delete env[clave];
  return spawnSync(process.execPath, ['--import', 'tsx', 'src/server.ts'], {
    cwd: RAIZ_CLINICAL_API,
    env,
    encoding: 'utf8',
    timeout: 30_000,
  });
}

describe('arranque de clinical-api con el gateway de análisis montado', () => {
  it.each([
    ['RAG_ORCHESTRATOR_URL', { RAG_ORCHESTRATOR_URL: undefined }],
    ['RAG_ORCHESTRATOR_URL', { RAG_ORCHESTRATOR_URL: 'no-es-una-url' }],
    ['CLINICAL_CATALOG_PATH', { CLINICAL_CATALOG_PATH: undefined }],
    ['ANALYSIS_MAX_OPTIONS', { ANALYSIS_MAX_OPTIONS: '4' }],
    ['EVIDENCE_DEFAULT_YEARS', { EVIDENCE_DEFAULT_YEARS: '0' }],
    ['RAG_TIMEOUT_MS', { RAG_TIMEOUT_MS: '0' }],
    ['AI_DISCLAIMER_TEXT', { AI_DISCLAIMER_TEXT: undefined }],
    ['PII_FORMATS_PATH', { PII_FORMATS_PATH: undefined }],
    ['PII_MASKS_PATH', { PII_MASKS_PATH: undefined }],
    ['PII_NAME_TOKEN_MIN_LENGTH', { PII_NAME_TOKEN_MIN_LENGTH: '0' }],
  ])(
    'termina con código 1 sin escuchar y su stderr nombra %s cuando la configuración es inválida',
    (variable, cambios) => {
      const proceso = arrancarConEntorno(cambios);

      expect(proceso.status).toBe(1);
      expect(JSON.parse(proceso.stderr.trim())).toEqual({
        level: 'error',
        event: 'configuracion_invalida',
        variable,
        regla: expect.any(String),
        motivo: expect.stringMatching(/^(valor_invalido|variable_ausente)$/),
      });
      expect(proceso.stdout).not.toContain('escuchando');
    },
  );

  it('termina con código 1 nombrando CLINICAL_CATALOG_PATH, sin la ruta, cuando el catálogo no tiene manifest.json', () => {
    const catalogoSinManifest = path.join(directorio, 'secreto-sin-manifest');
    mkdirSync(catalogoSinManifest);

    const proceso = arrancarConEntorno({ CLINICAL_CATALOG_PATH: catalogoSinManifest });

    expect(proceso.status).toBe(1);
    expect(JSON.parse(proceso.stderr.trim())).toEqual({
      level: 'error',
      event: 'configuracion_invalida',
      variable: 'CLINICAL_CATALOG_PATH',
      regla: expect.any(String),
      motivo: expect.stringMatching(/^(valor_invalido|variable_ausente)$/),
    });
    expect(proceso.stderr).not.toContain('secreto-sin-manifest');
  });

  it.each([
    ['PII_FORMATS_PATH', 'pii-formats-ausente.json'],
    ['PII_MASKS_PATH', 'pii-masks-ausente.json'],
  ])(
    'termina con código 1 nombrando %s, sin la ruta, cuando el archivo no existe',
    (variable, nombre) => {
      const ruta = path.join(directorio, nombre);

      const proceso = arrancarConEntorno({ [variable]: ruta });

      expect(proceso.status).toBe(1);
      expect(JSON.parse(proceso.stderr.trim())).toEqual({
        level: 'error',
        event: 'configuracion_invalida',
        variable,
        regla: expect.any(String),
        motivo: expect.stringMatching(/^(valor_invalido|variable_ausente)$/),
      });
      expect(proceso.stderr).not.toContain(nombre);
    },
  );

  it.each([
    ['PII_FORMATS_PATH', 'formatos-invalidos.json'],
    ['PII_MASKS_PATH', 'mascaras-invalidas.json'],
  ])(
    'termina con código 1 nombrando %s cuando el archivo existe pero es inválido',
    (variable, nombre) => {
      const ruta = archivo(nombre, '{ "version": 1 }');

      const proceso = arrancarConEntorno({ [variable]: ruta });

      expect(proceso.status).toBe(1);
      expect(JSON.parse(proceso.stderr.trim())).toEqual({
        level: 'error',
        event: 'configuracion_invalida',
        variable,
        regla: expect.any(String),
        motivo: expect.stringMatching(/^(valor_invalido|variable_ausente)$/),
      });
    },
  );
});
