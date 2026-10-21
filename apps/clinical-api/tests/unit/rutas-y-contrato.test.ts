import { Router } from 'express';
import { describe, expect, it } from 'vitest';
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
});
