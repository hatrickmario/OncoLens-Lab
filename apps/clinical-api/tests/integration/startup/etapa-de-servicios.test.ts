import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { arrancar, cargarEtapaDeServicios } from '../../../src/startup.js';

// Secretos y rutas ficticios en un directorio temporal: ningún valor es real (RN-13, RN-14).
const RAIZ_REPO = path.resolve(import.meta.dirname, '../../../../..');
const CATALOGO_DEL_MONOREPO = path.join(RAIZ_REPO, 'packages/clinical-catalogs');
const FORMATOS_DE_PII = path.join(RAIZ_REPO, 'config/pii-formats.json');
const MASCARAS_DE_PII = path.join(RAIZ_REPO, 'apps/clinical-api/config/pii-masks.json');

/** Claves AES y HMAC distintas, de 32 bytes en base64 (formato de setup-secrets.sh); ficticias. */
const CLAVE_AES_FICTICIA = Buffer.alloc(32, 7).toString('base64');
const CLAVE_HMAC_FICTICIA = Buffer.alloc(32, 9).toString('base64');

let directorio: string;
beforeEach(() => {
  directorio = mkdtempSync(path.join(tmpdir(), 'clinical-api-etapa-'));
});
afterEach(() => rmSync(directorio, { recursive: true, force: true }));

function archivo(nombre: string, contenido: string): string {
  const ruta = path.join(directorio, nombre);
  writeFileSync(ruta, contenido);
  return ruta;
}

/** Entorno válido de las dos etapas; cada caso quita o rompe una variable. */
function entornoValido(): Record<string, string> {
  return {
    PORT: '4998',
    APP_ENV: 'test',
    IDENTITY_AES_KEY_FILE: archivo('aes', CLAVE_AES_FICTICIA),
    BLIND_INDEX_HMAC_KEY_FILE: archivo('hmac', CLAVE_HMAC_FICTICIA),
    SERVICE_JWT_PRIVATE_KEY_FILE: archivo('jwt.pem', 'clave-servicio-ficticia'),
    CLINICAL_DATABASE_URL: 'postgresql://clinical_api@postgres:5432/oncolens',
    PG_CLINICAL_API_PASSWORD_FILE: archivo('pg_password', 'contrasena-ficticia'),
    CLINICAL_DATABASE_CA_FILE: archivo('pg_ca.crt', 'ca-ficticia'),
    RAG_ORCHESTRATOR_URL: 'http://rag-orchestrator:8000',
    CLINICAL_CATALOG_PATH: CATALOGO_DEL_MONOREPO,
    PII_FORMATS_PATH: FORMATOS_DE_PII,
    PII_MASKS_PATH: MASCARAS_DE_PII,
    AI_DISCLAIMER_TEXT: 'Aviso sintético de test.',
    CLINICAL_MINIO_PASSWORD_FILE: archivo('minio_password', 'clave-minio-ficticia'),
    ENABLED_CANCER_TYPES: 'mama,prostata',
    CORPUS_EXCLUDED_SOURCES: 'NCCN,ESMO',
    CORPUS_CUTOFF_DATE: '2026-09-30',
  };
}

function arrancarCon(env: NodeJS.ProcessEnv) {
  const log: string[] = [];
  const salidas: number[] = [];
  const escuchas: number[] = [];
  arrancar({
    env,
    readFile: (ruta) => readFileSync(ruta, 'utf8'),
    log: (linea) => log.push(linea),
    exit: (codigo) => salidas.push(codigo),
    cargarServicios: cargarEtapaDeServicios,
    listen: (puerto) => escuchas.push(puerto),
  });
  return { log: log.join('\n'), salidas, escuchas };
}

