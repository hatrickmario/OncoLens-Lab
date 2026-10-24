import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { conectar } from '../../support/db.js';
import { generadorDeIds } from '../../support/filas-sinteticas.js';
import {
  prepararSiembra,
  sembrarFM1,
  sembrarFM2,
  sembrarFM3,
  sembrarFP1,
} from '../../support/completitud.js';

const ESPACIO_DE_IDS = 9400;
let cliente: Client;

beforeAll(async () => {
  cliente = await conectar(inject('urlBaseDeTest'));
});
afterAll(() => cliente.end());

async function contar(sql: string, patientId: string): Promise<number> {
  const { rows } = await cliente.query<{ n: number }>(sql, [patientId]);
  return rows[0]?.n ?? 0;
}

describe('siembra de FX-04-b', () => {
  it('siembra F-M1, F-M2, F-M3 y F-P1 sintéticos con sus registros cuando se invoca', async () => {
    const contexto = await prepararSiembra(cliente, generadorDeIds(ESPACIO_DE_IDS));

    const fm1 = await sembrarFM1(contexto);
    const fm2 = await sembrarFM2(contexto);
    const fm3 = await sembrarFM3(contexto);
    const fp1 = await sembrarFP1(contexto);

    const biomarcadores = `SELECT count(*)::int AS n FROM clinical.biomarker b
      JOIN clinical.exam e ON e.id = b.exam_id WHERE e.patient_id = $1`;
    expect(await contar(biomarcadores, fm1.patientId)).toBe(4);
    expect(await contar(biomarcadores, fm2.patientId)).toBe(4);
    expect(await contar(biomarcadores, fm3.patientId)).toBe(3);
    expect(await contar(biomarcadores, fp1.patientId)).toBe(3);
    expect(
      await contar(
        'SELECT count(*)::int AS n FROM clinical.clinical_note WHERE patient_id = $1',
        fm2.patientId,
      ),
    ).toBe(1);
    const { rows } = await cliente.query<{ data_origin: string }>(
      'SELECT data_origin FROM clinical.patient WHERE id = ANY($1)',
      [[fm1.patientId, fm2.patientId, fm3.patientId, fp1.patientId]],
    );
    expect(rows.map((fila) => fila.data_origin)).toEqual([
      'sintetico',
      'sintetico',
      'sintetico',
      'sintetico',
    ]);
  });
});
