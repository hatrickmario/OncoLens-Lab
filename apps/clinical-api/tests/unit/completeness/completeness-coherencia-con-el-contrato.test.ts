import { Router } from 'express';
import { describe, expect, it } from 'vitest';
import { componerRutasProtegidas } from '../../../src/composition.js';
import { completenessController } from '../../../src/modules/completeness/completeness.controller.js';
import {
  incoherencias,
  leerOperacionesDelContrato,
  operacionDeLaRuta,
  rutasMontadas,
} from '../../support/rutas-y-contrato.js';

const router = completenessController({
  service: { calcular: () => Promise.reject(new Error('no se invoca')) },
  traceIds: { traceId: () => 'req_TestCoherencia' },
  registrar: () => undefined,
});

describe('coherencia del módulo completeness con el contrato', () => {
  it('monta GET /platform/patients/{patientId}/completeness con authorize(clinical:read) y sin incoherencias', () => {
    const montadas = rutasMontadas([router]);

    const consulta = montadas.find(
      (ruta) =>
        ruta.metodo === 'get' && ruta.ruta === '/platform/patients/{patientId}/completeness',
    );
    expect(consulta?.permisos).toEqual(['clinical:read']);
    expect(operacionDeLaRuta(consulta!, leerOperacionesDelContrato())?.operationId).toBe(
      'getCompleteness',
    );
    expect(incoherencias([router])).toEqual([]);
  });

  it('monta el router de completeness detrás del guard junto con los demás routers protegidos', () => {
    const [gateway, documents, patients] = [Router(), Router(), Router()];

    const protegidas = componerRutasProtegidas({
      gateway,
      documents,
      patients,
      completeness: router,
    });

    expect(protegidas).toContain(router);
  });
});
