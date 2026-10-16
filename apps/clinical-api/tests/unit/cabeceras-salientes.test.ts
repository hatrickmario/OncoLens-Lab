import { describe, expect, it } from 'vitest';
import { construirCabecerasSalientes } from '../../src/infrastructure/rag-orchestrator.http.js';

describe('construirCabecerasSalientes', () => {
  it('añade Authorization Bearer con el token de servicio', () => {
    const cabeceras = construirCabecerasSalientes(new Headers(), 'token-de-servicio');

    expect(cabeceras.get('authorization')).toBe('Bearer token-de-servicio');
  });

  it('descarta Cookie y el resto de cabeceras entrantes cuando el llamador las pasa', () => {
    const entrantes = new Headers({
      Cookie: 'oncolens_session=sesion-sintetica',
      Origin: 'https://web.local',
      'X-Forwarded-For': '10.0.0.1',
    });

    const cabeceras = construirCabecerasSalientes(entrantes, 'token');

    expect([...cabeceras.keys()].sort()).toEqual(['authorization']);
  });

  it('sustituye el Authorization del llamador por el del firmador', () => {
    const entrantes = new Headers({ Authorization: 'Bearer ajeno' });

    expect(construirCabecerasSalientes(entrantes, 'propio').get('authorization')).toBe('Bearer propio');
  });

  it('conserva las cabeceras de la operación del SDK', () => {
    const entrantes = new Headers({
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'X-Request-Deadline': '2026-10-16T12:00:15.000Z',
      'X-Trace-Id': 'req_9a3f2c1b',
    });

    const cabeceras = construirCabecerasSalientes(entrantes, 'token');

    expect(cabeceras.get('content-type')).toBe('application/json');
    expect(cabeceras.get('accept')).toBe('application/json');
    expect(cabeceras.get('x-request-deadline')).toBe('2026-10-16T12:00:15.000Z');
    expect(cabeceras.get('x-trace-id')).toBe('req_9a3f2c1b');
  });

  it('omite X-Request-Deadline cuando el llamador no lo pasa', () => {
    expect(construirCabecerasSalientes(new Headers(), 'token').has('x-request-deadline')).toBe(false);
  });
});
