import { describe, expect, inject, it } from 'vitest';
import { columnasDe } from '../../support/catalogo.js';
import { conectar, conTransaccionRevertida, esperarRechazo } from '../../support/db.js';
import {
  filaDeDiagnostico,
  generadorDeIds,
  insertarContextoClinico,
  sqlInsertar,
} from '../../support/filas-sinteticas.js';

const urlBase = inject('urlBaseDeTest');
// Espacio de ids propio de este archivo (los archivos corren en paralelo sobre una sola base).
const ESPACIO_DE_IDS = 9840;

const TABLAS_CON_CODIGOS = ['biomarker', 'diagnosis', 'prior_treatment', 'clinical_event'] as const;

describe('mapping_status de las entidades con códigos (RN-27)', () => {
  it.each(TABLAS_CON_CODIGOS)(
    'rechaza una fila sin mapping_status en %s porque la columna es NOT NULL y sin valor por defecto [US-098 AC-5]',
    async (tabla) => {
      const cliente = await conectar(urlBase);
      try {
        const columnas = await columnasDe(cliente, 'clinical', tabla);
        const mappingStatus = columnas.find((c) => c.nombre === 'mapping_status');

        expect(mappingStatus).toMatchObject({ anulable: false, porDefecto: null });
      } finally {
        await cliente.end();
      }
    },
  );

  it('rechaza por NOT NULL sobre mapping_status el diagnóstico insertado sin esa columna [US-098 AC-5]', async () => {
    await conTransaccionRevertida(urlBase, async (cliente) => {
      const ids = generadorDeIds(ESPACIO_DE_IDS);
      const { patientId, episodeId } = await insertarContextoClinico(cliente, ids);
      const { mapping_status: _omitida, ...sinEstado } = filaDeDiagnostico(
        ids,
        patientId,
        episodeId,
      );
      const { sql, valores } = sqlInsertar('clinical.diagnosis', sinEstado);

      const rechazo = await esperarRechazo(cliente, sql, valores);

      expect(rechazo).toMatchObject({ code: '23502', column: 'mapping_status' });
    });
  });
});
