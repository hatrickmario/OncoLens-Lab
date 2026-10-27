import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Client } from 'pg';
import {
  FECHA_FIJA,
  INSTANTE_FIJO,
  filaDeDiagnostico,
  filaDeEpisodio,
  filaDePaciente,
  insertar,
  insertarContextoClinico,
  type Fila,
  type GeneradorDeIds,
} from './filas-sinteticas.js';

/**
 * Soporte de FEAT-04 (US-002): catálogos FX-04-a y pacientes FX-04-b (F-M1, F-M2, F-M3, F-P1). Todo es sintético
 * (`data_origin = sintetico`, RN-13, RN-14); la PII sintética de la nota de F-M2 se arma en tiempo de test y no se
 * versiona (el escáner de PII de la CI no distingue un valor sintético de uno real).
 */

const RAIZ_FIXTURES = resolve(
  fileURLToPath(new URL('../fixtures/completeness/catalogos', import.meta.url)),
);
export const RUTA_CATALOGO_TEST_1_0_0 = resolve(RAIZ_FIXTURES, 'test-1.0.0');
export const RUTA_CATALOGO_TEST_1_1_0 = resolve(RAIZ_FIXTURES, 'test-1.1.0');
export const leerTexto = (ruta: string): string => readFileSync(ruta, 'utf8');

/** Nombre y documento sintéticos de la `ClinicalNote` de F-M2, para los tests de no-fuga (US-003…US-006). */
export function piiSinteticaDeFM2(): { nombre: string; documento: string; texto: string } {
  const nombre = ['Marta', 'Sintetica', 'Pruebas'].join(' ');
  const documento = ['9', '8', '7', '6', '5', '4', '3', '2'].join('');
  return {
    nombre,
    documento,
    texto: `Paciente ${nombre}, documento ${documento}, refiere fatiga.`,
  };
}

export interface ContextoDeSiembra {
  readonly cliente: Client;
  readonly ids: GeneradorDeIds;
  readonly userId: string;
}

export interface PacienteSembrado extends ContextoDeSiembra {
  readonly patientId: string;
  readonly episodeId: string;
}

/** Usuario y rol sintéticos de los que cuelgan los episodios de los pacientes de un archivo de test. */
export async function prepararSiembra(
  cliente: Client,
  ids: GeneradorDeIds,
): Promise<ContextoDeSiembra> {
  const base = await insertarContextoClinico(cliente, ids);
  return { cliente, ids, userId: base.userId };
}

/**
 * Ki-67 `no_mapeado` en `requiere_revision` (AC-8): `name` es el texto propuesto por el extractor y `originalName` el del
 * documento; el emparejamiento solo mira `name`.
 */
export async function sembrarKi67NoMapeado(
  p: PacienteSembrado,
  name: string,
  originalName = 'Ki67 índice',
): Promise<void> {
  await sembrarBiomarcador(p, {
    name,
    originalName,
    value: '30%',
    reviewStatus: 'requiere_revision',
    mappingStatus: 'no_mapeado',
    entryMethod: 'ocr',
  });
}

export async function nuevoPaciente(contexto: ContextoDeSiembra): Promise<PacienteSembrado> {
  const { cliente, ids, userId } = contexto;
  const paciente = await insertar(cliente, 'clinical.patient', filaDePaciente(ids));
  const patientId = paciente['id'] as string;
  const episodio = await insertar(
    cliente,
    'clinical.care_episode',
    filaDeEpisodio(ids, patientId, userId),
  );
  return { ...contexto, patientId, episodeId: episodio['id'] as string };
}

export interface DiagnosticoDeSiembra {
  cancerType: 'mama' | 'prostata';
  histology: string;
  grade: string | null;
  stagingSystem: string | null;
  stageValue: string | null;
  performanceValue: number;
  reviewStatus?: string;
}

export async function sembrarDiagnostico(
  p: PacienteSembrado,
  d: DiagnosticoDeSiembra,
): Promise<void> {
  await insertar(
    p.cliente,
    'clinical.diagnosis',
    filaDeDiagnostico(p.ids, p.patientId, p.episodeId, {
      cancer_type: d.cancerType,
      histology: d.histology,
      grade: d.grade,
      staging_system: d.stagingSystem,
      stage_value: d.stageValue,
      performance_scale: 'ECOG',
      performance_value: d.performanceValue,
      review_status: d.reviewStatus ?? 'verificado',
    }),
  );
}

