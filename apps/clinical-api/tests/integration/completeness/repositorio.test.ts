import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createCompletenessRepository } from '../../../src/modules/completeness/completeness.repository.js';
import { prepararSiembra, sembrarFM2 } from '../../support/completitud.js';
import { conectar } from '../../support/db.js';
import {
  FECHA_FIJA,
  INSTANTE_FIJO,
  generadorDeIds,
  insertar,
} from '../../support/filas-sinteticas.js';

const ESPACIO_DE_IDS = 9410;
let cliente: Client;

beforeAll(async () => {
  cliente = await conectar(inject('urlBaseDeTest'));
});
afterAll(() => cliente.end());

describe('repositorio de completitud', () => {
  it('devuelve el biomarcador rechazado sin filtrarlo cuando lee los registros sin filtrar por revisión', async () => {
    const fm2 = await sembrarFM2(await prepararSiembra(cliente, generadorDeIds(ESPACIO_DE_IDS)));

    const { Biomarker: biomarcadores = [] } = await createCompletenessRepository(
      cliente,
    ).registrosSinFiltrarPorRevision(fm2.patientId, ['Biomarker']);

    const rechazados = biomarcadores.filter((registro) => registro.reviewStatus === 'rechazado');
    expect(rechazados.map((registro) => registro.columnas['name'])).toEqual([
      'Receptor de progesterona',
    ]);
  });

  it('rechaza Exam como entidad de destino cuando se pide, porque clinical.exam no tiene review_status', async () => {
    const fm2 = await sembrarFM2(
      await prepararSiembra(cliente, generadorDeIds(ESPACIO_DE_IDS + 1)),
    );

    const lectura = createCompletenessRepository(cliente).registrosSinFiltrarPorRevision(
      fm2.patientId,
      ['Exam'],
    );

    await expect(lectura).rejects.toThrow('entidad_de_destino_no_soportada Exam');
  });

  it('no trae description de los ClinicalEvent cuando los lee, aunque el texto libre tenga datos del paciente', async () => {
    const marcador = 'MARCADOR-DESCRIPCION-SINTETICA';
    const fm2 = await sembrarFM2(
      await prepararSiembra(cliente, generadorDeIds(ESPACIO_DE_IDS + 2)),
    );
    await insertar(cliente, 'clinical.clinical_event', {
      id: fm2.ids(),
      patient_id: fm2.patientId,
      episode_id: fm2.episodeId,
      event_type: 'evolucion',
      event_date: FECHA_FIJA,
      date_precision: 'dia',
      description: marcador,
      mapping_status: 'n_a',
      entry_method: 'seed',
      extraction_confidence: 'n_a',
      review_status: 'verificado',
      created_at: INSTANTE_FIJO,
    });

    const { ClinicalEvent: eventos = [] } = await createCompletenessRepository(
      cliente,
    ).registrosSinFiltrarPorRevision(fm2.patientId, ['ClinicalEvent']);

    expect(eventos).toHaveLength(1);
    expect(JSON.stringify(eventos)).not.toContain(marcador);
  });
});
