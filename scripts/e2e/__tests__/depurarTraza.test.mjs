import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { depurarAdjuntoDeTexto, depurarOBorrar, depurarTraza, escribirZip, leerZip, MARCA_REDACTADO, secretosDeE2e } from '../../../apps/web/e2e/depurar-traza.ts';

// L1D-278 (test después, ARR-02 AC-1, RN-14): la traza que sube la CI como artefacto no contiene cuerpos de request ni la
// contraseña de prueba. El zip imita el que escribe Playwright con `trace: 'on-first-retry'` para un login fallido
// (trace.trace con el `fill` y el valor del input en el snapshot, trace.network con el `postData` en resources/).
const CONTRASENA = 'contrasena-de-prueba-e2e';
const SHA_CUERPO_LOGIN = '3d09c9d7f6599786068d9f895338ccb7ce94de54';
const SHA_RESPUESTA_LOGIN = '5167577da01fb1238dc651de2c0166b2534008dd';
const SHA_PAGINA = '54bb60e96af74b5a9d1037964fcc54ba38904adb';
const SHA_RESPUESTA_GET = '9c1185a5c5e9fc54612808977ee8f548b2258d31';

// Playwright 1.64 referencia los recursos con `_file` (ruta completa); las versiones anteriores, con `_sha1`. Se cubren ambas.
const registroDeRed = (metodo, url, cuerpo, respuesta, clave = '_file') => {
  const referencia = (sha1) => (clave === '_file' ? `resources/${sha1}.json` : sha1);
  return JSON.stringify({
    type: 'resource-snapshot',
    snapshot: {
      request: { method: metodo, url, ...(cuerpo ? { postData: { [clave]: referencia(cuerpo) } } : {}) },
      response: { status: 401, content: { mimeType: 'application/json', [clave]: referencia(respuesta) } },
    },
  });
};

function entradasDeLoginFallido() {
  const texto = (nombre, contenido) => ({ nombre, datos: Buffer.from(contenido, 'utf8') });
  return [
    texto(
      'trace.trace',
      [
        JSON.stringify({ type: 'before', apiName: 'locator.fill', params: { selector: 'internal:label="Contraseña"', value: CONTRASENA } }),
        JSON.stringify({ type: 'frame-snapshot', html: ['INPUT', { __playwright_value_: CONTRASENA, type: 'password' }] }),
      ].join('\n'),
    ),
    texto(
      'trace.network',
      [
        registroDeRed('GET', 'http://127.0.0.1:3000/login', undefined, SHA_PAGINA),
        registroDeRed('POST', 'http://127.0.0.1:3000/api/auth/login', SHA_CUERPO_LOGIN, SHA_RESPUESTA_LOGIN),
        registroDeRed('GET', 'http://127.0.0.1:3000/api/health', undefined, SHA_RESPUESTA_GET),
      ].join('\n'),
    ),
    texto(`resources/${SHA_CUERPO_LOGIN}.json`, JSON.stringify({ email: 'doc1@oncolens.test', password: CONTRASENA })),
    texto(`resources/${SHA_RESPUESTA_LOGIN}.json`, '{"error":"credenciales"}'),
    texto(`resources/${SHA_PAGINA}.html`, '<form></form>'),
    texto(`resources/${SHA_RESPUESTA_GET}.json`, '{"estado":"ok"}'),
    texto('src/login.spec.mjs', `await page.getByLabel('Contraseña').fill('${CONTRASENA}');`),
    { nombre: 'screencast/captura-1.jpeg', datos: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]) },
  ];
}

let carpeta;
let ruta;

beforeEach(() => {
  carpeta = mkdtempSync(path.join(os.tmpdir(), 'depurar-traza-test-'));
  ruta = path.join(carpeta, 'trace.zip');
  writeFileSync(ruta, escribirZip(entradasDeLoginFallido()));
});
afterEach(() => rmSync(carpeta, { recursive: true, force: true }));

const entradas = () => Object.fromEntries(leerZip(readFileSync(ruta)).map((e) => [e.nombre, e.datos]));