export interface BiomarcadorDeSiembra {
  name: string;
  value: string;
  reviewStatus: string;
  /** Fecha del examen (`Exam.performed_at`); por defecto la fecha fija. */
  performedAt?: string;
  mappingStatus?: 'mapeado' | 'no_mapeado';
  originalName?: string;
  examType?: string;
  entryMethod?: string;
  extractionConfidence?: string;
  /** JSON serializado de `source_span` (texto del documento: debe quedar fuera de la lectura del checklist). */
  sourceSpan?: string;
}

export async function sembrarBiomarcador(
  p: PacienteSembrado,
  b: BiomarcadorDeSiembra,
): Promise<string> {
  const examen = await insertar(p.cliente, 'clinical.exam', {
    id: p.ids(),
    patient_id: p.patientId,
    episode_id: p.episodeId,
    source_document_id: null,
    exam_type: b.examType ?? 'IHQ',
    source_lab: null,
    entry_method: b.entryMethod ?? 'seed',
    performed_at: b.performedAt ?? FECHA_FIJA,
    created_at: INSTANTE_FIJO,
  });
  const fila: Fila = {
    id: p.ids(),
    exam_id: examen['id'],
    name: b.name,
    original_name: b.originalName ?? b.name,
    mapping_status: b.mappingStatus ?? 'mapeado',
    value: b.value,
    reference_range: '',
    result_type: 'cualitativo',
    clinical_significance: 'relevante',
    significance_source: 'documento',
    extraction_confidence: b.extractionConfidence ?? 'n_a',
    review_status: b.reviewStatus,
    source_span: b.sourceSpan ?? '{}',
    created_at: INSTANTE_FIJO,
  };
  const insertada = await insertar(p.cliente, 'clinical.biomarker', fila);
  return insertada['id'] as string;
}

export async function sembrarAtributo(
  p: PacienteSembrado,
  a: { key: string; value: string; reviewStatus: string },
): Promise<void> {
  await insertar(p.cliente, 'clinical.clinical_attribute', {
    id: p.ids(),
    patient_id: p.patientId,
    episode_id: p.episodeId,
    attribute_key: a.key,
    value: a.value,
    observed_at: FECHA_FIJA,
    date_precision: 'dia',
    entry_method: 'seed',
    extraction_confidence: 'n_a',
    review_status: a.reviewStatus,
    created_at: INSTANTE_FIJO,
  });
}

export async function sembrarTratamientoPrevio(
  p: PacienteSembrado,
  t: { regimen: string; reviewStatus: string },
): Promise<void> {
  await insertar(p.cliente, 'clinical.prior_treatment', {
    id: p.ids(),
    patient_id: p.patientId,
    episode_id: p.episodeId,
    line_number: 1,
    setting: 'primera_linea_metastasica',
    regimen_name: t.regimen,
    atc_codes: [],
    mapping_status: 'no_mapeado',
    started_at: '2026-03-01',
    ongoing: true,
    end_reason: 'desconocido',
    entry_method: 'manual',
    extraction_confidence: 'n_a',
    review_status: t.reviewStatus,
    created_at: INSTANTE_FIJO,
  });
}

const DIAGNOSTICO_DE_MAMA = {
  cancerType: 'mama',
  grade: '2',
  stagingSystem: 'TNM_8',
} as const;

/** F-M1 (mama, completo): todo `verificado`; sin tratamientos previos, HER2 ISH ni BRCA. */
export async function sembrarFM1(contexto: ContextoDeSiembra): Promise<PacienteSembrado> {
  const p = await nuevoPaciente(contexto);
  await sembrarDiagnostico(p, {
    ...DIAGNOSTICO_DE_MAMA,
    histology: 'carcinoma ductal infiltrante',
    stageValue: 'IIA',
    performanceValue: 1,
  });
  await sembrarBiomarcador(p, {
    name: 'Receptor de estrógeno',
    value: 'Positivo',
    reviewStatus: 'verificado',
  });
  await sembrarBiomarcador(p, {
    name: 'Receptor de progesterona',
    value: 'Positivo',
    reviewStatus: 'verificado',
  });
  await sembrarBiomarcador(p, { name: 'HER2', value: '3+ (IHQ)', reviewStatus: 'verificado' });
  await sembrarBiomarcador(p, { name: 'Ki-67', value: '20%', reviewStatus: 'verificado' });
  await sembrarAtributo(p, {
    key: 'estado_menopausico',
    value: 'posmenopausica',
    reviewStatus: 'verificado',
  });
  return p;
}

