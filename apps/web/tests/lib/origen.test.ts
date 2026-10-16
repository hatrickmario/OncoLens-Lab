import { describe, expect, it } from 'vitest';
import type { LineaDeRegistro } from '../../lib/server/registro';
import { verificarOrigen } from '../../lib/server/origen';

function dependencias(lineas: LineaDeRegistro[]) {
  return {
    config: { allowedOrigin: 'http://web.test:3000' },
    nuevoTraceId: () => 'req_web00001',
    registrar: (linea: LineaDeRegistro) => lineas.push(linea),
    evento: 'auth.login',
  };
}

function conOrigen(origen: string | null): Request {
  return new Request('http://web.test:3000/api/x', {
    method: 'POST',
    headers: origen === null ? {} : { Origin: origen },
  });
}

describe('verificarOrigen', () => {
  it('devuelve null y no registra nada cuando el Origin coincide exactamente', () => {
    const lineas: LineaDeRegistro[] = [];

    expect(verificarOrigen(conOrigen('http://web.test:3000'), dependencias(lineas))).toBeNull();
    expect(lineas).toEqual([]);
  });

  it('registra el evento recibido de quien lo llama cuando rechaza el Origin', async () => {
    const lineas: LineaDeRegistro[] = [];

    const respuesta = verificarOrigen(conOrigen('https://otro.test'), dependencias(lineas));

    expect(respuesta?.status).toBe(403);
    expect(lineas).toEqual([
      { event: 'auth.login', status: 403, traceId: 'req_web00001', motivo: 'origen' },
    ]);
  });

  it('rechaza un Origin que solo comparte el prefijo con el permitido', () => {
    expect(
      verificarOrigen(conOrigen('http://web.test:3000.evil.test'), dependencias([]))?.status,
    ).toBe(403);
  });
});
