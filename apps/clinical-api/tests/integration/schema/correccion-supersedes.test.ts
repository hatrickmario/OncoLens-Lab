import type { Client } from 'pg';
import { describe, expect, inject, it } from 'vitest';
import { conTransaccionRevertida, esperarRechazo } from '../../support/db.js';
import {
  FECHA_FIJA,
  INSTANTE_FIJO,
  generadorDeIds,
  insertar,
  insertarContextoClinico,
  type Fila,
  type GeneradorDeIds,
} from '../../support/filas-sinteticas.js';

const urlBase = inject('urlBaseDeTest');
// Espacio de ids propio de este archivo (los archivos corren en paralelo sobre una sola base).
const ESPACIO_DE_IDS = 9900;

const UNIQUE_VIOLATION = '23505';
const FOREIGN_KEY_VIOLATION = '23503';

/** Examen + biomarcador y nota sintéticos SIN `supersedes_id`: así los inserta cualquier escritura anterior a US-253. */
async function filasPreexistentes(cliente: Client, ids: GeneradorDeIds) {
  const contexto = await insertarContextoClinico(cliente, ids);
  const examen = await insertar(cliente, 'clinical.exam', {
    id: ids(),
    patient_id: contexto.patientId,
    episode_id: contexto.episodeId,
    exam_type: 'registro_manual',
    entry_method: 'manual',
    performed_at: FECHA_FIJA,
    created_at: INSTANTE_FIJO,
  });
  const biomarcador = await insertar(cliente, 'clinical.biomarker', filaDeBiomarcador(ids, examen));
  const nota = await insertar(cliente, 'clinical.clinical_note', filaDeNota(ids, contexto));
  return { contexto, examen, biomarcador, nota };
}

function filaDeBiomarcador(ids: GeneradorDeIds, examen: Fila, resto: Fila = {}): Fila {
  return {
    id: ids(),
    exam_id: examen['id'],
    name: 'Ki-67',
    original_name: 'Ki-67',
    mapping_status: 'no_mapeado',
    value: '20',
    reference_range: '',
    result_type: 'cuantitativo',
    clinical_significance: 'relevante',
    significance_source: 'regla',
    extraction_confidence: 'n_a',
    review_status: 'verificado',
    source_span: '{}',
    created_at: INSTANTE_FIJO,
    ...resto,
  };
}

function filaDeNota(
  ids: GeneradorDeIds,
  contexto: { patientId: string; episodeId: string; userId: string },
  resto: Fila = {},
): Fila {
  return {
    id: ids(),
    patient_id: contexto.patientId,
    episode_id: contexto.episodeId,
    created_by: contexto.userId,
    note_type: 'comorbilidad',
    entry_method: 'seed',
    content: 'Nota sintética de prueba.',
    recorded_at: FECHA_FIJA,
    is_active: true,
    extraction_confidence: 'n_a',
    review_status: 'verificado',
    created_at: INSTANTE_FIJO,
    ...resto,
  };
}

