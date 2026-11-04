import type { PacienteBloqueable } from '../compartido/paciente-activo.js';

/*
 * Glosario: «tratamiento previo» es una línea de tratamiento anterior a la consulta, escrita a mano por el oncólogo;
 * «decisión» es lo que `ReconciliationService` resuelve para su esquema (códigos ATC y `mapping_status`, RN-27).
 */

export type MotivoDeFin = 'progresion' | 'toxicidad' | 'completado' | 'otro' | 'desconocido';

/** Fila de `clinical.prior_treatment` de un registro manual: nace vigente y verificada (sin OCR, sin documento). */
export interface TratamientoAGuardar {
  readonly id: string;
  readonly patientId: string;
  readonly episodeId: string;
  readonly lineNumber: number | null;
  readonly setting: string;
  /** Tal como lo escribió quien registra (dato clínico: nunca va a logs). */
  readonly regimenName: string;
  /** Solo códigos ATC del catálogo versionado; vacío sin mapeo (RN-27). */
  readonly atcCodes: readonly string[];
  readonly mappingStatus: 'mapeado' | 'no_mapeado';
  readonly startedAt: string | null;
  readonly endedAt: string | null;
  readonly ongoing: boolean;
  readonly endReason: MotivoDeFin;
  readonly entryMethod: 'manual';
  readonly extractionConfidence: 'n_a';
  readonly reviewStatus: 'verificado';
  readonly createdAt: Date;
}

/** Operaciones de UNA transacción de registro (el repository las ejecuta sobre una sola conexión). */
export interface TransaccionDeTratamiento extends PacienteBloqueable {
  /** Episodio al que se asocia el registro: el abierto, o el más reciente. */
  episodioDelRegistro(patientId: string): Promise<string>;
  /** Tipo de cáncer del diagnóstico vigente; `null` si el paciente no tiene ninguno. */
  tipoDeCancerVigente(patientId: string): Promise<string | null>;
  guardarTratamiento(tratamiento: TratamientoAGuardar): Promise<void>;
}

export interface RepositorioDeTratamientos {
  /** Ejecuta `trabajo` en una transacción: si lanza, se revierte todo. */
  enTransaccion<T>(trabajo: (tx: TransaccionDeTratamiento) => Promise<T>): Promise<T>;
}
