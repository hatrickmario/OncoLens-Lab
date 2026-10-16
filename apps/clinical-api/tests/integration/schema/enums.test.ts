import { describe, expect, inject, it } from 'vitest';
import { valoresDeEnum } from '../../support/catalogo.js';
import { conectar, conTransaccionRevertida, esperarRechazo } from '../../support/db.js';
import { filaDePaciente, generadorDeIds, sqlInsertar } from '../../support/filas-sinteticas.js';

const urlBase = inject('urlBaseDeTest');
// Espacio de ids propio de este archivo (los archivos corren en paralelo sobre una sola base).
const ESPACIO_DE_IDS = 5;

// Valores en español que el resto del backlog da por existentes (US-039, US-046, FEAT-01…FEAT-06).
const ENUMS_ESPERADOS: Array<[string, string[]]> = [
  ['entry_method', ['seed', 'manual']],
  ['ocr_status', ['cuarentena_pii', 'requiere_revision_identidad']],
  ['mapping_status', ['no_mapeado']],
  ['data_origin', ['sintetico']],
  ['opt_out_type', ['analisis_ia']],
  ['review_status', ['rechazado', 'reemplazado']],
  ['clinical_significance', ['crítico']],
];

describe('Enums nativos de PostgreSQL', () => {
  it.each(ENUMS_ESPERADOS)('lista los valores en español de %s cuando se consulta pg_enum [US-038 AC-7]', async (enumerado, esperados) => {
    const cliente = await conectar(urlBase);
    try {
      const valores = await valoresDeEnum(cliente, enumerado);

      expect(valores).toEqual(expect.arrayContaining(esperados));
    } finally {
      await cliente.end();
    }
  });

  it('rechaza data_origin synthetic cuando el valor no pertenece al enum en español [US-038 AC-7]', async () => {
    await conTransaccionRevertida(urlBase, async (cliente) => {
      const { sql, valores } = sqlInsertar('clinical.patient', filaDePaciente(generadorDeIds(ESPACIO_DE_IDS), { data_origin: 'synthetic' }));

      const error = await esperarRechazo(cliente, sql, valores);

      expect(error.code).toBe('22P02');
      expect(error.message).toContain('data_origin');
    });
  });
});