describe('depurarTraza', () => {
  it('sonda de control: la traza sin depurar sí contiene la contraseña y su cuerpo de request', () => {
    const nombres = Object.keys(entradas());
    const texto = Object.values(entradas()).map((datos) => datos.toString('latin1')).join('\n');

    expect(texto).toContain(CONTRASENA);
    expect(nombres).toContain(`resources/${SHA_CUERPO_LOGIN}.json`);
  });

  it('la traza de un login fallido no contiene la contraseña de prueba cuando se depura [ARR-02 AC-1]', () => {
    depurarTraza(ruta, [CONTRASENA]);

    const contenidos = Object.values(entradas());
    expect(contenidos.length).toBeGreaterThan(0);
    for (const datos of contenidos) expect(datos.toString('latin1')).not.toContain(CONTRASENA);
    expect(entradas()['trace.trace'].toString('utf8')).toContain(MARCA_REDACTADO);
  });

  it('elimina el cuerpo del request y la respuesta de POST /api/* y conserva el resto de recursos cuando se depura', () => {
    depurarTraza(ruta, [CONTRASENA]);

    const nombres = Object.keys(entradas());
    expect(nombres).not.toContain(`resources/${SHA_CUERPO_LOGIN}.json`);
    expect(nombres).not.toContain(`resources/${SHA_RESPUESTA_LOGIN}.json`);
    expect(nombres).toEqual(expect.arrayContaining([`resources/${SHA_PAGINA}.html`, `resources/${SHA_RESPUESTA_GET}.json`, 'screencast/captura-1.jpeg']));
    const red = entradas()['trace.network'].toString('utf8');
    expect(red).not.toContain('postData');
    expect(red).not.toContain(SHA_CUERPO_LOGIN);
    expect(red).toContain(SHA_RESPUESTA_GET);
  });

  it('elimina también los recursos referenciados con _sha1 (Playwright anterior) cuando se depura', () => {
    writeFileSync(
      ruta,
      escribirZip([
        { nombre: 'trace.network', datos: Buffer.from(registroDeRed('POST', 'http://127.0.0.1:3000/api/auth/login', SHA_CUERPO_LOGIN, SHA_RESPUESTA_LOGIN, '_sha1')) },
        { nombre: `resources/${SHA_CUERPO_LOGIN}.json`, datos: Buffer.from(`{"password":"${CONTRASENA}"}`) },
        { nombre: `resources/${SHA_RESPUESTA_LOGIN}.json`, datos: Buffer.from('{}') },
      ]),
    );

    depurarTraza(ruta, [CONTRASENA]);

    expect(Object.keys(entradas())).toEqual(['trace.network']);
  });

  it('redacta también la forma escapada en JSON y la codificada en URL del secreto', () => {
    const secreto = 'a"b+c/d';
    writeFileSync(
      ruta,
      escribirZip([
        { nombre: 'trace.trace', datos: Buffer.from(`{"value":${JSON.stringify(secreto)}} q=${encodeURIComponent(secreto)}`) },
        { nombre: 'trace.network', datos: Buffer.from('') },
      ]),
    );

    depurarTraza(ruta, [secreto]);

    expect(entradas()['trace.trace'].toString('utf8')).toBe(`{"value":"${MARCA_REDACTADO}"} q=${MARCA_REDACTADO}`);
  });

  it('conserva los bytes de las entradas binarias cuando se depura', () => {
    depurarTraza(ruta, [CONTRASENA]);

    expect([...entradas()['screencast/captura-1.jpeg']]).toEqual([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
  });
});

describe('depurarOBorrar', () => {
  it('borra la traza y devuelve false cuando no se puede depurar (falla cerrado)', () => {
    writeFileSync(ruta, 'no es un zip');

    expect(depurarOBorrar(ruta, [CONTRASENA])).toBe(false);
    expect(existsSync(ruta)).toBe(false);
  });

  it('conserva la traza depurada y devuelve true cuando se puede depurar', () => {
    expect(depurarOBorrar(ruta, [CONTRASENA])).toBe(true);
    expect(existsSync(ruta)).toBe(true);
  });
});

describe('depurarAdjuntoDeTexto', () => {
  it('sustituye la contraseña en error-context.md, que copia el valor de los input al fallar', () => {
    const adjunto = path.join(carpeta, 'error-context.md');
    writeFileSync(adjunto, `- textbox "Contraseña" [ref=e4]: ${CONTRASENA}\n`);

    depurarAdjuntoDeTexto(adjunto, [CONTRASENA]);

    expect(readFileSync(adjunto, 'utf8')).toBe(`- textbox "Contraseña" [ref=e4]: ${MARCA_REDACTADO}\n`);
  });
});

describe('secretosDeE2e', () => {
  it('toma solo las variables E2E_*CONTRASENA con valor', () => {
    const entorno = { E2E_DOC_CONTRASENA: 'uno', E2E_OTRA_CONTRASENA: '', E2E_DOC_CORREO: 'doc1@oncolens.test', PATH: '/bin' };

    expect(secretosDeE2e(entorno)).toEqual(['uno']);
  });
});
