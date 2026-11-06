import { columnasDeGradacion } from './columnas-de-gradacion.js';
import { resolverCodigoDelCatalogo, type CatalogoClinico } from './catalogo.js';
import { idSembrado } from './determinismo.js';
import { derivarTextoGrade } from './grade.js';
import {
  DOCUMENTO_SINTETICO_CHAT,
  NOMBRE_SINTETICO_CHAT,
  PACIENTE_CHAT,
} from './pacientes/chat.js';
import { nottingham } from './pacientes/auxiliares.js';
import type { ClienteSql } from './sembrar.js';
import type { IdentityService } from '../../src/modules/patients/identity.service.js';

/**
 * Siembra de `P-CHAT` (FX-12-b, L1D-315): el paciente sintético del chat. Aparte de `PACIENTES_SEMILLA` a propósito:
 * sus rasgos (conflicto de estadio, corrección con `supersedes_id`, documentos, PII sembrada en texto libre) no caben en
 * `PacienteSemilla`, y así no cambia el conteo ni los ordinales de los pacientes (a)–(m). Todo es sintético (RN-13).
 */

export interface EntradasDeLaSiembraDelChat {
  readonly db: ClienteSql;
  /** RN-27: todo código sale del catálogo versionado. */
  readonly catalogo: CatalogoClinico;
  readonly ahora: Date;
  readonly identidad: IdentityService;
  readonly doctorId: string;
  readonly retencion: { anosHastaRetencion: number; anosHastaRetencionMaxima: number };
  /** Cuenta la fila escrita en los logs del seed (solo conteos por tabla). */
  readonly contar: (tabla: string) => void;
}

type Fila = Record<string, unknown>;

const PROCEDENCIA = {
  entry_method: 'seed',
  extraction_confidence: 'n_a',
  review_status: 'verificado',
};

function fechaRelativa(instante: Date, dias: number): string {
  const fecha = new Date(instante);
  fecha.setUTCDate(fecha.getUTCDate() - dias);
  return fecha.toISOString().slice(0, 10);
}

function sumarAnos(fechaIso: string, anos: number): string {
  const fecha = new Date(`${fechaIso}T00:00:00.000Z`);
  fecha.setUTCFullYear(fecha.getUTCFullYear() + anos);
  return fecha.toISOString().slice(0, 10);
}

async function upsertar(entradas: EntradasDeLaSiembraDelChat, tabla: string, fila: Fila) {
  const columnas = Object.keys(fila);
  const actualizables = columnas
    .filter((columna) => columna !== 'id')
    .map((columna) => `${columna} = EXCLUDED.${columna}`);
  await entradas.db.query(
    `INSERT INTO ${tabla} (${columnas.join(', ')}) VALUES (${columnas.map((_, i) => `$${i + 1}`).join(', ')})
     ON CONFLICT (id) DO UPDATE SET ${actualizables.join(', ')}`,
    Object.values(fila),
  );
  entradas.contar(tabla);
}

const id = (clave: string): string => idSembrado(`${PACIENTE_CHAT}/${clave}`);

interface Contexto {
  readonly e: EntradasDeLaSiembraDelChat;
  readonly pacienteId: string;
  readonly episodioId: string;
}

/** Columnas comunes de los dos registros de diagnóstico de `P-CHAT` (mama, TNM 8, ECOG 1). */
function filaBaseDeDiagnostico({ e, pacienteId, episodioId }: Contexto): Fila {
  const cie10 = resolverCodigoDelCatalogo(e.catalogo, 'cie10', 'mama');
  return {
    patient_id: pacienteId,
    episode_id: episodioId,
    source_document_id: null,
    cancer_type: 'mama',
    icd10_code: cie10.codigo,
    mapping_status: cie10.mappingStatus,
    histology: 'carcinoma ductal infiltrante',
    histology_code: null,
    staging_system: 'TNM_8',
    performance_scale: 'ECOG',
    performance_value: 1,
    extraction_score: null,
    extraction_confidence: 'n_a',
    reviewed_by: null,
    reviewed_at: null,
    created_at: e.ahora,
  };
}

/** Estadio IIA verificado (día −200) con Nottingham grado 2 como gradación de referencia. */
async function sembrarDiagnosticoVerificado(contexto: Contexto) {
  const { e } = contexto;
  const gradacion = nottingham(2);
  await upsertar(e, 'clinical.diagnosis', {
    ...filaBaseDeDiagnostico(contexto),
    id: id('diagnostico-iia'),
    entry_method: 'manual',
    grade: derivarTextoGrade(gradacion),
    stage_value: 'IIA',
    diagnosed_at: fechaRelativa(e.ahora, 200),
    is_active: true,
    review_status: 'verificado',
    conflicts_with_id: null,
  });
  await upsertar(e, 'clinical.diagnosis_grading', {
    id: id('diagnostico-iia/gradacion'),
    diagnosis_id: id('diagnostico-iia'),
    ...columnasDeGradacion(gradacion),
    is_reference: true,
    source_document_id: null,
    ...PROCEDENCIA,
    entry_method: 'manual',
    extraction_score: null,
    reviewed_by: null,
    reviewed_at: null,
    created_at: e.ahora,
  });
}

