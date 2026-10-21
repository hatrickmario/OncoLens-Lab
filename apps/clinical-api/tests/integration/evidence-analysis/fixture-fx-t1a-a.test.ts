import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createEvidenceAnalysisRepository } from '../../../src/modules/evidence-analysis/evidence-analysis.repository.js';
import { insertarFxT1aA, type FilasDeFxT1aA } from '../../support/filas-sinteticas.js';
import { idDePaciente, prepararMundoConSeed, type MundoDeGateway } from '../../support/gateway.js';

const ESPACIO_DE_IDS = 661;

let mundo: MundoDeGateway;
let filas: FilasDeFxT1aA;

beforeAll(async () => {
  mundo = await prepararMundoConSeed('fx_t1a_a', ESPACIO_DE_IDS);
  filas = await insertarFxT1aA(mundo.cliente, mundo.ids, idDePaciente('a'));
});
afterAll(async () => {
  await mundo.cerrar();
});

describe('FX-T1a-a (fixture del paciente semilla con datos por revisar)', () => {
  it('deja el Ki-67 por revisar y el receptor de estrógeno en conflicto con el del seed, y no lee los receptores de progesterona rechazado ni reemplazado', async () => {
    const caso = await createEvidenceAnalysisRepository(mundo.cliente).leerCaso(idDePaciente('a'));

    const porId = new Map(caso!.biomarcadores.map((fila) => [fila.id, fila]));
    expect(porId.get(filas.ki67Id)).toMatchObject({
      value: '20 %',
      reviewStatus: 'requiere_revision',
      conflictsWithId: null,
    });
    expect(porId.get(filas.receptorEstrogenoEnConflictoId)).toMatchObject({
      value: '90 %',
      reviewStatus: 'requiere_revision',
      conflictsWithId: filas.receptorEstrogenoDelSeedId,
    });
    expect(porId.has(filas.progesteronaRechazadaId)).toBe(false);
    expect(porId.has(filas.progesteronaReemplazadaId)).toBe(false);
  });
});
