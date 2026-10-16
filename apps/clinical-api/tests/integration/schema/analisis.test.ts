import { describe, expect, inject, it } from 'vitest';
import { columnasDe } from '../../support/catalogo.js';
import { conectar, conTransaccionRevertida, esperarRechazo } from '../../support/db.js';
import { filaDeAnalisis, generadorDeIds, insertar, insertarContextoClinico } from '../../support/filas-sinteticas.js';

const urlBase = inject('urlBaseDeTest');
// Espacio de ids propio de este archivo (los archivos corren en paralelo sobre una sola base).
const ESPACIO_DE_IDS = 2;

describe('clinical.ai_analysis_record', () => {
  it('guarda top_relevance_score como NULL y no como 0.0 cuando el análisis no tiene evidencia [US-038 AC-4]', async () => {
    await conTransaccionRevertida(urlBase, async (cliente) => {
      const ids = generadorDeIds(ESPACIO_DE_IDS);
      const contexto = await insertarContextoClinico(cliente, ids);
      const sinEvidencia = filaDeAnalisis(ids, contexto.patientId, contexto.episodeId, contexto.userId, {
        evidence_options: JSON.stringify([]),
        status: 'sin_evidencia',
        top_relevance_score: null,
      });

      const guardada = await insertar(cliente, 'clinical.ai_analysis_record', sinEvidencia);
      const { rows } = await cliente.query(
        'SELECT top_relevance_score IS NULL AS es_nulo, top_relevance_score = 0 AS es_cero FROM clinical.ai_analysis_record WHERE id = $1',
        [guardada.id],
      );

      expect(rows[0]).toEqual({ es_nulo: true, es_cero: null });
    });
  });

  it('rechaza por el trigger y deja la fila intacta cuando se actualiza cualquier columna de un análisis [US-038 AC-4]', async () => {
    await conTransaccionRevertida(urlBase, async (cliente) => {
      const ids = generadorDeIds(ESPACIO_DE_IDS);
      const contexto = await insertarContextoClinico(cliente, ids);
      const analisis = await insertar(cliente, 'clinical.ai_analysis_record', filaDeAnalisis(ids, contexto.patientId, contexto.episodeId, contexto.userId));

      const error = await esperarRechazo(cliente, 'UPDATE clinical.ai_analysis_record SET omitted_claims = 5 WHERE id = $1', [analisis.id]);
      const { rows } = await cliente.query('SELECT omitted_claims FROM clinical.ai_analysis_record WHERE id = $1', [analisis.id]);

      expect(error.message).toContain('ai_analysis_record es inmutable (RN-06)');
      expect(rows[0]).toEqual({ omitted_claims: 0 });
    });
  });

  it('no tiene updated_at y declara top_relevance_score como double precision anulable sin DEFAULT cuando se listan sus columnas [US-038 AC-4]', async () => {
    const cliente = await conectar(urlBase);
    try {
      const columnas = await columnasDe(cliente, 'clinical', 'ai_analysis_record');
      const puntaje = columnas.find((c) => c.nombre === 'top_relevance_score');

      expect(columnas.map((c) => c.nombre)).not.toContain('updated_at');
      expect(puntaje).toMatchObject({ tipo: 'double precision', anulable: true, porDefecto: null });
    } finally {
      await cliente.end();
    }
  });
});
