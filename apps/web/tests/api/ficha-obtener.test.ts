import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { obtenerFicha } from '../../lib/server/pacientes';
import { crearDependenciasDeTest } from '../support/clinical-api-simulado';
import {
  crearFichaSimulada,
  errorInterno,
  errorNoEncontrado,
  fichaDelDoctor,
  ID_DE_FICHA,
} from '../support/ficha-simulado';

const clinicalApi = crearFichaSimulada();
const COOKIE = 'oncolens_session=sesion-sintetica-1';

describe('obtenerFicha', () => {
  beforeAll(clinicalApi.iniciar);
  afterAll(clinicalApi.detener);
  afterEach(clinicalApi.reiniciar);

  it('devuelve error con el traceId generado por web cuando el fetch lanza [US-051 AC-2]', async () => {
    const { dependencias } = crearDependenciasDeTest({
      fetch: () => Promise.reject(new Error('red caída')),
    });

    const resultado = await obtenerFicha(COOKIE, ID_DE_FICHA, dependencias);

    expect(resultado).toEqual({ tipo: 'error', traceId: 'req_web00001' });
  });

  it('devuelve error con su traceId cuando un 200 viola el contrato [US-051 AC-2]', async () => {
    clinicalApi.responder({ status: 200, cuerpo: { view: 'doctor', id: 'no-es-uuid' } });
    const { dependencias } = crearDependenciasDeTest();

    const resultado = await obtenerFicha(COOKIE, ID_DE_FICHA, dependencias);

    expect(resultado.tipo).toBe('error');
  });

  it.each([
    ['200', 200, fichaDelDoctor],
    ['404', 404, errorNoEncontrado],
    ['500', 500, errorInterno],
  ])(
    'registra la línea patients.ficha sin el id ni la identidad cuando responde %s [US-046 AC-4]',
    async (_nombre, status, cuerpo) => {
      clinicalApi.responder({ status, cuerpo });
      const { dependencias, lineas } = crearDependenciasDeTest();

      await obtenerFicha(COOKIE, ID_DE_FICHA, dependencias);

      const texto = JSON.stringify(lineas);
      expect(lineas.filter((l) => l.event === 'patients.ficha')).toHaveLength(1);
      for (const prohibido of [
        ID_DE_FICHA,
        'Prueba Sintética',
        'SINT-0000001',
        'sesion-sintetica',
      ]) {
        expect(texto).not.toContain(prohibido);
      }
    },
  );
});
