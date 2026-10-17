import { describe, expect, it } from 'vitest';
import { crearRegistrador } from '../../src/infrastructure/logger.js';

function registrarYLeer(linea: Record<string, unknown>): Record<string, unknown> {
  const salida: string[] = [];
  crearRegistrador((texto) => salida.push(texto))(linea);
  return JSON.parse(salida[0] ?? '{}') as Record<string, unknown>;
}

describe('crearRegistrador', () => {
  it('escribe una línea JSON con los campos tal cual cuando no hay campos sensibles', () => {
    expect(registrarYLeer({ event: 'auth.login', resultado: 'ok', traceId: 'req_1' })).toEqual({
      event: 'auth.login',
      resultado: 'ok',
      traceId: 'req_1',
    });
  });

  it.each(['password', 'cookie', 'set-cookie', 'authorization'])('redacta el campo %s', (campo) => {
    expect(registrarYLeer({ [campo]: 'valor-secreto' })).toEqual({ [campo]: '[REDACTADO]' });
  });

  it('redacta sin distinguir mayúsculas y en objetos anidados', () => {
    const linea = registrarYLeer({
      req: { headers: { Cookie: 'oncolens_session=abc', Authorization: 'Bearer x', host: 'h' } },
      res: { headers: { 'Set-Cookie': ['oncolens_session=abc'] } },
      body: { Password: 'p', email: 'a@b' },
    });

    expect(JSON.stringify(linea)).not.toMatch(/abc|Bearer x|"p"/);
    expect(linea).toMatchObject({ req: { headers: { host: 'h' } }, body: { email: 'a@b' } });
  });

  it('redacta dentro de arreglos', () => {
    const linea = registrarYLeer({ intentos: [{ password: 'p1' }, { password: 'p2' }] });

    expect(JSON.stringify(linea)).not.toMatch(/p1|p2/);
  });
});
