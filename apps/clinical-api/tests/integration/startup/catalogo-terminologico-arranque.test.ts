import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { arrancar, cargarEtapaDeServicios } from '../../../src/startup.js';
import { RUTA_CATALOGO_FX01BB, RUTA_CATALOGO_REAL } from '../../support/catalogo-terminologico.js';

// Secretos y rutas ficticios en un directorio temporal: ningún valor es real (RN-13, RN-14).
const RAIZ_REPO = path.resolve(import.meta.dirname, '../../../../..');
const CLAVE_AES_FICTICIA = Buffer.alloc(32, 7).toString('base64');
const CLAVE_HMAC_FICTICIA = Buffer.alloc(32, 9).toString('base64');

let directorio: string;
let catalogo: string;
beforeEach(() => {
  directorio = mkdtempSync(path.join(tmpdir(), 'clinical-api-terminologia-'));
  catalogo = path.join(directorio, 'catalogo');
  cpSync(RUTA_CATALOGO_FX01BB, catalogo, { recursive: true });
});
afterEach(() => rmSync(directorio, { recursive: true, force: true }));

function archivo(nombre: string, contenido: string): string {
  const ruta = path.join(directorio, nombre);
  writeFileSync(ruta, contenido);
  return ruta;
}

function entorno(): Record<string, string> {
  return {
    PORT: '4997',
    APP_ENV: 'test',
    IDENTITY_AES_KEY_FILE: archivo('aes', CLAVE_AES_FICTICIA),
    BLIND_INDEX_HMAC_KEY_FILE: archivo('hmac', CLAVE_HMAC_FICTICIA),
    SERVICE_JWT_PRIVATE_KEY_FILE: archivo('jwt.pem', 'clave-servicio-ficticia'),
    CLINICAL_DATABASE_URL: 'postgresql://clinical_api@postgres:5432/oncolens',
    PG_CLINICAL_API_PASSWORD_FILE: archivo('pg_password', 'contrasena-ficticia'),
    CLINICAL_DATABASE_CA_FILE: archivo('pg_ca.crt', 'ca-ficticia'),
    RAG_ORCHESTRATOR_URL: 'http://rag-orchestrator:8000',
    CLINICAL_CATALOG_PATH: catalogo,
    PII_FORMATS_PATH: path.join(RAIZ_REPO, 'config/pii-formats.json'),
    PII_MASKS_PATH: path.join(RAIZ_REPO, 'apps/clinical-api/config/pii-masks.json'),
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

describe('arranque: catálogo terminológico', () => {
  it('escucha cuando codigos.json y sinonimos.json son válidos', () => {
    const resultado = arrancarCon(entorno());

    expect(resultado.salidas).toEqual([]);
    expect(resultado.escuchas).toEqual([4997]);
  });

  it('no arranca con un codigos.json inválido [US-098 AC-2]', () => {
    writeFileSync(path.join(catalogo, 'mama/codigos.json'), '{"entradas":[{"codigo":"X"}]}');

    const resultado = arrancarCon(entorno());

    expect(resultado.salidas).toEqual([1]);
    expect(resultado.escuchas).toEqual([]);
    expect(JSON.parse(resultado.log)).toEqual({
      level: 'error',
      event: 'configuracion_invalida',
      variable: 'CLINICAL_CATALOG_PATH',
      regla: 'esquema_invalido',
      motivo: 'catalogo_invalido',
    });
    expect(resultado.log).not.toContain(directorio);
  });

  it('arranca con el catálogo real que declara sinonimos y sus relaciones [US-277 AC-1]', () => {
    const manifiesto = JSON.parse(
      readFileSync(path.join(RUTA_CATALOGO_REAL, 'manifest.json'), 'utf8'),
    );
    const env = { ...entorno(), CLINICAL_CATALOG_PATH: RUTA_CATALOGO_REAL };

    const resultado = arrancarCon(env);

    expect(manifiesto.sinonimos).toEqual(['mama', 'prostata']);
    expect(resultado.salidas).toEqual([]);
    expect(resultado.escuchas).toEqual([4997]);
  });

  it('no arranca y nombra solo el código de la violación cuando el catálogo declara sinonimos y trae un equivalente ambiguo [US-277 AC-1]', () => {
    const manifiesto = JSON.parse(readFileSync(path.join(catalogo, 'manifest.json'), 'utf8'));
    writeFileSync(
      path.join(catalogo, 'manifest.json'),
      JSON.stringify({ ...manifiesto, sinonimos: ['mama', 'prostata'] }),
    );
    const eq = (texto: string) => ({ texto, idioma: 'es', relacion: 'equivalente' });
    writeFileSync(
      path.join(catalogo, 'prostata/sinonimos.json'),
      JSON.stringify({
        version: '1.0.0',
        items: [
          { terminoCanonico: 'vigilancia activa', sinonimos: [eq('seguimiento secreto')] },
          { terminoCanonico: 'espera vigilante', sinonimos: [eq('seguimiento secreto')] },
        ],
      }),
    );
    writeFileSync(
      path.join(catalogo, 'mama/sinonimos.json'),
      JSON.stringify({ version: '1.0.0', items: [] }),
    );

    const resultado = arrancarCon(entorno());

    expect(resultado.salidas).toEqual([1]);
    expect(JSON.parse(resultado.log)).toMatchObject({
      event: 'configuracion_invalida',
      regla: 'sinonimo_equivalente_ambiguo',
    });
    expect(resultado.log).not.toContain('secreto');
    expect(resultado.log).not.toContain(directorio);
  });
});
