import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * US-044 AC-3 (design D4b) contra el SERVIDOR REAL de Next, no contra un mock: tras `next build`, arranca el servidor
 * de producción (`next start` y el `server.js` standalone que usa la imagen) en un puerto efímero de localhost y
 * comprueba, desde un clinical-api falso en el borde HTTP, qué `X-Forwarded-For` recibe. Next solo escribe la IP del
 * socket cuando el cliente no envía la cabecera; el wrapper de `instrumentation.ts` la sustituye siempre.
 */

const raizWeb = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const raizMonorepo = path.resolve(raizWeb, '../..');
const credenciales = readFileSync(
  path.join(raizMonorepo, 'contracts/examples/login-request.json'),
  'utf8',
);
const ESPERA_MAXIMA_MS = 60_000;

let clinicalApiFalso: Server;
let urlClinicalApi = '';
let cabecerasRecibidas: IncomingHttpHeaders[] = [];

function puertoLibre(): Promise<number> {
  return new Promise((resolve, reject) => {
    const servidor = createServer();
    servidor.once('error', reject);
    servidor.listen(0, '127.0.0.1', () => {
      const { port } = servidor.address() as AddressInfo;
      servidor.close(() => resolve(port));
    });
  });
}

function entornoDeWeb(puerto: number): NodeJS.ProcessEnv {
  return {
    ...process.env,
    CLINICAL_API_URL: urlClinicalApi,
    WEB_ALLOWED_ORIGIN: `http://127.0.0.1:${puerto}`,
    WEB_UPSTREAM_TIMEOUT_MS: '5000',
    WEB_HOME_PATH: '/pacientes/00000000-0000-4000-8000-000000000001/analisis',
    NEXT_TELEMETRY_DISABLED: '1',
  };
}

async function esperarA(url: string): Promise<void> {
  const limite = Date.now() + ESPERA_MAXIMA_MS;
  while (Date.now() < limite) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // el servidor aún no escucha
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error('el servidor de web no arrancó a tiempo');
}

interface ServidorDeWeb {
  origen: string;
  proceso: ChildProcess;
}

async function arrancar(comando: 'next-start' | 'standalone'): Promise<ServidorDeWeb> {
  const puerto = await puertoLibre();
  const entorno = entornoDeWeb(puerto);
  const proceso =
    comando === 'next-start'
      ? spawn(
          path.join(raizMonorepo, 'node_modules/.bin/next'),
          ['start', '-p', String(puerto), '-H', '127.0.0.1'],
          { cwd: raizWeb, env: entorno, stdio: 'ignore' },
        )
      : spawn('node', [path.join(raizWeb, '.next/standalone/apps/web/server.js')], {
          cwd: path.join(raizWeb, '.next/standalone/apps/web'),
          env: { ...entorno, PORT: String(puerto), HOSTNAME: '127.0.0.1' },
          stdio: 'ignore',
        });
  const origen = `http://127.0.0.1:${puerto}`;
  await esperarA(`${origen}/api/health`);
  return { origen, proceso };
}

async function loginDesde(servidor: ServidorDeWeb, xForwardedFor: string | undefined) {
  cabecerasRecibidas = [];
  const respuesta = await fetch(`${servidor.origen}/api/auth/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: servidor.origen,
      ...(xForwardedFor !== undefined && { 'X-Forwarded-For': xForwardedFor }),
    },
    body: credenciales,
  });
  await respuesta.arrayBuffer();
  return { estado: respuesta.status, recibida: cabecerasRecibidas[0]?.['x-forwarded-for'] };
}

beforeAll(async () => {
  clinicalApiFalso = createServer((peticion, respuesta) => {
    cabecerasRecibidas.push(peticion.headers);
    respuesta.writeHead(204, {
      'Set-Cookie':
        'oncolens_session=tokenSinteticoSocket; Path=/; HttpOnly; Secure; SameSite=Strict',
    });
    respuesta.end();
  });
  await new Promise<void>((resolve) => clinicalApiFalso.listen(0, '127.0.0.1', resolve));
  urlClinicalApi = `http://127.0.0.1:${(clinicalApiFalso.address() as AddressInfo).port}`;
  execFileSync(path.join(raizMonorepo, 'node_modules/.bin/next'), ['build'], {
    cwd: raizWeb,
    env: entornoDeWeb(3000),
    stdio: 'pipe',
  });
}, 300_000);

afterAll(async () => {
  await new Promise<void>((resolve) => clinicalApiFalso.close(() => resolve()));
});

describe.each([
  ['next start', 'next-start'],
  ['server.js standalone', 'standalone'],
] as const)('servidor real de producción de web (%s)', (_nombre, comando) => {
  let servidor: ServidorDeWeb;

  beforeAll(async () => {
    servidor = await arrancar(comando);
  }, 120_000);

  afterAll(() => {
    servidor.proceso.kill('SIGTERM');
  });

  it('reenvía a clinical-api la IP del socket y descarta el X-Forwarded-For falsificado por el cliente [US-044 AC-3]', async () => {
    const falsificada = await loginDesde(servidor, '203.0.113.9');
    const lista = await loginDesde(servidor, '203.0.113.9, 198.51.100.7');

    expect(falsificada).toEqual({ estado: 204, recibida: '127.0.0.1' });
    expect(lista).toEqual({ estado: 204, recibida: '127.0.0.1' });
  }, 60_000);

  it('reenvía la IP del socket cuando el cliente no envía X-Forwarded-For [US-044 AC-3]', async () => {
    const sinCabecera = await loginDesde(servidor, undefined);

    expect(sinCabecera).toEqual({ estado: 204, recibida: '127.0.0.1' });
  }, 60_000);
});
