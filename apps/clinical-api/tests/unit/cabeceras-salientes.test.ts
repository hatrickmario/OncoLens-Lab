import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import YAML from 'yaml';
import {
  CABECERAS_DEL_CONTRATO,
  construirCabecerasSalientes,
} from '../../src/infrastructure/rag-orchestrator.http.js';

/** Nombres de todos los parámetros `in: header` del spec empaquetado de rag-orchestrator. */
function nombresDeCabecerasDelSpec(): string[] {
  const nombres = new Set<string>();
  const recorrer = (nodo: unknown): void => {
    if (Array.isArray(nodo)) return nodo.forEach(recorrer);
    if (nodo === null || typeof nodo !== 'object') return;
    const objeto = nodo as Record<string, unknown>;
    if (objeto['in'] === 'header' && typeof objeto['name'] === 'string')
      nombres.add(objeto['name']);
    Object.values(objeto).forEach(recorrer);
  };
  recorrer(
    YAML.parse(
      readFileSync(new URL('../../../rag-orchestrator/openapi.yaml', import.meta.url), 'utf8'),
    ),
  );
  return [...nombres];
}

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

    expect(construirCabecerasSalientes(entrantes, 'propio').get('authorization')).toBe(
      'Bearer propio',
    );
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

  it('conserva todo parámetro in: header del spec de rag-orchestrator y descarta cookie y origin [US-054 AC-4]', () => {
    const delSpec = nombresDeCabecerasDelSpec();
    expect(delSpec).toContain('X-Request-Deadline');
    const entrantes = new Headers({
      Cookie: 'oncolens_session=sesion-sintetica',
      Origin: 'https://web.local',
    });
    for (const nombre of delSpec) entrantes.set(nombre, 'valor');

    const cabeceras = construirCabecerasSalientes(entrantes, 'token');

    for (const nombre of delSpec) expect(cabeceras.get(nombre)).toBe('valor');
    expect(cabeceras.has('cookie')).toBe(false);
    expect(cabeceras.has('origin')).toBe(false);
  });

  it('refleja exactamente los parámetros in: header del spec en CABECERAS_DEL_CONTRATO [US-054 AC-4]', () => {
    const delSpec = nombresDeCabecerasDelSpec().map((nombre) => nombre.toLowerCase());

    expect([...CABECERAS_DEL_CONTRATO].sort()).toEqual(delSpec.sort());
  });

  it('omite X-Request-Deadline cuando el llamador no lo pasa', () => {
    expect(construirCabecerasSalientes(new Headers(), 'token').has('x-request-deadline')).toBe(
      false,
    );
  });
});
