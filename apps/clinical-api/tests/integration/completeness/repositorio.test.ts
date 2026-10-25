import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createCompletenessRepository } from '../../../src/modules/completeness/completeness.repository.js';
import { prepararSiembra, sembrarFM2 } from '../../support/completitud.js';
import { conectar } from '../../support/db.js';
import { generadorDeIds } from '../../support/filas-sinteticas.js';

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
});
