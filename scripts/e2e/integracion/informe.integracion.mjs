import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buscarSecretos } from '../../../apps/web/e2e/buscar-secretos.ts';

// L1D-278 (RN-14): Playwright REAL contra un servidor local mínimo con un login fallido y un test en verde. Comprueba
// qué queda de la contraseña de prueba en `playwright-report/` y `test-results/` (lo que se sube como artefacto público).
// Sonda de control: sin los reporters de depuración la contraseña SÍ aparece; con ellos no aparece en ningún archivo.
const RAIZ = path.resolve(import.meta.dirname, '../../..');
const CLI = path.join(RAIZ, 'node_modules/@playwright/test/cli.js');
const CONTRASENA = 'contrasena-de-prueba-e2e-Zq9';
const E2E = path.join(RAIZ, 'apps/web/e2e');

const SPEC = `
import http from 'node:http';
import { expect, test } from '@playwright/test';

async function iniciarSesionFallida(page) {
  const servidor = http.createServer((peticion, respuesta) => {
    if (peticion.method === 'POST') {
      peticion.resume();
      peticion.on('end', () => { respuesta.writeHead(401, { 'content-type': 'application/json' }); respuesta.end('{"error":"credenciales"}'); });
      return;
    }
    respuesta.writeHead(200, { 'content-type': 'text/html' });
    respuesta.end('<meta charset=utf-8><form id=f><label>Contraseña<input id=p type=password></label><button>Entrar</button></form><p id=e role=alert></p><script>f.onsubmit=async (ev)=>{ev.preventDefault();const r=await fetch("/api/auth/login",{method:"POST",body:JSON.stringify({password:p.value})});e.textContent=r.ok?"":"Credenciales inválidas"}</script>');
  });
  await new Promise((listo) => servidor.listen(0, '127.0.0.1', listo));
  await page.goto('http://127.0.0.1:' + servidor.address().port + '/');
  await page.getByLabel('Contraseña').fill(process.env.E2E_DOC_CONTRASENA);
  await page.getByRole('button', { name: 'Entrar' }).click();
  return servidor;
}

test('muestra el error cuando el login falla', async ({ page }) => {
  const servidor = await iniciarSesionFallida(page);
  await expect(page.getByRole('alert')).toHaveText('Credenciales inválidas');
  servidor.close();
});

if (process.env.E2E_INTEGRACION_FALLA) {
  test('falla a propósito con el formulario relleno', async ({ page }) => {
    const servidor = await iniciarSesionFallida(page);
    await expect(page.getByRole('alert')).toHaveText('otro texto', { timeout: 1500 });
    servidor.close();
  });
}
`;

let trabajo;

beforeAll(() => {
  trabajo = mkdtempSync(path.join(os.tmpdir(), 'informe-integracion-'));
});
afterAll(() => rmSync(trabajo, { recursive: true, force: true }));

/** Corre Playwright en una carpeta nueva con esos reporters; devuelve el estado, la salida y las coincidencias. */
function correr({ nombre, reporters, conFallo = false }) {
  const carpeta = path.join(trabajo, nombre);
  mkdirSync(carpeta);
  symlinkSync(path.join(RAIZ, 'node_modules'), path.join(carpeta, 'node_modules'));
  writeFileSync(path.join(carpeta, 'login.spec.mjs'), SPEC);
  const informe = path.join(carpeta, 'playwright-report');
  const resultados = path.join(carpeta, 'test-results');
  const lista = reporters.map((reporter) => {
    if (reporter === 'html') return ['html', { open: 'never', outputFolder: informe }];
    if (reporter === 'verificador-de-informe')
      return [path.join(E2E, `${reporter}.ts`), { carpetas: [informe, resultados] }];
    return [path.join(E2E, `${reporter}.ts`)];
  });
  writeFileSync(
    path.join(carpeta, 'playwright.config.mjs'),
    `export default { testDir: '.', testMatch: '*.spec.mjs', retries: 0, workers: 1, outputDir: ${JSON.stringify(resultados)}, reporter: ${JSON.stringify(lista)}, use: { trace: 'on' } };`,
  );
  const proceso = spawnSync('node', [CLI, 'test', '-c', path.join(carpeta, 'playwright.config.mjs')], {
    cwd: carpeta,
    encoding: 'utf8',
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      E2E_DOC_CONTRASENA: CONTRASENA,
      ...(conFallo ? { E2E_INTEGRACION_FALLA: '1' } : {}),
    },
  });
  const coincidencias = [informe, resultados]
    .filter(existsSync)
    .flatMap((c) => buscarSecretos(c, [CONTRASENA]).map((r) => `${path.basename(c)}/${r}`));
  return { proceso, coincidencias, informe, resultados, salida: `${proceso.stdout}${proceso.stderr}` };
}

describe('informe y test-results de Playwright', () => {
  it('sonda de control: sin los reporters de depuración la contraseña aparece en el informe cuando el login falla', () => {
    const { coincidencias } = correr({ nombre: 'control', reporters: ['html'], conFallo: true });

    expect(coincidencias.length).toBeGreaterThan(0);
    expect(coincidencias.some((ruta) => ruta.startsWith('playwright-report/'))).toBe(true);
  });

  it('no deja la contraseña en ningún archivo del informe ni de test-results con un login fallido y un test en rojo [ARR-02 AC-1]', () => {
    const { coincidencias, proceso } = correr({
      nombre: 'depurado-rojo',
      reporters: ['depurador-de-adjuntos', 'html', 'verificador-de-informe'],
      conFallo: true,
    });

    expect(coincidencias).toEqual([]);
    expect(proceso.status).toBe(1);
  });

  it('no deja la contraseña en ningún archivo del informe ni de test-results con todos los tests en verde [ARR-02 AC-1]', () => {
    const { coincidencias, proceso } = correr({
      nombre: 'depurado-verde',
      reporters: ['depurador-de-adjuntos', 'html', 'verificador-de-informe'],
    });

    expect(coincidencias).toEqual([]);
    expect(proceso.status).toBe(0);
  });

  it('falla cerrado: el verificador borra el informe y los resultados y termina en error cuando queda un secreto', () => {
    const { coincidencias, proceso, informe, resultados, salida } = correr({
      nombre: 'sin-depurador',
      reporters: ['html', 'verificador-de-informe'],
    });

    expect(proceso.status).not.toBe(0);
    expect(existsSync(informe)).toBe(false);
    expect(existsSync(resultados)).toBe(false);
    expect(coincidencias).toEqual([]);
    expect(salida).toContain('verificador-de-informe');
    expect(salida).not.toContain(CONTRASENA);
  });
});
