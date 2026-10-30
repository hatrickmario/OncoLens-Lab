import type { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import type { Consultador } from '../../../src/modules/auth/auth.repository.js';
import { componerCompletitud } from '../../../src/modules/completeness/completeness.module.js';
import {
  RUTA_CATALOGO_TEST_1_0_0,
  TIPOS_HABILITADOS_DE_TEST,
  leerTexto,
  piiSinteticaDeFM2,
  prepararSiembra,
  sembrarBiomarcador,
  sembrarFM2,
} from '../../support/completitud.js';
import { capturarSalidas } from '../../support/captura-de-salidas.js';
import { conectar } from '../../support/db.js';
import { generadorDeIds } from '../../support/filas-sinteticas.js';

const ESPACIO_DE_IDS = 9402;
let cliente: Client;

beforeAll(async () => {
  cliente = await conectar(inject('urlBaseDeTest'));
});
afterAll(() => cliente.end());

/** Consultador que anota el SQL que recibe y delega en la base real. */
function consultadorQueAnota(): { db: Consultador; sentencias: string[]; filas: unknown[] } {
  const sentencias: string[] = [];
  const filas: unknown[] = [];
  return {
    sentencias,
    filas,
    db: {
      query: async (sql, valores) => {
        sentencias.push(sql);
        const resultado = await cliente.query(sql, valores);
        filas.push(...resultado.rows);
        return resultado;
      },
    },
  };
}

describe('no-fuga del checklist', () => {
  it('no escribe valores clínicos ni la PII de la nota en ninguna salida cuando calcula F-M2 [US-002 AC-2]', async () => {
    const fm2 = await sembrarFM2(await prepararSiembra(cliente, generadorDeIds(ESPACIO_DE_IDS)));
    const servicio = componerCompletitud({
      db: cliente,
      rutaDelCatalogo: RUTA_CATALOGO_TEST_1_0_0,
      leerArchivo: leerTexto,
      tiposHabilitados: TIPOS_HABILITADOS_DE_TEST,
    });
    let checklist = '';

    const salidas = await capturarSalidas(async () => {
      checklist = JSON.stringify(await servicio.calcular(fm2.patientId));
    });

    const pii = piiSinteticaDeFM2();
    for (const secreto of [pii.nombre, pii.documento, 'letrozol', 'Positivo', 'carcinoma']) {
      expect(salidas).not.toContain(secreto);
      expect(checklist).not.toContain(secreto);
    }
  });

  it('nunca lee identidad ni notas clínicas cuando calcula el checklist', async () => {
    const fm2 = await sembrarFM2(
      await prepararSiembra(cliente, generadorDeIds(ESPACIO_DE_IDS + 1)),
    );
    const { db, sentencias } = consultadorQueAnota();
    const servicio = componerCompletitud({
      db,
      rutaDelCatalogo: RUTA_CATALOGO_TEST_1_0_0,
      leerArchivo: leerTexto,
      tiposHabilitados: TIPOS_HABILITADOS_DE_TEST,
    });

    await servicio.calcular(fm2.patientId);

    expect(sentencias.length).toBeGreaterThan(0);
    for (const sql of sentencias) {
      expect(sql).not.toMatch(/identity|clinical_note|full_name|national_id/i);
    }
  });

  it('no trae de la base columnas fuera de la allowlist, como source_span, cuando lee los biomarcadores', async () => {
    const marcador = 'MARCADOR-SPAN-SINTETICO';
    const fm2 = await sembrarFM2(
      await prepararSiembra(cliente, generadorDeIds(ESPACIO_DE_IDS + 2)),
    );
    await sembrarBiomarcador(fm2, {
      name: 'HER2',
      value: '2+ (IHQ)',
      reviewStatus: 'verificado',
      sourceSpan: JSON.stringify({ texto: marcador }),
    });
    const { db, sentencias, filas } = consultadorQueAnota();
    const servicio = componerCompletitud({
      db,
      rutaDelCatalogo: RUTA_CATALOGO_TEST_1_0_0,
      leerArchivo: leerTexto,
      tiposHabilitados: TIPOS_HABILITADOS_DE_TEST,
    });

    await servicio.calcular(fm2.patientId);

    expect(filas.length).toBeGreaterThan(0);
    expect(JSON.stringify(filas)).not.toContain(marcador);
    for (const sql of sentencias) {
      // `source_span` solo puede salir como el entero `page` (US-003 AC-3), nunca el JSON ni su texto (RN-10).
      expect(sql).not.toMatch(
        /to_jsonb\(\s*[te]\s*\)|source_span(?!\s*->>?\s*'page')|description|patient_id,/i,
      );
    }
  });
});
