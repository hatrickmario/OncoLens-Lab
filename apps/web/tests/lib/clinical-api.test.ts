import { describe, expect, it } from 'vitest';
import {
  cabeceraCookieDeSesion,
  cabecerasHaciaClinicalApi,
  cabecerasHaciaNavegador,
  crearFetchJsonHaciaClinicalApi,
} from '../../lib/server/clinical-api';

function conCookie(valor: string | null): Request {
  return new Request('http://web.test:3000/api/evidence-analyses', {
    method: 'POST',
    headers: valor === null ? {} : { Cookie: valor },
  });
}

describe('cabeceraCookieDeSesion', () => {
  it('devuelve solo la cookie oncolens_session cuando el navegador envía más cookies', () => {
    expect(cabeceraCookieDeSesion(conCookie('a=1; oncolens_session=abc; b=2'))).toBe(
      'oncolens_session=abc',
    );
  });

  it('devuelve undefined cuando no hay cookie de sesión', () => {
    expect(cabeceraCookieDeSesion(conCookie('a=1'))).toBeUndefined();
    expect(cabeceraCookieDeSesion(conCookie(null))).toBeUndefined();
  });

  it('no confunde una cookie ajena cuyo nombre termina igual', () => {
    expect(cabeceraCookieDeSesion(conCookie('x_oncolens_session=zzz'))).toBeUndefined();
  });
});

describe('cabecerasHaciaClinicalApi', () => {
  it('contiene solo Content-Type y la cookie de sesión', () => {
    const cabeceras = cabecerasHaciaClinicalApi('oncolens_session=abc');

    expect([...cabeceras.keys()].sort()).toEqual(['content-type', 'cookie']);
  });

  it('omite Cookie cuando no hay sesión', () => {
    expect([...cabecerasHaciaClinicalApi(undefined).keys()]).toEqual(['content-type']);
  });
});

describe('cabecerasHaciaNavegador', () => {
  it('conserva Content-Type, Retry-After y X-Trace-Id, marca no-store y descarta Set-Cookie y cabeceras internas', () => {
    const upstream = new Response('{}', {
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': '30',
        'X-Trace-Id': 'req_1',
        'Set-Cookie': 'a=b',
        Server: 'interno',
        Location: '/login',
      },
    });

    expect([...cabecerasHaciaNavegador(upstream).entries()].sort()).toEqual([
      ['cache-control', 'no-store'],
      ['content-type', 'application/json'],
      ['retry-after', '30'],
      ['x-trace-id', 'req_1'],
    ]);
  });
});

describe('crearFetchJsonHaciaClinicalApi', () => {
  it('envía siempre Content-Type application/json y el cuerpo como texto aunque la petición traiga otro tipo', async () => {
    let recibido: { url: string; init: RequestInit | undefined } | undefined;
    const fetchFalso: typeof globalThis.fetch = (url, init) => {
      recibido = { url: String(url), init };
      return Promise.resolve(new Response('{}'));
    };
    const enviar = crearFetchJsonHaciaClinicalApi({
      fetch: fetchFalso,
      timeoutMs: 1000,
      cookieDeSesion: 'oncolens_session=abc',
    });

    await enviar(
      new Request('http://clinical-api.test:3000/x', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: '{"a":1}',
      }),
    );

    const cabeceras = new Headers(recibido?.init?.headers);
    expect(cabeceras.get('content-type')).toBe('application/json');
    expect(cabeceras.get('cookie')).toBe('oncolens_session=abc');
    expect(recibido?.init?.body).toBe('{"a":1}');
  });
});
