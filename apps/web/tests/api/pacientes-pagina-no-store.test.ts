import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { proxy } from '../../proxy';

describe('proxy de /pacientes', () => {
  it('responde Cache-Control: no-store en la página cuando hay sesión [US-048 AC-5]', () => {
    const respuesta = proxy(
      new NextRequest('http://web.test:3000/pacientes', {
        headers: { cookie: 'oncolens_session=sesion-sintetica-1' },
      }),
    );

    expect(respuesta.headers.get('cache-control')).toBe('no-store');
  });
});
