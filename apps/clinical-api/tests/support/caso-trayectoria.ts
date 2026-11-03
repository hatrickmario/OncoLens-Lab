import { insertar, type Fila, type GeneradorDeIds } from './filas-sinteticas.js';
import { RELOJ_DE_PCASO, type PCasoSembrado } from './caso.js';
import {
  nuevoPaciente,
  sembrarDiagnostico,
  type ContextoDeSiembra,
  type PacienteSembrado,
} from './completitud.js';

/**
 * Extras opcionales de P-CASO para US-093 (L1D-79): cada escenario añade solo lo que necesita sobre el fixture de
 * L1D-74 (`caso.ts`), sin tocarlo. Todo es sintético (RN-13, RN-14).
 */

const MANUAL: Pick<Fila, 'entry_method' | 'extraction_confidence'> = {
  entry_method: 'manual',
  extraction_confidence: 'n_a',
};

export interface IdsDeLosReemplazados {
  readonly tratamiento: string;
  readonly atributo: string;
}

/** Un evento `respuesta` con fecha informada pero precisión `incierta` (cuenta como «sin fecha confiable»). */
export async function sembrarRespuestaIncierta(p: PCasoSembrado, id: string): Promise<void> {
  await insertar(p.cliente, 'clinical.clinical_event', {
    id,
    patient_id: p.patientId,
    episode_id: p.episodeId,
    source_span: '{}',
    created_at: RELOJ_DE_PCASO,
    event_type: 'respuesta',
    event_date: '2026-05-10',
    date_precision: 'incierta',
    description: 'Respuesta parcial referida',
    mapping_status: 'n_a',
    review_status: 'verificado',
    ...MANUAL,
  });
}

async function sembrarTratamiento(p: PCasoSembrado, fila: Fila): Promise<void> {
  await insertar(p.cliente, 'clinical.prior_treatment', {
    patient_id: p.patientId,
    episode_id: p.episodeId,
    source_document_id: null,
    setting: 'primera_linea_metastasica',
    mapping_status: 'mapeado',
    ended_at: null,
    created_at: RELOJ_DE_PCASO,
    line_number: null,
    ongoing: false,
    end_reason: 'completado',
    ...MANUAL,
    ...fila,
  });
}

/** Un tratamiento previo cuyo `regimen_name` lleva el documento sintético de P-CASO junto a «Docetaxel». */
export async function sembrarTratamientoConDocumento(
  p: PCasoSembrado,
  id: string,
  documento: string,
): Promise<void> {
  await sembrarTratamiento(p, {
    id,
    regimen_name: `Docetaxel CC ${documento}`,
    atc_codes: ['L01CD02'],
    started_at: '2026-02-01',
    ended_at: '2026-04-01',
    review_status: 'verificado',
  });
}

/** Un tratamiento y un atributo en `reemplazado`: estas tablas no llevan `supersedes_id` (ADR-50), solo el estado. */
export async function sembrarTratamientoYAtributoReemplazados(
  p: PCasoSembrado,
  ids: GeneradorDeIds,
): Promise<IdsDeLosReemplazados> {
  const tratamiento = ids();
  await sembrarTratamiento(p, {
    id: tratamiento,
    regimen_name: 'Esquema reemplazado',
    atc_codes: ['L01XX99'],
    started_at: '2026-03-01',
    review_status: 'reemplazado',
  });
  const atributo = ids();
  await insertar(p.cliente, 'clinical.clinical_attribute', {
    id: atributo,
    patient_id: p.patientId,
    episode_id: p.episodeId,
    attribute_key: 'estado_menopausico',
    value: 'valor reemplazado',
    observed_at: '2026-03-01',
    date_precision: 'dia',
    created_at: RELOJ_DE_PCASO,
    review_status: 'reemplazado',
    ...MANUAL,
  });
  return { tratamiento, atributo };
}

/** Un paciente con diagnóstico activo y sin eventos, tratamientos ni atributos. */
export async function sembrarPacienteSinTrayectoria(
  contexto: ContextoDeSiembra,
): Promise<PacienteSembrado> {
  const p = await nuevoPaciente(contexto);
  await sembrarDiagnostico(p, {
    cancerType: 'mama',
    grade: '2',
    stagingSystem: 'TNM_8',
    histology: 'carcinoma ductal infiltrante',
    stageValue: 'IIA',
    performanceValue: 1,
  });
  return p;
}
