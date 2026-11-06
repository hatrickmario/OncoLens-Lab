import type { LecturaDeTratamientosVigentes } from '../compartido/declaracion-de-ausencia.js';
import type { PacienteBloqueable } from '../compartido/paciente-activo.js';

/*
 * Glosario: «atributo clínico» es un par clave-valor del paciente (estado menopáusico, estado de castración, sitios
 * metastásicos) que el catálogo declara por tipo de cáncer (RN-29); «atributo permitido» es una clave del catálogo con
 * la lista de valores que admite.
 */

export interface ValorPermitido {
  readonly value: string;
  readonly label: string;
}

export interface AtributoPermitido {
  readonly key: string;
  readonly label: string;
  readonly values: readonly ValorPermitido[];
}

/** Puerto de lectura de `atributos.json` del catálogo montado (RN-29): la única lista de atributos del sistema. */
export interface CatalogoDeAtributos {
  version(): string;
  /** Atributos declarados para el tipo de cáncer; un tipo sin atributos devuelve `[]`. */
  atributosPermitidos(tipoDeCancer: string): readonly AtributoPermitido[];
}

export type PrecisionDeFecha = 'dia' | 'mes' | 'anio' | 'incierta';

/** Fila de `clinical.clinical_attribute` de un registro manual: nace vigente y verificada (sin OCR, sin documento). */
export interface AtributoAGuardar {
  readonly id: string;
  readonly patientId: string;
  readonly episodeId: string;
  readonly attributeKey: string;
  /** Dato clínico: nunca va a logs. */
  readonly value: string;
  readonly observedAt: string | null;
  readonly datePrecision: PrecisionDeFecha;
  readonly entryMethod: 'manual' | 'manual_correction';
  readonly extractionConfidence: 'n_a';
  readonly reviewStatus: 'verificado';
  readonly createdAt: Date;
  /** Fila a la que esta corrección reemplazó (ADR-50, d5fb-05); `null` en un registro nuevo. */
  readonly supersedesId: string | null;
}

/** Atributo vigente tal como lo lee la lista (con su procedencia). */
export interface AtributoLeido {
  readonly id: string;
  readonly attributeKey: string;
  readonly value: string;
  readonly observedAt: string | null;
  readonly datePrecision: PrecisionDeFecha;
  readonly entryMethod: 'ocr' | 'manual' | 'manual_correction' | 'seed';
  readonly extractionConfidence: 'alta' | 'media' | 'baja' | 'n_a';
  readonly reviewStatus: 'auto_aceptado' | 'requiere_revision' | 'verificado' | 'corregido';
  readonly sourceDocumentId: string | null;
  readonly supersedesId: string | null;
}

/** Operaciones de UNA transacción (el repository las ejecuta sobre una sola conexión). */
export interface TransaccionDeAtributo extends PacienteBloqueable, LecturaDeTratamientosVigentes {
  existePaciente(patientId: string): Promise<boolean>;
  episodioDelRegistro(patientId: string): Promise<string>;
  /** Tipo de cáncer del diagnóstico vigente; `null` si el paciente no tiene ninguno. */
  tipoDeCancerVigente(patientId: string): Promise<string | null>;
  guardarAtributo(atributo: AtributoAGuardar): Promise<void>;
  /** Solo los vigentes (sin `rechazado` ni `reemplazado`, RN-07), ordenados por clave y fecha (nulos al final). */
  atributosVigentes(patientId: string): Promise<readonly AtributoLeido[]>;
}

export interface RepositorioDeAtributos {
  /** Ejecuta `trabajo` en una transacción: si lanza, se revierte todo. */
  enTransaccion<T>(trabajo: (tx: TransaccionDeAtributo) => Promise<T>): Promise<T>;
}
