import type { Consultador } from '../auth/auth.repository.js';
import type { OrigenDeDatos } from './ports.js';

export type EstadoDeRevision = 'auto_aceptado' | 'requiere_revision' | 'verificado' | 'corregido';
export type MetodoDeIngreso = 'ocr' | 'manual' | 'manual_correction' | 'seed';
export type ConfianzaDeExtraccion = 'alta' | 'media' | 'baja' | 'n_a';

/** Campos de procedencia que comparten todas las filas clínicas que viajan en el contexto. */
export interface ProcedenciaDeFila {
  entryMethod: MetodoDeIngreso;
  extractionConfidence: ConfianzaDeExtraccion;
  reviewStatus: EstadoDeRevision;
  /** `conflicts_with_id` solo existe en diagnóstico y biomarcador; en el resto es `null`. */
  conflictsWithId: string | null;
}

/** Las fechas llegan como `AAAA-MM-DD` (texto): `pg` convertiría una `date` en un `Date` con zona local. */
export interface FilaDeDiagnostico extends ProcedenciaDeFila {
  id: string;
  cancerType: string;
  histology: string;
  grade: string | null;
  stagingSystem: string | null;
  stageValue: string | null;
  performanceScale: string | null;
  performanceValue: number | null;
  diagnosedAt: string;
}

export interface FilaDeBiomarcador extends ProcedenciaDeFila {
  id: string;
  name: string;
  value: string;
  resultType: 'cuantitativo' | 'cualitativo';
  clinicalSignificance: 'normal' | 'alterado' | 'relevante' | 'crítico';
  performedAt: string;
  createdAt: string;
}

export interface FilaDeAtributo extends ProcedenciaDeFila {
  id: string;
  attributeKey: string;
  value: string;
  observedAt: string | null;
}

export interface FilaDeTratamientoPrevio extends ProcedenciaDeFila {
  id: string;
  lineNumber: number | null;
  setting: string;
  regimenName: string;
  atcCodes: string[];
  startedAt: string | null;
  endedAt: string | null;
  ongoing: boolean;
  endReason: 'progresion' | 'toxicidad' | 'completado' | 'otro' | 'desconocido';
}

export interface FilaDeEvento extends ProcedenciaDeFila {
  id: string;
  eventType: string;
  eventDate: string | null;
  description: string;
}

/**
 * Todo lo que el gateway lee del caso: filas crudas, sin decidir qué viaja (eso es del builder). Las notas clínicas no
 * se leen: viajan vacías por minimización (readme §2.5) y un texto libre que no se lee no puede filtrarse.
 */
export interface CasoClinico {
  paciente: { id: string; dataOrigin: OrigenDeDatos; population: 'adulto' | 'pediatrico' };
  diagnosticoActivo: FilaDeDiagnostico | null;
  biomarcadores: FilaDeBiomarcador[];
  atributos: FilaDeAtributo[];
  tratamientosPrevios: FilaDeTratamientoPrevio[];
  eventos: FilaDeEvento[];
}

export interface CasoRepository {
  /** `null` si el paciente no existe. */
  leerCaso(patientId: string): Promise<CasoClinico | null>;
}

type Fila = Record<string, unknown>;

/** Los datos rechazados o reemplazados no entran al RAG (RN-07); el contrato de procedencia ni siquiera los admite. */
const SIN_RECHAZADOS = `review_status NOT IN ('rechazado', 'reemplazado')`;

function procedenciaDe(fila: Fila): ProcedenciaDeFila {
  return {
    entryMethod: fila['entry_method'] as MetodoDeIngreso,
    extractionConfidence: fila['extraction_confidence'] as ConfianzaDeExtraccion,
    reviewStatus: fila['review_status'] as EstadoDeRevision,
    conflictsWithId: (fila['conflicts_with_id'] as string | null | undefined) ?? null,
  };
}

function diagnosticoDe(fila: Fila): FilaDeDiagnostico {
  return {
    id: fila['id'] as string,
    cancerType: fila['cancer_type'] as string,
    histology: fila['histology'] as string,
    grade: fila['grade'] as string | null,
    stagingSystem: fila['staging_system'] as string | null,
    stageValue: fila['stage_value'] as string | null,
    performanceScale: fila['performance_scale'] as string | null,
    performanceValue: fila['performance_value'] as number | null,
    diagnosedAt: fila['diagnosed_at'] as string,
    ...procedenciaDe(fila),
  };
}

function biomarcadorDe(fila: Fila): FilaDeBiomarcador {
  return {
    id: fila['id'] as string,
    name: fila['name'] as string,
    value: fila['value'] as string,
    resultType: fila['result_type'] as FilaDeBiomarcador['resultType'],
    clinicalSignificance: fila[
      'clinical_significance'
    ] as FilaDeBiomarcador['clinicalSignificance'],
    performedAt: fila['performed_at'] as string,
    createdAt: (fila['created_at'] as Date).toISOString(),
    ...procedenciaDe(fila),
  };
}

function atributoDe(fila: Fila): FilaDeAtributo {
  return {
    id: fila['id'] as string,
    attributeKey: fila['attribute_key'] as string,
    value: fila['value'] as string,
    observedAt: fila['observed_at'] as string | null,
    ...procedenciaDe(fila),
  };
}

