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

export interface FilaDeNota extends ProcedenciaDeFila {
  id: string;
  noteType: string;
  content: string;
  recordedAt: string;
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

/** Todo lo que el gateway lee del caso: filas crudas, sin decidir qué viaja (eso es del builder). */
export interface CasoClinico {
  paciente: { id: string; dataOrigin: OrigenDeDatos; population: 'adulto' | 'pediatrico' };
  diagnosticoActivo: FilaDeDiagnostico | null;
  biomarcadores: FilaDeBiomarcador[];
  notas: FilaDeNota[];
  atributos: FilaDeAtributo[];
  tratamientosPrevios: FilaDeTratamientoPrevio[];
  eventos: FilaDeEvento[];
}

export interface CasoRepository {
  /** `null` si el paciente no existe. */
  leerCaso(patientId: string): Promise<CasoClinico | null>;
}

export function createEvidenceAnalysisRepository(_db: Consultador): CasoRepository {
  return {
    leerCaso() {
      throw new Error('no implementado');
    },
  };
}
