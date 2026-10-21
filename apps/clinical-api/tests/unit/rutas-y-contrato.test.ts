import { Router } from 'express';
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
});
