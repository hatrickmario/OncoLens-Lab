import express, { Router } from 'express';
import { describe, expect, it } from 'vitest';
import { authorize } from '../../src/middleware/authorize.js';
import { incoherencias } from '../support/rutas-y-contrato.js';

describe('incoherencias (verificador de rutas contra el contrato)', () => {
  it('nombra el operationId de la ruta montada sin authorize() [US-045 AC-3]', () => {
    const router = Router();
    router.post('/evidence-analyses', (_peticion, respuesta) => {
      respuesta.sendStatus(204);
    });

    expect(incoherencias([router])).toEqual([
      'createEvidenceAnalysis: ruta montada sin authorize()',
    ]);
  });

  it('señala la ruta montada que no existe en el contrato', () => {
    const router = Router();
    router.get('/ruta-inventada', (_peticion, respuesta) => {
      respuesta.sendStatus(204);
    });

    expect(incoherencias([router])).toEqual([
      'GET /platform/ruta-inventada: ruta montada sin operación en openapi.yaml',
    ]);
  });

  it('no reporta nada cuando la ruta monta authorize() con el x-permission de su operación', () => {
    const router = Router();
    router.post('/evidence-analyses', authorize('ai_analysis:create'), (_peticion, respuesta) => {
      respuesta.sendStatus(204);
    });

    expect(incoherencias([router])).toEqual([]);
  });

  it('reporta la diferencia cuando authorize() lleva otros códigos que el x-permission', () => {
    const router = Router();
    router.post('/evidence-analyses', authorize('clinical:read'), (_peticion, respuesta) => {
      respuesta.sendStatus(204);
    });

    expect(incoherencias([router])).toEqual([
      'createEvidenceAnalysis: authorize(clinical:read) no coincide con x-permission [ai_analysis:create]',
    ]);
  });

  it('reporta el router anidado en vez de omitirlo cuando se monta con use()', () => {
    const hijo = Router();
    hijo.post('/evidence-analyses', (_peticion, respuesta) => {
      respuesta.sendStatus(204);
    });
    const padre = Router();
    padre.use(hijo);

    expect(incoherencias([padre])).toEqual([
      'ruta anidada no verificable: los routers protegidos montan rutas planas',
    ]);
  });

  it('reporta el middleware montado con ruta en vez de omitirlo', () => {
    const router = Router();
    router.use('/evidence-analyses', (_peticion, respuesta) => {
      respuesta.sendStatus(204);
    });

    expect(incoherencias([router])).toEqual([
      'middleware montado con ruta no verificable: los routers protegidos montan rutas planas',
    ]);
  });

  it('acepta un middleware global sin ruta (por ejemplo el traceId) en el router', () => {
    const router = Router();
    router.use((_peticion, _respuesta, siguiente) => {
      siguiente();
    });
    router.post('/evidence-analyses', authorize('ai_analysis:create'), (_peticion, respuesta) => {
      respuesta.sendStatus(204);
    });

    expect(incoherencias([router])).toEqual([]);
  });

  it('reporta authorize() colocado después de un parser de cuerpo', () => {
    const router = Router();
    router.post(
      '/evidence-analyses',
      express.json(),
      authorize('ai_analysis:create'),
      (_peticion, respuesta) => {
        respuesta.sendStatus(204);
      },
    );

    expect(incoherencias([router])).toEqual([
      'createEvidenceAnalysis: authorize() debe ir antes de cualquier parser de cuerpo (jsonParser)',
    ]);
  });

  it('avisa del parser de cuerpo montado a nivel de router aunque la ruta tenga authorize()', () => {
    const router = Router();
    router.use(express.json());
    router.post('/evidence-analyses', authorize('ai_analysis:create'), (_peticion, respuesta) => {
      respuesta.sendStatus(204);
    });

    expect(incoherencias([router])).toEqual([
      'parser de cuerpo a nivel de router: monte el parser por ruta, después de authorize()',
    ]);
  });

  it('avisa del parser de cuerpo montado con use("/") a nivel de router', () => {
    const router = Router();
    router.use('/', express.urlencoded());
    router.post('/evidence-analyses', authorize('ai_analysis:create'), (_peticion, respuesta) => {
      respuesta.sendStatus(204);
    });

    expect(incoherencias([router])).toEqual([
      'parser de cuerpo a nivel de router: monte el parser por ruta, después de authorize()',
    ]);
  });

  it('no avisa de un middleware global que no es un parser de cuerpo', () => {
    const router = Router();
    router.use((_peticion, _respuesta, siguiente) => {
      siguiente();
    });
    router.post('/evidence-analyses', authorize('ai_analysis:create'), (_peticion, respuesta) => {
      respuesta.sendStatus(204);
    });

    expect(incoherencias([router])).toEqual([]);
  });
});
