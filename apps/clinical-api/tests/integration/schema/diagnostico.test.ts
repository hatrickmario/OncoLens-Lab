import { describe, expect, inject, it } from 'vitest';
import { columnasDe } from '../../support/catalogo.js';
import { conectar, conTransaccionRevertida, esperarRechazo } from '../../support/db.js';
import {
  filaDeDiagnostico,
  filaDeGradacionGleason,
  generadorDeIds,
  insertar,
  insertarContextoClinico,
  sqlInsertar,
} from '../../support/filas-sinteticas.js';

const urlBase = inject('urlBaseDeTest');
// Espacio de ids propio de este archivo (los archivos corren en paralelo sobre una sola base).
const ESPACIO_DE_IDS = 1;

// Columnas y nulabilidad de docs/architecture/data-model.md §4.3 y §6 (ADR-21, DEC-05).
const COLUMNAS_DIAGNOSIS = ['staging_system', 'stage_value', 'performance_scale', 'performance_value', 'histology', 'histology_code', 'grade', 'icd10_code', 'mapping_status'];
const GRADING_ANULABLES = ['specimen_type', 'grade_scope', 'gleason_primary_pattern', 'gleason_secondary_pattern', 'gleason_score', 'isup_grade_group', 'nottingham_grade', 'source_document_id', 'extraction_score', 'reviewed_by', 'reviewed_at'];
const GRADING_OBLIGATORIAS = ['id', 'diagnosis_id', 'grading_system', 'is_reference', 'entry_method', 'extraction_confidence', 'review_status', 'created_at'];

async function diagnosticoSintetico(cliente: Parameters<Parameters<typeof conTransaccionRevertida>[1]>[0]) {
  const ids = generadorDeIds(ESPACIO_DE_IDS);
  const contexto = await insertarContextoClinico(cliente, ids);
  const diagnostico = await insertar(cliente, 'clinical.diagnosis', filaDeDiagnostico(ids, contexto.patientId, contexto.episodeId));
  return { ids, diagnosisId: diagnostico.id as string };
}

describe('clinical.diagnosis y clinical.diagnosis_grading', () => {
  it('tiene las columnas de DEC-05 con los tipos y la nulabilidad del modelo cuando se inspecciona el catálogo [US-038 AC-3]', async () => {
    const cliente = await conectar(urlBase);
    try {
      const diagnosis = await columnasDe(cliente, 'clinical', 'diagnosis');
      const grading = await columnasDe(cliente, 'clinical', 'diagnosis_grading');
      const porNombre = (columnas: typeof grading) => new Map(columnas.map((c) => [c.nombre, c]));

      for (const columna of COLUMNAS_DIAGNOSIS) expect(porNombre(diagnosis).has(columna), columna).toBe(true);
      expect(porNombre(diagnosis).get('grade')?.anulable).toBe(true);
      expect(porNombre(diagnosis).get('performance_value')?.tipoUdt).toBe('int4');
      expect(porNombre(diagnosis).get('mapping_status')?.tipo).toBe('USER-DEFINED');
      for (const columna of GRADING_ANULABLES) expect(porNombre(grading).get(columna)?.anulable, columna).toBe(true);
      for (const columna of GRADING_OBLIGATORIAS) expect(porNombre(grading).get(columna)?.anulable, columna).toBe(false);
      expect(porNombre(grading).get('gleason_score')?.tipoUdt).toBe('int4');
      expect(porNombre(grading).get('is_reference')?.tipoUdt).toBe('bool');
      expect(porNombre(grading).get('grading_system')?.tipoUdt).toBe('text');
    } finally {
      await cliente.end();
    }
  });

  it('guarda la gradación Gleason 4+3=7 con ISUP 3 cuando es coherente [US-038 AC-3]', async () => {
    await conTransaccionRevertida(urlBase, async (cliente) => {
      const { ids, diagnosisId } = await diagnosticoSintetico(cliente);

      const guardada = await insertar(cliente, 'clinical.diagnosis_grading', filaDeGradacionGleason(ids, diagnosisId));

      expect(guardada).toMatchObject({ gleason_score: 7, isup_grade_group: 3, grading_system: 'gleason_isup' });
    });
  });

  it('rechaza por diagnosis_grading_gleason_ck el puntaje que no suma los patrones cuando 4+3 trae gleason_score 8 [US-038 AC-3]', async () => {
    await conTransaccionRevertida(urlBase, async (cliente) => {
      const { ids, diagnosisId } = await diagnosticoSintetico(cliente);
      const { sql, valores } = sqlInsertar('clinical.diagnosis_grading', filaDeGradacionGleason(ids, diagnosisId, { gleason_score: 8, isup_grade_group: 4 }));

      const error = await esperarRechazo(cliente, sql, valores);

      expect(error.constraint).toBe('diagnosis_grading_gleason_ck');
    });
  });

  it('rechaza por diagnosis_grading_gleason_ck el grupo ISUP no derivado cuando 3+4 trae ISUP 3 [US-038 AC-3]', async () => {
    await conTransaccionRevertida(urlBase, async (cliente) => {
      const { ids, diagnosisId } = await diagnosticoSintetico(cliente);
      const incoherente = filaDeGradacionGleason(ids, diagnosisId, { gleason_primary_pattern: 3, gleason_secondary_pattern: 4, gleason_score: 7, isup_grade_group: 3 });
      const { sql, valores } = sqlInsertar('clinical.diagnosis_grading', incoherente);

      const error = await esperarRechazo(cliente, sql, valores);

      expect(error.constraint).toBe('diagnosis_grading_gleason_ck');
    });
  });

  it.each([
    ['trae un patrón de Gleason', { gleason_primary_pattern: 3 }],
    ['trae grado 4', { nottingham_grade: 4 }],
  ])('rechaza por diagnosis_grading_nottingham_ck la gradación Nottingham que %s [US-038 AC-3]', async (_caso, variante) => {
    await conTransaccionRevertida(urlBase, async (cliente) => {
      const { ids, diagnosisId } = await diagnosticoSintetico(cliente);
      const nottingham = {
        ...filaDeGradacionGleason(ids, diagnosisId),
        grading_system: 'nottingham',
        specimen_type: null,
        grade_scope: null,
        gleason_primary_pattern: null,
        gleason_secondary_pattern: null,
        gleason_score: null,
        isup_grade_group: null,
        nottingham_grade: 2,
        ...variante,
      };
      const { sql, valores } = sqlInsertar('clinical.diagnosis_grading', nottingham);

      const error = await esperarRechazo(cliente, sql, valores);

      expect(error.constraint).toBe('diagnosis_grading_nottingham_ck');
    });
  });

  it('rechaza por diagnosis_grading_reference_uq la segunda gradación de referencia cuando el diagnóstico ya tiene una [US-038 AC-3]', async () => {
    await conTransaccionRevertida(urlBase, async (cliente) => {
      const { ids, diagnosisId } = await diagnosticoSintetico(cliente);
      await insertar(cliente, 'clinical.diagnosis_grading', filaDeGradacionGleason(ids, diagnosisId, { is_reference: true }));
      const { sql, valores } = sqlInsertar('clinical.diagnosis_grading', filaDeGradacionGleason(ids, diagnosisId, { is_reference: true }));

      const error = await esperarRechazo(cliente, sql, valores);

      expect(error.constraint).toBe('diagnosis_grading_reference_uq');
    });
  });
});
