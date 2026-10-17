import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { config, proxy } from '../../proxy';

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

  it('vigila solo /pacientes y deja /login y /api fuera del matcher', () => {
    expect(config.matcher).toEqual(['/pacientes/:path*']);
  });
});