/** Estadio IIB posterior (día −190), sin revisar, que choca con el IIA (RN-08). */
async function sembrarDiagnosticoEnConflicto(contexto: Contexto) {
  await upsertar(contexto.e, 'clinical.diagnosis', {
    ...filaBaseDeDiagnostico(contexto),
    id: id('diagnostico-iib'),
    entry_method: 'seed',
    grade: null,
    stage_value: 'IIB',
    diagnosed_at: fechaRelativa(contexto.e.ahora, 190),
    is_active: false,
    review_status: 'requiere_revision',
    conflicts_with_id: id('diagnostico-iia'),
  });
}

interface BiomarcadorDelChat {
  readonly clave: string;
  readonly examen: string;
  readonly nombre: string;
  readonly valor: string;
  readonly estado: string;
  readonly supersedes: string | null;
  readonly confianza: string;
}

const EXAMENES = [
  { clave: 'examen-her2-2mas', dias: 180 },
  { clave: 'examen-her2-3mas', dias: 170 },
  { clave: 'examen-re', dias: 175 },
] as const;

const BIOMARCADORES: readonly BiomarcadorDelChat[] = [
  // HER2 2+ reemplazado por la corrección 3+ (ADR-50): la corrección apunta a la fila anterior con `supersedes_id`.
  {
    clave: 'her2-2mas',
    examen: 'examen-her2-2mas',
    nombre: 'HER2',
    valor: '2+',
    estado: 'reemplazado',
    supersedes: null,
    confianza: 'n_a',
  },
  {
    clave: 'her2-3mas',
    examen: 'examen-her2-3mas',
    nombre: 'HER2',
    valor: '3+',
    estado: 'corregido',
    supersedes: 'her2-2mas',
    confianza: 'n_a',
  },
  // RE positivo extraído sin revisar.
  {
    clave: 're',
    examen: 'examen-re',
    nombre: 'RE',
    valor: 'positivo',
    estado: 'auto_aceptado',
    supersedes: null,
    confianza: 'alta',
  },
];

async function sembrarExamenes({ e, pacienteId, episodioId }: Contexto) {
  for (const examen of EXAMENES) {
    await upsertar(e, 'clinical.exam', {
      id: id(examen.clave),
      patient_id: pacienteId,
      episode_id: episodioId,
      source_document_id: null,
      exam_type: 'laboratorio',
      source_lab: null,
      entry_method: 'seed',
      performed_at: fechaRelativa(e.ahora, examen.dias),
      supersedes_id: null,
      created_at: e.ahora,
    });
  }
}

function filaDeBiomarcador(e: EntradasDeLaSiembraDelChat, b: BiomarcadorDelChat): Fila {
  const loinc = resolverCodigoDelCatalogo(e.catalogo, 'loinc', b.nombre);
  return {
    id: id(b.clave),
    exam_id: id(b.examen),
    name: b.nombre,
    original_name: b.nombre,
    loinc_code: loinc.codigo,
    mapping_status: loinc.mappingStatus,
    value: b.valor,
    unit: null,
    normalized_unit: null,
    reference_range: '',
    result_type: 'cualitativo',
    clinical_significance: 'relevante',
    significance_source: 'documento',
    extraction_score: null,
    extraction_confidence: b.confianza,
    review_status: b.estado,
    conflicts_with_id: null,
    supersedes_id: b.supersedes === null ? null : id(b.supersedes),
    source_span: '{}',
    reviewed_by: null,
    reviewed_at: null,
    created_at: e.ahora,
  };
}

async function sembrarBiomarcadores(contexto: Contexto) {
  await sembrarExamenes(contexto);
  for (const biomarcador of BIOMARCADORES) {
    await upsertar(contexto.e, 'clinical.biomarker', filaDeBiomarcador(contexto.e, biomarcador));
  }
}

const DOCUMENTOS = [
  { clave: 'D-HC-1', tipo: 'historia_clinica', ocr: 'completado' },
  { clave: 'D-EX-1', tipo: 'examen', ocr: 'error' },
] as const;

async function sembrarDocumentos({ e, pacienteId, episodioId }: Contexto) {
  for (const documento of DOCUMENTOS) {
    await upsertar(e, 'clinical.document', {
      id: id(documento.clave),
      patient_id: pacienteId,
      episode_id: episodioId,
      document_type: documento.tipo,
      object_storage_key: `seed/p-chat/${documento.clave.toLowerCase()}.pdf`,
      checksum: `seed-checksum-${documento.clave.toLowerCase()}`,
      original_filename: `${documento.clave.toLowerCase()}.pdf`,
      mime_type: 'application/pdf',
      ocr_status: documento.ocr,
      pii_finding_types: null,
      attempts: 0,
      processing_started_at: null,
      uploaded_by: e.doctorId,
      uploaded_at: e.ahora,
      extracted_at: documento.ocr === 'completado' ? e.ahora : null,
    });
  }
}

