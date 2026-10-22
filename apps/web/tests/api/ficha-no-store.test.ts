import { NextRequest } from 'next/server';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { proxy } from '../../proxy';
import { obtenerFicha } from '../../lib/server/pacientes';
import { crearDependenciasDeTest } from '../support/clinical-api-simulado';
import { crearFichaSimulada, fichaDelDoctor, ID_DE_FICHA } from '../support/ficha-simulado';

const clinicalApi = crearFichaSimulada();

describe('ficha del paciente sin caché', () => {
  beforeAll(clinicalApi.iniciar);
  afterAll(clinicalApi.detener);
  afterEach(clinicalApi.reiniciar);

  it('responde Cache-Control: no-store en la página de la ficha cuando hay sesión [US-051 AC-1]', () => {
    const respuesta = proxy(
      new NextRequest(`http://web.test:3000/pacientes/${ID_DE_FICHA}`, {
        headers: { cookie: 'oncolens_session=sesion-sintetica-1' },
      }),
    );

    expect(respuesta.headers.get('cache-control')).toBe('no-store');
  });

  it('lee la ficha con cache: no-store y solo la cookie de sesión [US-051 AC-1]', async () => {
    clinicalApi.responder({ status: 200, cuerpo: fichaDelDoctor });
    const opciones: Array<RequestInit | undefined> = [];
    const { dependencias } = crearDependenciasDeTest({
      fetch: (entrada, init) => {
        opciones.push(init);
        return globalThis.fetch(entrada, init);
      },
    });

    await obtenerFicha('otra=x; oncolens_session=sesion-sintetica-1', ID_DE_FICHA, dependencias);

    expect(opciones[0]?.cache).toBe('no-store');
    expect(clinicalApi.peticiones[0]!.cookie).toBe('oncolens_session=sesion-sintetica-1');
  });
});
