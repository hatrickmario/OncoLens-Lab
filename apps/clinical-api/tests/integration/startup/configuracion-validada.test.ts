import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { arrancar } from '../../../src/startup.js';

// Secretos ficticios en un directorio temporal: ningún valor es real (RN-13, RN-14).
let directorio: string;
beforeEach(() => {
  directorio = mkdtempSync(path.join(tmpdir(), 'clinical-api-config-validada-'));
});
afterEach(() => rmSync(directorio, { recursive: true, force: true }));

function archivo(nombre: string, contenido: string): string {
  const ruta = path.join(directorio, nombre);
  writeFileSync(ruta, contenido);
  return ruta;
}

/** Entorno válido de la etapa de arranque (secretos presentes) más lo que el caso cambie. */
function entorno(extra: Record<string, string>): NodeJS.ProcessEnv {
  return {
    PORT: '4100',
    IDENTITY_AES_KEY_FILE: archivo('aes', 'aes-ficticia'),
    BLIND_INDEX_HMAC_KEY_FILE: archivo('hmac', 'hmac-ficticia'),
    SERVICE_JWT_PRIVATE_KEY_FILE: archivo('jwt.pem', 'clave-servicio-ficticia'),
    ...extra,
  };
}

/** Arranca con el entorno inyectado y captura el log, la salida del proceso y las llamadas a listen. */
function arrancarCon(env: NodeJS.ProcessEnv) {
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
  return { log, salidas, escuchas };
}

describe('arranque con configuración validada', () => {
  it('no escucha y registra configuracion_invalida con la variable y la regla, sin el valor, cuando SESSION_IDLE_MINUTES=abc [US-037 AC-2]', () => {
    const resultado = arrancarCon(entorno({ SESSION_IDLE_MINUTES: 'abc' }));

    expect(resultado.salidas).toEqual([1]);
    expect(resultado.escuchas).toEqual([]);
    const linea = JSON.parse(resultado.log.join('\n')) as Record<string, unknown>;
    expect(linea).toMatchObject({
      level: 'error',
      event: 'configuracion_invalida',
      variable: 'SESSION_IDLE_MINUTES',
      motivo: 'valor_invalido',
    });
    expect(typeof linea['regla']).toBe('string');
    expect(linea['regla']).not.toBe('');
    expect(linea).not.toHaveProperty('valorInvalido');
    expect(resultado.log.join('\n')).not.toContain('abc');
  });

  it.each(['REAL_ANONYMIZED_ENABLED', 'REAL_IDENTIFIED_ENABLED'])(
    'no escucha y registra REAL_DATA_GATE_NOT_PASSED cuando %s es true [US-037 AC-3]',
    (variable) => {
      const resultado = arrancarCon(entorno({ [variable]: 'true' }));

      expect(resultado.salidas).toEqual([1]);
      expect(resultado.escuchas).toEqual([]);
      expect(JSON.parse(resultado.log.join('\n'))).toEqual({
        level: 'error',
        event: 'REAL_DATA_GATE_NOT_PASSED',
        variable,
      });
    },
  );
});
