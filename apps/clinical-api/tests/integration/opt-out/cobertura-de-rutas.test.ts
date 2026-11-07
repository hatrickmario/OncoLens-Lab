import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RUTAS_GENERA_IA } from '../../../src/modules/opt-outs/rutas-genera-ia.js';
import {
  operacionesConGuardia,
  operacionesGeneraIADelSpec,
  operacionesGeneraIASinGuardia,
} from '../../support/cobertura-genera-ia.js';
import {
  montarGateway,
  prepararMundoConSeed,
  type GatewayDeTest,
  type MundoDeGateway,
} from '../../support/gateway.js';

const ESPACIO_DE_IDS = 8132;
/** DEC-22: la lista cerrada de operaciones que generan con IA en el MVP. */
const LISTA_DE_DEC_22 = ['createConversationTurn', 'createEvidenceAnalysis', 'createFollowUp'];

let mundo: MundoDeGateway;
let gateway: GatewayDeTest;

beforeAll(async () => {
  mundo = await prepararMundoConSeed('opt_out_cobertura', ESPACIO_DE_IDS);
  gateway = await montarGateway(mundo);
});
afterAll(() => mundo.cerrar());

describe('cobertura de las rutas generaIA en los routers de producción', () => {
  it('coinciden las operaciones con x-genera-ia, RUTAS_GENERA_IA y las rutas con guardia en la lista de DEC-22 [US-148 AC-3]', () => {
    const delContrato = operacionesGeneraIADelSpec();
    const delRegistro = RUTAS_GENERA_IA.map((ruta) => ruta.operationId).sort();
    const montadasConGuardia = operacionesConGuardia(gateway.rutas);

    expect(delContrato).toEqual(LISTA_DE_DEC_22);
    expect(delRegistro).toEqual(LISTA_DE_DEC_22);
    expect(montadasConGuardia).toEqual(LISTA_DE_DEC_22);
  });

  it('no deja ninguna operación x-genera-ia sin el guardia en las rutas montadas [US-148 AC-3]', () => {
    expect(operacionesGeneraIASinGuardia(gateway.rutas)).toEqual([]);
  });
});
