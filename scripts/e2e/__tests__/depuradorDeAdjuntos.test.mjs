import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import DepuradorDeAdjuntos from '../../../apps/web/e2e/depurador-de-adjuntos.ts';
import { MARCA_REDACTADO } from '../../../apps/web/e2e/depurar-traza.ts';

// L1D-278 (test después, RN-14): el depurador muta títulos de paso y adjuntos antes de que el informe HTML los copie.
// Lo que sale de un Playwright real lo prueba scripts/e2e/integracion/informe.integracion.mjs.
const CONTRASENA = 'contrasena-de-prueba-e2e';
let carpeta;
let depurador;

beforeEach(() => {
  carpeta = mkdtempSync(path.join(os.tmpdir(), 'depurador-test-'));
  depurador = new DepuradorDeAdjuntos();
  vi.stubEnv('E2E_DOC_CONTRASENA', CONTRASENA);
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  rmSync(carpeta, { recursive: true, force: true });
});

const terminar = (adjuntos) => {
  const resultado = { attachments: adjuntos };
  depurador.onTestEnd({ title: 'prueba' }, resultado);
  return resultado.attachments;
};

describe('DepuradorDeAdjuntos.onStepEnd', () => {
  it('sustituye la contraseña en el título del paso cuando el test rellena el campo', () => {
    const paso = { title: `Fill "${CONTRASENA}"` };

    depurador.onStepEnd({}, {}, paso);

    expect(paso.title).toBe(`Fill "${MARCA_REDACTADO}"`);
  });

  it('deja intacto el título que no contiene secretos', () => {
    const paso = { title: 'Click "Entrar"' };

    depurador.onStepEnd({}, {}, paso);

    expect(paso.title).toBe('Click "Entrar"');
  });
});

describe('DepuradorDeAdjuntos.onTestEnd', () => {
  it('depura el contenido en memoria de un adjunto de texto sin ruta', () => {
    const [adjunto] = terminar([{ name: 'nota', contentType: 'text/plain', body: Buffer.from(`clave ${CONTRASENA}`) }]);

    expect(adjunto.body.toString('utf8')).toBe(`clave ${MARCA_REDACTADO}`);
  });

  it('descarta el contenido en memoria de un adjunto de tipo desconocido que no se puede depurar', () => {
    const [adjunto] = terminar([{ name: 'captura', contentType: 'image/png', body: Buffer.from(CONTRASENA) }]);

    expect(adjunto.body).toBeUndefined();
  });

  it('borra el archivo de un adjunto de tipo desconocido', () => {
    const ruta = path.join(carpeta, 'captura.png');
    writeFileSync(ruta, CONTRASENA);

    terminar([{ name: 'captura', contentType: 'image/png', path: ruta }]);

    expect(existsSync(ruta)).toBe(false);
  });

  it('depura en el sitio el archivo de un adjunto de texto', () => {
    const ruta = path.join(carpeta, 'error-context.md');
    writeFileSync(ruta, `valor: ${CONTRASENA}`);

    terminar([{ name: 'error-context', contentType: 'text/markdown', path: ruta }]);

    expect(readFileSync(ruta, 'utf8')).toBe(`valor: ${MARCA_REDACTADO}`);
  });

  it('borra la traza que no es un zip legible (falla cerrado)', () => {
    const ruta = path.join(carpeta, 'trace.zip');
    writeFileSync(ruta, 'no es un zip');

    terminar([{ name: 'trace', contentType: 'application/zip', path: ruta }]);

    expect(existsSync(ruta)).toBe(false);
  });
});