function tratamientoPrevioDe(fila: Fila): FilaDeTratamientoPrevio {
  return {
    id: fila['id'] as string,
    lineNumber: fila['line_number'] as number | null,
    setting: fila['setting'] as string,
    regimenName: fila['regimen_name'] as string,
    atcCodes: fila['atc_codes'] as string[],
    startedAt: fila['started_at'] as string | null,
    endedAt: fila['ended_at'] as string | null,
    ongoing: fila['ongoing'] as boolean,
    endReason: fila['end_reason'] as FilaDeTratamientoPrevio['endReason'],
    ...procedenciaDe(fila),
  };
}

function eventoDe(fila: Fila): FilaDeEvento {
  return {
    id: fila['id'] as string,
    eventType: fila['event_type'] as string,
    eventDate: fila['event_date'] as string | null,
    description: fila['description'] as string,
    ...procedenciaDe(fila),
  };
}

/** Las consultas van de una en una: `pg.Client` no admite consultas concurrentes y el caso son cinco lecturas cortas. */
type Leer = (sql: string) => Promise<Fila[]>;

async function leerDiagnosticoActivo(leer: Leer): Promise<FilaDeDiagnostico | null> {
  const [fila] = await leer(
    `SELECT id, cancer_type, histology, grade, staging_system, stage_value, performance_scale,
            performance_value, diagnosed_at::text AS diagnosed_at, entry_method,
            extraction_confidence, review_status, conflicts_with_id
       FROM clinical.diagnosis
      WHERE patient_id = $1 AND is_active AND ${SIN_RECHAZADOS}
      ORDER BY diagnosed_at DESC, created_at DESC
      LIMIT 1`,
  );
  return fila === undefined ? null : diagnosticoDe(fila);
}

async function leerBiomarcadores(leer: Leer): Promise<FilaDeBiomarcador[]> {
  const filas = await leer(
    `SELECT b.id, b.name, b.value, b.result_type, b.clinical_significance, b.created_at,
            e.performed_at::text AS performed_at, e.entry_method, b.extraction_confidence,
            b.review_status, b.conflicts_with_id
       FROM clinical.biomarker b JOIN clinical.exam e ON e.id = b.exam_id
      WHERE e.patient_id = $1 AND b.${SIN_RECHAZADOS}
      ORDER BY e.performed_at DESC, b.created_at DESC`,
  );
  return filas.map(biomarcadorDe);
}

async function leerAtributos(leer: Leer): Promise<FilaDeAtributo[]> {
  const filas = await leer(
    `SELECT id, attribute_key, value, observed_at::text AS observed_at, entry_method,
            extraction_confidence, review_status
       FROM clinical.clinical_attribute
      WHERE patient_id = $1 AND ${SIN_RECHAZADOS}
      ORDER BY attribute_key, observed_at DESC NULLS LAST`,
  );
  return filas.map(atributoDe);
}

async function leerTratamientosPrevios(leer: Leer): Promise<FilaDeTratamientoPrevio[]> {
  const filas = await leer(
    `SELECT id, line_number, setting, regimen_name, atc_codes, started_at::text AS started_at,
            ended_at::text AS ended_at, ongoing, end_reason, entry_method,
            extraction_confidence, review_status
       FROM clinical.prior_treatment
      WHERE patient_id = $1 AND ${SIN_RECHAZADOS}
      ORDER BY line_number NULLS LAST, started_at NULLS LAST`,
  );
  return filas.map(tratamientoPrevioDe);
}

/** Los eventos con `analysis_id` son el reflejo de un análisis previo en el timeline: no son datos clínicos. */
async function leerEventos(leer: Leer): Promise<FilaDeEvento[]> {
  const filas = await leer(
    `SELECT id, event_type, event_date::text AS event_date, description, entry_method,
            extraction_confidence, review_status
       FROM clinical.clinical_event
      WHERE patient_id = $1 AND analysis_id IS NULL AND ${SIN_RECHAZADOS}
      ORDER BY event_date NULLS LAST, created_at`,
  );
  return filas.map(eventoDe);
}

/**
 * Lectura del caso con `pg` sobre el pool inyectado de `server.ts` (migración a Prisma = deuda D-1). Solo lee las
 * columnas que el builder usa: las notas, la identidad y la referencia del convenio no se leen. Las fechas llegan como
 * texto `AAAA-MM-DD` para que la zona horaria del proceso no mueva el día.
 */
export function createEvidenceAnalysisRepository(db: Consultador): CasoRepository {
  return {
    async leerCaso(patientId) {
      const leer: Leer = async (sql) => (await db.query(sql, [patientId])).rows;
      const [paciente] = await leer(
        'SELECT id, data_origin, population FROM clinical.patient WHERE id = $1',
      );
      if (paciente === undefined) return null;
      return {
        paciente: {
          id: paciente['id'] as string,
          dataOrigin: paciente['data_origin'] as OrigenDeDatos,
          population: paciente['population'] as 'adulto' | 'pediatrico',
        },
        diagnosticoActivo: await leerDiagnosticoActivo(leer),
        biomarcadores: await leerBiomarcadores(leer),
        atributos: await leerAtributos(leer),
        tratamientosPrevios: await leerTratamientosPrevios(leer),
        eventos: await leerEventos(leer),
      };
    },
  };
}
