import { createServer, request, Server, type IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { CABECERA_IP_DEL_SOCKET, leerIpFirmada } from '../../lib/server/cabecera-ip-del-socket';
import { fijarIpDelSocket } from '../../lib/server/fijar-ip-del-socket';

/** Servidor `node:http` real en un puerto efímero de localhost: el oyente devuelve el X-Forwarded-For que ve. */
let servidor: Server;
let puerto = 0;
let oyentesDeRequest = 0;

/** La IP que `ipDelCliente()` extraería: la firmada por el wrapper, o `ausente`. */
function ver(peticion: IncomingMessage): string {
  const valor = peticion.headers[CABECERA_IP_DEL_SOCKET];
  return leerIpFirmada(typeof valor === 'string' ? valor : null) ?? 'ausente';
}

function pedir(cabeceras: Record<string, string>): Promise<string> {
  return new Promise((resolve, reject) => {
    const salida = request({ host: '127.0.0.1', port: puerto, headers: cabeceras }, (respuesta) => {
      let cuerpo = '';
      respuesta.on('data', (trozo: Buffer) => (cuerpo += trozo.toString()));
      respuesta.on('end', () => resolve(cuerpo));
    });
    salida.on('error', reject);
    salida.end();
  });
}

beforeAll(async () => {
  fijarIpDelSocket();
  servidor = createServer((peticion, respuesta) => {
    oyentesDeRequest += 1;
    respuesta.end(ver(peticion));
  });
  await new Promise<void>((resolve) => servidor.listen(0, '127.0.0.1', resolve));
  puerto = (servidor.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((resolve) => servidor.close(() => resolve()));
});

describe('fijarIpDelSocket', () => {
  it('entrega al oyente la IP del socket cuando el cliente no envía X-Forwarded-For', async () => {
    expect(await pedir({})).toBe('127.0.0.1');
  });

  it('ignora el X-Forwarded-For del cliente y entrega la IP del socket', async () => {
    expect(await pedir({ 'X-Forwarded-For': '203.0.113.9' })).toBe('127.0.0.1');
    expect(await pedir({ 'X-Forwarded-For': '203.0.113.9, 198.51.100.7' })).toBe('127.0.0.1');
  });

  it('pisa una cabecera de IP firmada que el cliente envíe con la IP del socket', async () => {
    expect(await pedir({ [CABECERA_IP_DEL_SOCKET]: 'secreto-adivinado|203.0.113.66' })).toBe(
      '127.0.0.1',
    );
  });

  it('no envuelve el evento por segunda vez cuando se instala de nuevo', async () => {
    const antes = Server.prototype.emit;

    fijarIpDelSocket();

    expect(Server.prototype.emit).toBe(antes);
    expect(await pedir({ 'X-Forwarded-For': '203.0.113.9' })).toBe('127.0.0.1');
  });

  it('sigue entregando cada petición una sola vez al oyente', async () => {
    const antes = oyentesDeRequest;

    await pedir({});

    expect(oyentesDeRequest).toBe(antes + 1);
  });
});
