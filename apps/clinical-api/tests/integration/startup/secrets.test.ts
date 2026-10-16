import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { arrancar } from '../../../src/startup.js';

// Secretos ficticios en un directorio temporal: ningún valor es real (RN-13, RN-14).
const VALOR_AES = 'valor-ficticio-aes-0123456789';
const VALOR_HMAC = 'valor-ficticio-hmac-9876543210';

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
      event: 'secreto_ausente',
      variable: 'IDENTITY_AES_KEY_FILE',
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
      event: 'secreto_ausente',
      variable: 'BLIND_INDEX_HMAC_KEY_FILE',
    });
    expect(resultado.log).not.toContain(VALOR_AES);
  });

  it('escucha en el puerto configurado y no registra ningún error cuando las dos claves de identidad están presentes', () => {
    const resultado = arrancarCapturando({
      PORT: '4100',
      IDENTITY_AES_KEY_FILE: escribir('identity_aes_key', VALOR_AES),
      BLIND_INDEX_HMAC_KEY_FILE: escribir('blind_index_hmac_key', VALOR_HMAC),
    });

    expect(resultado.salidas).toEqual([]);
    expect(resultado.escuchas).toEqual([4100]);
    expect(resultado.log).toBe('');
  });
});
