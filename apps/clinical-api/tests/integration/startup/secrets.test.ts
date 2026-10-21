import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { arrancar } from '../../../src/startup.js';

// Secretos ficticios en un directorio temporal: ningún valor es real (RN-13, RN-14).
const VALOR_AES = 'valor-ficticio-aes-0123456789';
const VALOR_HMAC = 'valor-ficticio-hmac-9876543210';

const RAIZ_CLINICAL_API = path.resolve(import.meta.dirname, '../../..');

let directorio: string;

beforeEach(() => {
  directorio = mkdtempSync(path.join(tmpdir(), 'clinical-api-secretos-'));
});
afterEach(() => rmSync(directorio, { recursive: true, force: true }));

function escribir(nombre: string, contenido: string): string {
  const ruta = path.join(directorio, nombre);
  writeFileSync(ruta, contenido);
  return ruta;
}

/** Arranca con el lector real de archivos y captura el log, la salida del proceso y las llamadas a listen. */
function arrancarCapturando(env: NodeJS.ProcessEnv) {
  const log: string[] = [];
  const salidas: number[] = [];
  const escuchas: number[] = [];
  arrancar({
    env,
    readFile: (ruta) => readFileSync(ruta, 'utf8'),
    log: (linea) => log.push(linea),
    exit: (codigo) => salidas.push(codigo),
    // Estos casos prueban la etapa 1: la de servicios se cubre en etapa-de-servicios.test.ts.
    cargarServicios: () => undefined,
    listen: (puerto) => escuchas.push(puerto),
  });
  return { log: log.join('\n'), salidas, escuchas };
}

describe('arranque de clinical-api', () => {
  it('falla antes de escuchar y el log nombra IDENTITY_AES_KEY_FILE sin ningún valor cuando falta el archivo de la clave AES [US-035 AC-5]', () => {
    const resultado = arrancarCapturando({
      IDENTITY_AES_KEY_FILE: path.join(directorio, 'identity_aes_key'),
      BLIND_INDEX_HMAC_KEY_FILE: escribir('blind_index_hmac_key', VALOR_HMAC),
    });

    expect(resultado.salidas).toEqual([1]);
    expect(resultado.escuchas).toEqual([]);
    expect(JSON.parse(resultado.log)).toEqual({
      level: 'error',
      event: 'configuracion_invalida',
      motivo: 'variable_ausente',
      variable: 'IDENTITY_AES_KEY_FILE',
      regla: expect.any(String),
    });
    expect(resultado.log).not.toContain(VALOR_HMAC);
  });

  it('falla antes de escuchar y el log nombra BLIND_INDEX_HMAC_KEY_FILE sin ningún valor cuando el archivo de la clave HMAC está vacío [US-035 AC-5]', () => {
    const resultado = arrancarCapturando({
      IDENTITY_AES_KEY_FILE: escribir('identity_aes_key', VALOR_AES),
      BLIND_INDEX_HMAC_KEY_FILE: escribir('blind_index_hmac_key', ''),
    });

    expect(resultado.salidas).toEqual([1]);
    expect(resultado.escuchas).toEqual([]);
    expect(JSON.parse(resultado.log)).toMatchObject({
      event: 'configuracion_invalida',
      motivo: 'variable_ausente',
      variable: 'BLIND_INDEX_HMAC_KEY_FILE',
    });
    expect(resultado.log).not.toContain(VALOR_AES);
  });

  it('escucha en el puerto configurado y no registra ningún error cuando las dos claves de identidad están presentes', () => {
    const resultado = arrancarCapturando({
      PORT: '4100',
      IDENTITY_AES_KEY_FILE: escribir('identity_aes_key', VALOR_AES),
      BLIND_INDEX_HMAC_KEY_FILE: escribir('blind_index_hmac_key', VALOR_HMAC),
      SERVICE_JWT_PRIVATE_KEY_FILE: escribir('jwt_service_private.pem', 'clave-servicio-ficticia'),
    });

    expect(resultado.salidas).toEqual([]);
    expect(resultado.escuchas).toEqual([4100]);
    expect(resultado.log).toBe('');
  });

  it('el proceso real termina con código 1 sin escuchar y su stderr nombra la variable cuando no hay secretos montados', () => {
    const proceso = spawnSync(process.execPath, ['--import', 'tsx', 'src/server.ts'], {
      cwd: RAIZ_CLINICAL_API,
      env: { PATH: process.env['PATH'] ?? '', PORT: '0' },
      encoding: 'utf8',
      timeout: 30_000,
    });

    expect(proceso.status).toBe(1);
    expect(JSON.parse(proceso.stderr.trim())).toMatchObject({
      event: 'configuracion_invalida',
      motivo: 'variable_ausente',
      variable: 'IDENTITY_AES_KEY_FILE',
    });
    expect(proceso.stdout).not.toContain('escuchando');
  });
});
