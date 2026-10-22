import { Router } from 'express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { componerRutasProtegidas } from '../../../src/composition.js';
import {
  iniciarEscenarioDeDocumentos,
  montarDocumentos,
  type EscenarioDeDocumentos,
} from '../../support/documentos.js';
import {
  incoherencias,
  leerOperacionesDelContrato,
  operacionDeLaRuta,
  rutasMontadas,
} from '../../support/rutas-y-contrato.js';

const ESPACIO_DE_IDS = 569;
let escenario: EscenarioDeDocumentos;

beforeAll(async () => {
  escenario = await iniciarEscenarioDeDocumentos('doc_coherencia', ESPACIO_DE_IDS);
});
afterAll(() => escenario.cerrar());

describe('coherencia del módulo documents con el contrato [US-045 AC-3]', () => {
  it('monta POST /platform/patients/{patientId}/documents con authorize(documents:upload) y sin incoherencias', () => {
    const { rutas } = montarDocumentos(escenario.mundo);

    const montadas = rutasMontadas(rutas);
    const carga = montadas.find(
      (ruta) => ruta.metodo === 'post' && ruta.ruta === '/platform/patients/{patientId}/documents',
    );
    expect(carga?.permisos).toEqual(['documents:upload']);
    expect(operacionDeLaRuta(carga!, leerOperacionesDelContrato())?.operationId).toBe(
      'uploadDocument',
    );
    expect(incoherencias(rutas)).toEqual([]);
  });

  it('monta el router de documents después del gateway en las rutas protegidas', () => {
    const { rutas } = montarDocumentos(escenario.mundo);
    const gateway = Router();

    const patients = Router();

    const protegidas = componerRutasProtegidas({ gateway, documents: rutas[0]!, patients });

    expect(protegidas).toEqual([gateway, rutas[0], patients]);
  });
});
