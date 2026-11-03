import { describe, expect, inject, it } from 'vitest';
import { conTransaccionRevertida } from '../../support/db.js';
import {
  generadorDeIds,
  insertar,
  insertarContextoClinico,
} from '../../support/filas-sinteticas.js';
import { instantaneaDeTablas, tablasConDiferencia } from '../../support/instantanea-de-tablas.js';

const urlBase = inject('urlBaseDeTest');
const ESPACIO_DE_IDS = 9990;
const SCHEMAS = ['clinical', 'identity'] as const;

describe('instantánea de tablas', () => {
  it('lista solo las tablas de los schemas pedidos con su conteo y su hash', async () => {
    await conTransaccionRevertida(urlBase, async (cliente) => {
      const instantanea = await instantaneaDeTablas(cliente, { schemas: SCHEMAS });
      const nombres = Object.keys(instantanea);

      expect(nombres).toContain('clinical.ai_analysis_record');
      expect(nombres).toContain('identity.patient_identity');
      expect(nombres.every((n) => n.startsWith('clinical.') || n.startsWith('identity.'))).toBe(
        true,
      );
      expect(instantanea['clinical.biomarker']?.hash).toMatch(/^[0-9a-f]{32}$/);
    });
  });

  it('no detecta diferencias cuando no se escribió nada entre las dos instantáneas', async () => {
    await conTransaccionRevertida(urlBase, async (cliente) => {
      const antes = await instantaneaDeTablas(cliente, { schemas: SCHEMAS });
      const despues = await instantaneaDeTablas(cliente, { schemas: SCHEMAS });

      expect(tablasConDiferencia(antes, despues)).toEqual([]);
    });
  });

  it('detecta una tabla con una fila más cuando se hace un INSERT', async () => {
    await conTransaccionRevertida(urlBase, async (cliente) => {
      const antes = await instantaneaDeTablas(cliente, { schemas: SCHEMAS });
      await insertarContextoClinico(cliente, generadorDeIds(ESPACIO_DE_IDS));
      const despues = await instantaneaDeTablas(cliente, { schemas: SCHEMAS });

      expect(tablasConDiferencia(antes, despues)).toContain('clinical.patient');
      expect(despues['clinical.patient']?.filas).toBe((antes['clinical.patient']?.filas ?? 0) + 1);
    });
  });

  it('detecta solo la tabla cuyo contenido cambió con el mismo conteo cuando se hace un UPDATE de review_status', async () => {
    await conTransaccionRevertida(urlBase, async (cliente) => {
      const ids = generadorDeIds(ESPACIO_DE_IDS + 1);
      const { patientId, episodeId } = await insertarContextoClinico(cliente, ids);
      const examen = await insertar(cliente, 'clinical.exam', {
        id: ids(),
        patient_id: patientId,
        episode_id: episodeId,
        source_document_id: null,
        exam_type: 'laboratorio',
        source_lab: null,
        entry_method: 'seed',
        performed_at: '2026-09-01',
        created_at: '2026-10-16T12:00:00.000Z',
      });
      const { rows } = await cliente.query<{ id: string }>(
        `INSERT INTO clinical.biomarker (id, exam_id, name, original_name, mapping_status, value, reference_range,
           result_type, clinical_significance, significance_source, extraction_confidence, review_status, source_span, created_at)
         VALUES ($1, $2, 'HER2', 'HER2', 'no_mapeado', '3+', '', 'cualitativo', 'relevante', 'documento', 'n_a',
           'requiere_revision', '{}', now()) RETURNING id`,
        [ids(), examen['id']],
      );
      const antes = await instantaneaDeTablas(cliente, { schemas: SCHEMAS });

      await cliente.query(
        "UPDATE clinical.biomarker SET review_status = 'verificado' WHERE id = $1",
        [rows[0]?.id],
      );
      const despues = await instantaneaDeTablas(cliente, { schemas: SCHEMAS });

      expect(tablasConDiferencia(antes, despues)).toEqual(['clinical.biomarker']);
      expect(despues['clinical.biomarker']?.filas).toBe(antes['clinical.biomarker']?.filas);
    });
  });
});