describe('arranque: etapa de servicios dentro de arrancar', () => {
  it('no escucha y registra configuracion_invalida con PII_FORMATS_PATH cuando la variable falta [US-037 AC-2]', () => {
    const env = entornoValido();
    delete env['PII_FORMATS_PATH'];

    const resultado = arrancarCon(env);

    expect(resultado.salidas).toEqual([1]);
    expect(resultado.escuchas).toEqual([]);
    expect(JSON.parse(resultado.log)).toMatchObject({
      level: 'error',
      event: 'configuracion_invalida',
      variable: 'PII_FORMATS_PATH',
      motivo: 'variable_ausente',
    });
  });

  it('no escucha y registra configuracion_invalida con RAG_TIMEOUT_MS cuando el plazo es 0 [US-037 AC-2]', () => {
    const resultado = arrancarCon({ ...entornoValido(), RAG_TIMEOUT_MS: '0' });

    expect(resultado.salidas).toEqual([1]);
    expect(JSON.parse(resultado.log)).toMatchObject({
      event: 'configuracion_invalida',
      variable: 'RAG_TIMEOUT_MS',
      motivo: 'valor_invalido',
    });
  });

  it('no escucha y registra configuracion_invalida con catalogo_no_disponible, sin ruta, cuando el catálogo no existe [US-041 AC-5]', () => {
    const catalogoAusente = path.join(directorio, 'catalogo-secreto-ausente');

    const resultado = arrancarCon({ ...entornoValido(), CLINICAL_CATALOG_PATH: catalogoAusente });

    expect(resultado.salidas).toEqual([1]);
    expect(resultado.escuchas).toEqual([]);
    expect(JSON.parse(resultado.log)).toEqual({
      level: 'error',
      event: 'configuracion_invalida',
      variable: 'CLINICAL_CATALOG_PATH',
      regla: 'manifest.json legible',
      motivo: 'catalogo_no_disponible',
    });
    expect(resultado.log).not.toContain('catalogo-secreto-ausente');
  });

  it('no escucha y registra configuracion_invalida con CLINICAL_CATALOG_VERSION, sin versiones ni ruta, cuando difiere del manifiesto [US-041 D1]', () => {
    const resultado = arrancarCon({ ...entornoValido(), CLINICAL_CATALOG_VERSION: '9.9.9' });

    expect(resultado.salidas).toEqual([1]);
    expect(resultado.escuchas).toEqual([]);
    expect(JSON.parse(resultado.log)).toEqual({
      level: 'error',
      event: 'configuracion_invalida',
      variable: 'CLINICAL_CATALOG_VERSION',
      regla: expect.any(String),
      motivo: 'version_catalogo_distinta',
    });
    expect(resultado.log).not.toContain('9.9.9');
    expect(resultado.log).not.toContain(CATALOGO_DEL_MONOREPO);
  });

  it('escucha una vez cuando CLINICAL_CATALOG_VERSION coincide con el manifiesto [US-041 D1]', () => {
    const resultado = arrancarCon({ ...entornoValido(), CLINICAL_CATALOG_VERSION: '1.0.0' });

    expect(resultado.salidas).toEqual([]);
    expect(resultado.escuchas).toEqual([4998]);
  });

  it('escucha una vez y no registra nada cuando las dos etapas son válidas [US-037 AC-2]', () => {
    const resultado = arrancarCon(entornoValido());

    expect(resultado.salidas).toEqual([]);
    expect(resultado.escuchas).toEqual([4998]);
    expect(resultado.log).toBe('');
  });

  it('no escucha y registra configuracion_invalida con ENABLED_CANCER_TYPES y variable_ausente, sin valorInvalido, cuando la lista está vacía [US-043 AC-5]', () => {
    const resultado = arrancarCon({ ...entornoValido(), ENABLED_CANCER_TYPES: '' });

    expect(resultado.salidas).toEqual([1]);
    expect(resultado.escuchas).toEqual([]);
    expect(JSON.parse(resultado.log)).toEqual({
      level: 'error',
      event: 'configuracion_invalida',
      variable: 'ENABLED_CANCER_TYPES',
      regla: expect.any(String),
      motivo: 'variable_ausente',
    });
  });

  it('no escucha y registra configuracion_invalida con tipo_no_en_catalogo y el tipo en valorInvalido cuando la lista trae un tipo ausente del manifiesto [US-043 AC-5]', () => {
    const resultado = arrancarCon({ ...entornoValido(), ENABLED_CANCER_TYPES: 'mama,leucemia' });

    expect(resultado.salidas).toEqual([1]);
    expect(resultado.escuchas).toEqual([]);
    expect(JSON.parse(resultado.log)).toEqual({
      level: 'error',
      event: 'configuracion_invalida',
      variable: 'ENABLED_CANCER_TYPES',
      regla: expect.any(String),
      motivo: 'tipo_no_en_catalogo',
      valorInvalido: 'leucemia',
    });
  });

  it('no registra el valor del tipo cuando no cumple la forma cerrada de un enum no sensible [US-043 AC-5]', () => {
    const resultado = arrancarCon({ ...entornoValido(), ENABLED_CANCER_TYPES: 'mama,tipo-x9' });

    expect(resultado.salidas).toEqual([1]);
    expect(JSON.parse(resultado.log)).not.toHaveProperty('valorInvalido');
    expect(resultado.log).not.toContain('tipo-x9');
  });

  it.each([
    ['CORPUS_CUTOFF_DATE', '', 'variable_ausente'],
    ['CORPUS_CUTOFF_DATE', '2026-02-31', 'valor_invalido'],
    ['CORPUS_EXCLUDED_SOURCES', '', 'variable_ausente'],
  ])(
    'no escucha y registra configuracion_invalida con %s (%s) [US-043 D7]',
    (variable, valor, motivo) => {
      const resultado = arrancarCon({ ...entornoValido(), [variable]: valor });

      expect(resultado.salidas).toEqual([1]);
      expect(JSON.parse(resultado.log)).toMatchObject({
        event: 'configuracion_invalida',
        variable,
        motivo,
      });
      expect(resultado.log).not.toContain('2026-02-31');
    },
  );
});