async function sembrarTratamientoPrevio({ e, pacienteId, episodioId }: Contexto) {
  await upsertar(e, 'clinical.prior_treatment', {
    id: id('linea-1'),
    patient_id: pacienteId,
    episode_id: episodioId,
    source_document_id: null,
    line_number: 1,
    setting: 'neoadyuvante',
    regimen_name: 'quimioterapia neoadyuvante',
    atc_codes: [],
    cups_code: null,
    mapping_status: 'no_mapeado',
    started_at: fechaRelativa(e.ahora, 160),
    ended_at: fechaRelativa(e.ahora, 60),
    ongoing: false,
    end_reason: 'completado',
    best_response: null,
    ...PROCEDENCIA,
    source_span: null,
    created_at: e.ahora,
  });
}

async function sembrarCirugia({ e, pacienteId, episodioId }: Contexto) {
  await upsertar(e, 'clinical.clinical_event', {
    id: id('cirugia-1'),
    patient_id: pacienteId,
    episode_id: episodioId,
    source_document_id: null,
    event_type: 'cirugia',
    event_date: fechaRelativa(e.ahora, 40),
    date_precision: 'dia',
    description: 'cirugía conservadora',
    icd10_code: null,
    cups_code: null,
    mapping_status: 'n_a',
    toxicity_grade: null,
    prior_treatment_id: null,
    treatment_id: null,
    analysis_id: null,
    ...PROCEDENCIA,
    source_span: null,
    recorded_by: null,
    created_at: e.ahora,
  });
}

/** Texto libre con el nombre y el documento sintéticos: las pruebas de no fuga comprueban que no salen de clinical-api. */
async function sembrarNotaConPii({ e, pacienteId, episodioId }: Contexto) {
  await upsertar(e, 'clinical.clinical_note', {
    id: id('nota-1'),
    patient_id: pacienteId,
    episode_id: episodioId,
    source_document_id: null,
    created_by: e.doctorId,
    note_type: 'nota_libre',
    content: `Paciente ${NOMBRE_SINTETICO_CHAT}, documento ${DOCUMENTO_SINTETICO_CHAT}, refiere buena tolerancia.`,
    recorded_at: fechaRelativa(e.ahora, 30),
    is_active: true,
    ...PROCEDENCIA,
    supersedes_id: null,
    created_at: e.ahora,
  });
}

async function sembrarPacienteYEpisodio(e: EntradasDeLaSiembraDelChat, contexto: Contexto) {
  const inicio = fechaRelativa(e.ahora, 0);
  await upsertar(e, 'clinical.patient', {
    id: contexto.pacienteId,
    data_origin: 'sintetico',
    source_dataset: 'seed',
    agreement_reference: 'CONV-SEED-01',
    birth_year: 1970,
    sex: 'F',
    population: 'adulto',
    lifecycle_status: 'activo',
    retention_start: inicio,
    retention_until: sumarAnos(inicio, e.retencion.anosHastaRetencion),
    retention_max: sumarAnos(inicio, e.retencion.anosHastaRetencionMaxima),
    requires_ratification: false,
    created_at: e.ahora,
  });
  await upsertar(e, 'clinical.care_episode', {
    id: contexto.episodioId,
    patient_id: contexto.pacienteId,
    opened_at: e.ahora,
    closed_at: null,
    closure_reason: null,
    opened_by: e.doctorId,
    closed_by: null,
  });
  const resultado = await e.identidad.guardar({
    patientId: contexto.pacienteId,
    idType: 'sintetico',
    issuingCountry: null,
    numeroDeDocumento: DOCUMENTO_SINTETICO_CHAT,
    nombreCompleto: NOMBRE_SINTETICO_CHAT,
  });
  if (resultado === 'creada') e.contar('identity.patient_identity');
}

export async function sembrarPacienteChat(e: EntradasDeLaSiembraDelChat): Promise<void> {
  const contexto: Contexto = {
    e,
    pacienteId: idSembrado(PACIENTE_CHAT),
    episodioId: id('episodio'),
  };
  await sembrarPacienteYEpisodio(e, contexto);
  await sembrarDiagnosticoVerificado(contexto);
  await sembrarDiagnosticoEnConflicto(contexto);
  await sembrarBiomarcadores(contexto);
  await sembrarDocumentos(contexto);
  await sembrarTratamientoPrevio(contexto);
  await sembrarCirugia(contexto);
  await sembrarNotaConPii(contexto);
}
