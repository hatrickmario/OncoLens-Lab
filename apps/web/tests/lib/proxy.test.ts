import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { config, crearProxy, proxy } from '../../proxy';

const ID_PACIENTE = '00000000-0000-4000-8000-000000000001';
const URL_ANALISIS = `http://localhost:3000/pacientes/${ID_PACIENTE}/analisis`;

function peticion(cookie?: string) {
  return new NextRequest(URL_ANALISIS, cookie === undefined ? {} : { headers: { cookie } });
}

describe('proxy (guard de páginas, design D8)', () => {
  it('redirige a /login sin cuerpo ni datos del paciente cuando se abre /pacientes/[id]/analisis sin cookie [US-211 AC-4]', async () => {
    const respuesta = proxy(peticion());

    expect(respuesta.status).toBe(307);
    expect(new URL(respuesta.headers.get('location') ?? '').pathname).toBe('/login');
    expect(await respuesta.text()).toBe('');
  });

  it('no copia el id del paciente a la URL de /login (privacidad: nada del paciente en query strings)', () => {
    const destino = new URL(proxy(peticion()).headers.get('location') ?? '');

    expect(destino.search).toBe('');
    expect(destino.href).not.toContain(ID_PACIENTE);
  });

  it('deja pasar la petición cuando trae la cookie de sesión', () => {
    const respuesta = proxy(peticion('oncolens_session=opaca'));

    expect(respuesta.headers.get('x-middleware-next')).toBe('1');
    expect(respuesta.headers.get('location')).toBeNull();
  });

  it('redirige cuando la cookie presente no es la de sesión', () => {
    expect(proxy(peticion('otra=1')).status).toBe(307);
  });

  it('redirige cuando la cookie de sesión viene vacía', () => {
    expect(proxy(peticion('oncolens_session=')).status).toBe(307);
  });

  it('conserva no-store en /pacientes cuando hay sesión', () => {
    expect(proxy(peticion('oncolens_session=opaca')).headers.get('cache-control')).toBe('no-store');
  });
});

const NONCE = 'bm9uY2UtY29uZ2VsYWRv';
const proxyConNonce = crearProxy({
  generarNonce: () => NONCE,
  entorno: { NODE_ENV: 'production' },
});

function pedir(ruta: string) {
  return new NextRequest(`http://localhost:3000${ruta}`);
}

describe('proxy con CSP (design D1)', () => {
  it('pone la CSP con el nonce en la respuesta de /login [US-216 AC-1]', () => {
    const csp = proxyConNonce(pedir('/login')).headers.get('content-security-policy') ?? '';

    expect(csp).toContain(`'nonce-${NONCE}'`);
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it('pasa el nonce y la CSP en la cabecera de request para que Next los aplique [US-216 AC-1]', () => {
    const respuesta = proxyConNonce(pedir('/login'));

    expect(respuesta.headers.get('x-middleware-request-x-nonce')).toBe(NONCE);
    expect(respuesta.headers.get('x-middleware-request-content-security-policy')).toContain(NONCE);
  });

  it('cubre los Route Handlers sin exigir sesión ni poner no-store [US-216 AC-1]', () => {
    const respuesta = proxyConNonce(pedir('/api/patients/1/case'));

    expect(respuesta.headers.get('content-security-policy')).toContain(NONCE);
    expect(respuesta.headers.get('cache-control')).toBeNull();
  });

  it('sigue redirigiendo /pacientes sin cookie a /login con no-store [US-216 AC-1] [RN-10]', () => {
    const respuesta = proxyConNonce(pedir('/pacientes/abc'));

    expect(respuesta.status).toBe(307);
    expect(new URL(respuesta.headers.get('location') ?? '').pathname).toBe('/login');
    expect(respuesta.headers.get('cache-control')).toBe('no-store');
  });

  it('excluye de la CSP dinámica solo los estáticos de Next y el icono [US-216 AC-1]', () => {
    const [patron] = config.matcher;
    const regex = new RegExp(`^${patron}$`);

    expect(regex.test('/login')).toBe(true);
    expect(regex.test('/api/auth/login')).toBe(true);
    expect(regex.test('/_next/static/chunks/a.js')).toBe(false);
    expect(regex.test('/icon.svg')).toBe(false);
  });
});