describe('supersedes_id de clinical.biomarker, clinical.exam y clinical.clinical_note (ADR-50)', () => {
  it('deja supersedes_id nulo en las filas existentes sin cambiar su número cuando se insertan como antes de la migración [US-253 AC-1]', async () => {
    await conTransaccionRevertida(urlBase, async (cliente) => {
      const { contexto, examen, biomarcador, nota } = await filasPreexistentes(
        cliente,
        generadorDeIds(ESPACIO_DE_IDS),
      );

      expect([examen, biomarcador, nota].map((fila) => fila['supersedes_id'])).toEqual([
        null,
        null,
        null,
      ]);
      const { rows } = await cliente.query<{ n: number }>(
        `SELECT (SELECT count(*) FROM clinical.exam WHERE patient_id = $1)::int AS n`,
        [contexto.patientId],
      );
      expect(rows[0]?.n).toBe(1);
    });
  });

  it('rechaza reemplazar dos veces la misma fila por el índice único parcial [US-253 AC-1]', async () => {
    await conTransaccionRevertida(urlBase, async (cliente) => {
      const ids = generadorDeIds(ESPACIO_DE_IDS);
      const { contexto, examen, biomarcador, nota } = await filasPreexistentes(cliente, ids);
      await insertar(
        cliente,
        'clinical.biomarker',
        filaDeBiomarcador(ids, examen, { supersedes_id: biomarcador['id'] }),
      );
      await insertar(
        cliente,
        'clinical.clinical_note',
        filaDeNota(ids, contexto, { supersedes_id: nota['id'] }),
      );

      const segundoBiomarcador = await esperarRechazo(
        cliente,
        'INSERT INTO clinical.biomarker (id, exam_id, name, original_name, mapping_status, value, reference_range, result_type, clinical_significance, significance_source, extraction_confidence, review_status, source_span, created_at, supersedes_id) SELECT $1, exam_id, name, original_name, mapping_status, value, reference_range, result_type, clinical_significance, significance_source, extraction_confidence, review_status, source_span, created_at, $2 FROM clinical.biomarker WHERE id = $2',
        [ids(), biomarcador['id']],
      );
      const segundaNota = await esperarRechazo(
        cliente,
        'INSERT INTO clinical.clinical_note (id, patient_id, episode_id, created_by, note_type, entry_method, content, recorded_at, is_active, extraction_confidence, review_status, created_at, supersedes_id) SELECT $1, patient_id, episode_id, created_by, note_type, entry_method, content, recorded_at, is_active, extraction_confidence, review_status, created_at, $2 FROM clinical.clinical_note WHERE id = $2',
        [ids(), nota['id']],
      );

      expect(segundoBiomarcador.code).toBe(UNIQUE_VIOLATION);
      expect(segundoBiomarcador.constraint).toBe('biomarker_supersedes_id_uq');
      expect(segundaNota.code).toBe(UNIQUE_VIOLATION);
      expect(segundaNota.constraint).toBe('clinical_note_supersedes_id_uq');
    });
  });

  it('rechaza reemplazar dos veces el mismo examen por el índice único parcial [US-253 AC-1]', async () => {
    await conTransaccionRevertida(urlBase, async (cliente) => {
      const ids = generadorDeIds(ESPACIO_DE_IDS);
      const { contexto, examen } = await filasPreexistentes(cliente, ids);
      const correccion = (): Fila => ({
        id: ids(),
        patient_id: contexto.patientId,
        episode_id: contexto.episodeId,
        exam_type: 'registro_manual',
        entry_method: 'manual_correction',
        performed_at: FECHA_FIJA,
        created_at: INSTANTE_FIJO,
        supersedes_id: examen['id'],
      });
      await insertar(cliente, 'clinical.exam', correccion());

      const rechazo = await esperarRechazo(
        cliente,
        'INSERT INTO clinical.exam (id, patient_id, episode_id, exam_type, entry_method, performed_at, created_at, supersedes_id) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        [
          ids(),
          contexto.patientId,
          contexto.episodeId,
          'registro_manual',
          'manual_correction',
          FECHA_FIJA,
          INSTANTE_FIJO,
          examen['id'],
        ],
      );

      expect(rechazo.code).toBe(UNIQUE_VIOLATION);
      expect(rechazo.constraint).toBe('exam_supersedes_id_uq');
    });
  });

  it('rechaza un supersedes_id inexistente por la clave foránea [US-253 AC-1]', async () => {
    await conTransaccionRevertida(urlBase, async (cliente) => {
      const ids = generadorDeIds(ESPACIO_DE_IDS);
      const { examen } = await filasPreexistentes(cliente, ids);
      const inexistente = ids();

      const rechazo = await esperarRechazo(
        cliente,
        'INSERT INTO clinical.biomarker (id, exam_id, name, original_name, mapping_status, value, reference_range, result_type, clinical_significance, significance_source, extraction_confidence, review_status, source_span, created_at, supersedes_id) VALUES ($1, $2, $3, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)',
        [
          ids(),
          examen['id'],
          'Ki-67',
          'no_mapeado',
          '25',
          '',
          'cuantitativo',
          'relevante',
          'regla',
          'n_a',
          'verificado',
          '{}',
          INSTANTE_FIJO,
          inexistente,
        ],
      );

      expect(rechazo.code).toBe(FOREIGN_KEY_VIOLATION);
      expect(rechazo.constraint).toBe('biomarker_supersedes_id_fkey');
    });
  });

  it('permite que varias filas nuevas no reemplacen a nadie cuando supersedes_id es nulo [US-253 AC-1]', async () => {
    await conTransaccionRevertida(urlBase, async (cliente) => {
      const ids = generadorDeIds(ESPACIO_DE_IDS);
      const { examen } = await filasPreexistentes(cliente, ids);

      await insertar(cliente, 'clinical.biomarker', filaDeBiomarcador(ids, examen));
      await insertar(cliente, 'clinical.biomarker', filaDeBiomarcador(ids, examen));

      const { rows } = await cliente.query<{ n: number }>(
        'SELECT count(*)::int AS n FROM clinical.biomarker WHERE exam_id = $1 AND supersedes_id IS NULL',
        [examen['id']],
      );
      expect(rows[0]?.n).toBe(3);
    });
  });
});
