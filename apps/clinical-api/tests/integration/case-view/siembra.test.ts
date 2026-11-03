import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prepararSiembra, type ContextoDeSiembra } from '../../support/completitud.js';
import { sembrarPCaso } from '../../support/caso.js';
import { generadorDeIds } from '../../support/filas-sinteticas.js';
import { prepararMundoConSeed, type MundoDeGateway } from '../../support/gateway.js';

const ESPACIO_DE_IDS = 7401;

let mundo: MundoDeGateway;
let siembra: ContextoDeSiembra;

beforeAll(async () => {
  mundo = await prepararMundoConSeed('caso_siembra', ESPACIO_DE_IDS);
  siembra = await prepararSiembra(mundo.cliente, generadorDeIds(ESPACIO_DE_IDS + 500));
});
afterAll(() => mundo.cerrar());

async function contar(sql: string, patientId: string): Promise<number> {
  const { rows } = await mundo.cliente.query<{ n: number }>(sql, [patientId]);
  return rows[0]?.n ?? 0;
}

describe('siembra de FX-02b-a (P-CASO)', () => {
  it('deja en cada tabla las filas que describe FEAT-02b y ningún dato real', async () => {
    const p = await sembrarPCaso(siembra);
    const porPaciente = (tabla: string) =>
      contar(`SELECT count(*)::int AS n FROM clinical.${tabla} WHERE patient_id = $1`, p.patientId);

    expect(await porPaciente('document')).toBe(3);
    expect(await porPaciente('diagnosis')).toBe(1);
    expect(await porPaciente('prior_treatment')).toBe(2);
    expect(await porPaciente('exam')).toBe(3);
    expect(await porPaciente('clinical_event')).toBe(3);
    expect(await porPaciente('clinical_attribute')).toBe(2);
    expect(await porPaciente('ai_analysis_record')).toBe(2);
    expect(
      await contar(
        `SELECT count(*)::int AS n FROM clinical.biomarker b JOIN clinical.exam e ON e.id = b.exam_id WHERE e.patient_id = $1`,
        p.patientId,
      ),
    ).toBe(4);
    expect(
      await contar(
        `SELECT count(*)::int AS n FROM clinical.clinical_data_source WHERE data_id = ANY (SELECT b.id FROM clinical.biomarker b JOIN clinical.exam e ON e.id = b.exam_id WHERE e.patient_id = $1)`,
        p.patientId,
      ),
    ).toBe(1);
    expect(
      await contar(
        `SELECT count(*)::int AS n FROM clinical.patient WHERE id = $1 AND data_origin = 'sintetico'`,
        p.patientId,
      ),
    ).toBe(1);
  });

  it('siembra la toxicidad sin PII por defecto y con PII solo si se pide', async () => {
    const sinPii = await sembrarPCaso(siembra, { espacio: 7411 });
    const conPii = await sembrarPCaso(siembra, { espacio: 7412, conPiiEnLaToxicidad: true });
    const descripcion = async (id: string) =>
      (
        await mundo.cliente.query<{ description: string }>(
          'SELECT description FROM clinical.clinical_event WHERE id = $1',
          [id],
        )
      ).rows[0]?.description;

    expect(await descripcion(sinPii.filas.toxicidad)).toBe('Toxicidad cutánea grado 2');
    expect(await descripcion(conPii.filas.toxicidad)).toContain('Toxicidad cutánea grado 2 en ');
  });
});