/** F-M2 (mama, mixto): RE sin verificar, RP rechazado, HER2 corregido, un tratamiento previo y sin Ki-67 (el AC-8 añade uno `no_mapeado` con `sembrarKi67NoMapeado`). */
export async function sembrarFM2(contexto: ContextoDeSiembra): Promise<PacienteSembrado> {
  const p = await nuevoPaciente(contexto);
  await sembrarDiagnostico(p, {
    ...DIAGNOSTICO_DE_MAMA,
    histology: 'carcinoma lobulillar infiltrante',
    grade: null,
    stageValue: 'IV',
    performanceValue: 2,
  });
  await sembrarBiomarcador(p, {
    name: 'Receptor de estrógeno',
    value: 'Positivo',
    reviewStatus: 'requiere_revision',
    entryMethod: 'ocr',
    extractionConfidence: 'media',
  });
  await sembrarBiomarcador(p, {
    name: 'Receptor de progesterona',
    value: 'Negativo',
    reviewStatus: 'rechazado',
    entryMethod: 'ocr',
  });
  await sembrarBiomarcador(p, {
    name: 'HER2',
    value: '2+ (IHQ)',
    reviewStatus: 'corregido',
    entryMethod: 'manual_correction',
  });
  await sembrarTratamientoPrevio(p, { regimen: 'letrozol', reviewStatus: 'verificado' });
  const pii = piiSinteticaDeFM2();
  await insertar(p.cliente, 'clinical.clinical_note', {
    id: p.ids(),
    patient_id: p.patientId,
    episode_id: p.episodeId,
    created_by: p.userId,
    note_type: 'nota_libre',
    entry_method: 'seed',
    content: pii.texto,
    recorded_at: FECHA_FIJA,
    is_active: true,
    extraction_confidence: 'n_a',
    review_status: 'verificado',
    created_at: INSTANTE_FIJO,
  });
  return p;
}

/** F-M3 (mama, condición no evaluable): como F-M1 pero sin TNM y sin ningún HER2. */
export async function sembrarFM3(contexto: ContextoDeSiembra): Promise<PacienteSembrado> {
  const p = await nuevoPaciente(contexto);
  await sembrarDiagnostico(p, {
    cancerType: 'mama',
    histology: 'carcinoma ductal infiltrante',
    grade: '2',
    stagingSystem: null,
    stageValue: null,
    performanceValue: 1,
  });
  await sembrarBiomarcador(p, {
    name: 'Receptor de estrógeno',
    value: 'Positivo',
    reviewStatus: 'verificado',
  });
  await sembrarBiomarcador(p, {
    name: 'Receptor de progesterona',
    value: 'Positivo',
    reviewStatus: 'verificado',
  });
  await sembrarBiomarcador(p, { name: 'Ki-67', value: '20%', reviewStatus: 'verificado' });
  await sembrarAtributo(p, {
    key: 'estado_menopausico',
    value: 'posmenopausica',
    reviewStatus: 'verificado',
  });
  return p;
}

/** F-P1 (próstata): ECOG 0 y tres PSA `verificado` con fechas distintas. */
export async function sembrarFP1(contexto: ContextoDeSiembra): Promise<PacienteSembrado> {
  const p = await nuevoPaciente(contexto);
  await sembrarDiagnostico(p, {
    cancerType: 'prostata',
    histology: 'adenocarcinoma acinar',
    grade: null,
    stagingSystem: null,
    stageValue: null,
    performanceValue: 0,
  });
  for (const [valor, fecha] of [
    ['4.1 ng/mL', '2026-01-10'],
    ['5.3 ng/mL', '2026-04-10'],
    ['7.8 ng/mL', '2026-07-10'],
  ] as const) {
    await sembrarBiomarcador(p, {
      name: 'PSA',
      value: valor,
      reviewStatus: 'verificado',
      performedAt: fecha,
      examType: 'laboratorio',
    });
  }
  return p;
}
