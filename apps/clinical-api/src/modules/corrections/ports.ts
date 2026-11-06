import type { AtributoAGuardar, PrecisionDeFecha } from '../clinical-attributes/ports.js';
import type { EstadoDeRevision } from '../compartido/estados-de-revision.js';
import type { PacienteBloqueable } from '../compartido/paciente-activo.js';
import type { MetodoDeEntrada } from '../manual-entry/ports.js';
import type { MotivoDeFin, TratamientoAGuardar } from '../prior-treatments/ports.js';

/*
 * Glosario: «corrección» es una fila nueva `manual_correction` verificada que apunta con `supersedes_id` a la vigente,
 * que pasa a `reemplazado` con su valor intacto (RN-08, ADR-50); «histórico» es la cadena de filas reemplazadas que se
 * recorre desde la vigente hacia atrás.
 */

export type TipoDeNota =
  'antecedente' | 'comorbilidad' | 'alergia' | 'antecedente_familiar' | 'nota_libre';

/** Biomarcador tal como está guardado, con lo que hace falta del examen que lo contiene. */
export interface BiomarcadorActual {
  readonly id: string;
  readonly examId: string;
  readonly episodeId: string;
  readonly examType: string;
  /** `YYYY-MM-DD` del examen (`performed_at`). */
  readonly performedAt: string;
  readonly name: string;
  /** Texto tal como lo escribió quien registró: la corrección lo conserva (D4). */
  readonly originalName: string;
  readonly value: string;
  readonly unit: string | null;
  /** `''` = sin rango registrado. */
  readonly referenceRange: string;
  readonly resultType: 'cuantitativo' | 'cualitativo';
  readonly reviewStatus: EstadoDeRevision;
}

export interface NotaActual {
  readonly id: string;
  readonly episodeId: string;
  readonly noteType: TipoDeNota;
  readonly content: string;
  /** `YYYY-MM-DD` (`recorded_at`): la nota corregida conserva la fecha de la anterior (D6). */
  readonly recordedAt: string;
  readonly reviewStatus: EstadoDeRevision;
}

/** Tratamiento previo tal como está guardado: los campos editables y lo que la corrección conserva (episodio). */
export interface TratamientoActual {
  readonly id: string;
  readonly episodeId: string;
  readonly lineNumber: number | null;
  readonly setting: string;
  /** Tal como lo escribió quien registró (dato clínico: nunca va a logs). */
  readonly regimenName: string;
  /** `YYYY-MM-DD` o `null`. */
  readonly startedAt: string | null;
  readonly endedAt: string | null;
  readonly ongoing: boolean;
  readonly endReason: MotivoDeFin;
  readonly reviewStatus: EstadoDeRevision;
}

/** Atributo clínico tal como está guardado: la clave es inmutable, el valor y la fecha se corrigen. */
export interface AtributoActual {
  readonly id: string;
  readonly episodeId: string;
  readonly attributeKey: string;
  readonly value: string;
  /** `YYYY-MM-DD` o `null`. */
  readonly observedAt: string | null;
  readonly datePrecision: PrecisionDeFecha;
  readonly reviewStatus: EstadoDeRevision;
}

export interface ExamenDeCorreccionAGuardar {
  readonly id: string;
  readonly patientId: string;
  readonly episodeId: string;
  readonly examType: string;
  readonly entryMethod: 'manual_correction';
  readonly performedAt: string;
  /** El examen anterior solo si el biomarcador corregido era su único dato vigente (D3); `null` en otro caso. */
  readonly supersedesId: string | null;
  readonly createdAt: Date;
}

/** La fila nueva de un biomarcador corregido: verificada, relevante por regla y sin extracción (convención manual). */
export interface BiomarcadorCorregidoAGuardar {
  readonly id: string;
  readonly examId: string;
  readonly name: string;
  readonly originalName: string;
  readonly loincCode: string | null;
  readonly mappingStatus: 'mapeado' | 'no_mapeado';
  readonly value: string;
  readonly unit: string | null;
  readonly referenceRange: string;
  readonly resultType: 'cuantitativo' | 'cualitativo';
  readonly clinicalSignificance: 'relevante';
  readonly significanceSource: 'regla';
  readonly extractionConfidence: 'n_a';
  readonly reviewStatus: 'verificado';
  readonly sourceSpan: '{}';
  readonly supersedesId: string;
  readonly reviewedBy: string;
  readonly reviewedAt: Date;
  readonly createdAt: Date;
}

export interface NotaCorregidaAGuardar {
  readonly id: string;
  readonly patientId: string;
  readonly episodeId: string;
  readonly createdBy: string;
  readonly noteType: TipoDeNota;
  readonly entryMethod: 'manual_correction';
  readonly content: string;
  readonly recordedAt: string;
  readonly isActive: true;
  readonly extractionConfidence: 'n_a';
  readonly reviewStatus: 'verificado';
  readonly supersedesId: string;
  readonly createdAt: Date;
}

/** Lo que `planDeCorreccion()` decide: qué filas se crean y cuál pasa a `reemplazado` (RN-08). */
export interface PlanDeCorreccionDeBiomarcador {
  readonly examen: ExamenDeCorreccionAGuardar;
  readonly biomarcador: BiomarcadorCorregidoAGuardar;
  readonly biomarcadorAReemplazar: string;
}

export interface PlanDeCorreccionDeTratamiento {
  /** La fila nueva: `manual_correction`, verificada, con `supersedesId` hacia la anterior. */
  readonly tratamiento: TratamientoAGuardar;
  readonly tratamientoAReemplazar: string;
}

export interface PlanDeCorreccionDeAtributo {
  readonly atributo: AtributoAGuardar;
  readonly atributoAReemplazar: string;
}

export interface PlanDeCorreccionDeNota {
  readonly nota: NotaCorregidaAGuardar;
  readonly notaAReemplazar: string;
}

export interface NotaVigente {
  readonly id: string;
  readonly noteType: TipoDeNota;
  readonly content: string;
  readonly recordedAt: string;
  readonly entryMethod: MetodoDeEntrada;
  readonly extractionConfidence: 'alta' | 'media' | 'baja' | 'n_a';
  readonly reviewStatus: 'auto_aceptado' | 'requiere_revision' | 'verificado' | 'corregido';
  readonly sourceDocumentId: string | null;
  readonly supersedesId: string | null;
}

/** Una versión reemplazada del histórico (de la más reciente a la más antigua). */
export interface VersionReemplazada {
  readonly id: string;
  readonly entryMethod: MetodoDeEntrada;
  /** `YYYY-MM-DD`: fecha del examen (biomarcador) o `recorded_at` (nota). */
  readonly recordedAt: string;
  readonly createdAt: Date;
  readonly value?: string;
  readonly unit?: string | null;
  readonly content?: string;
  readonly noteType?: TipoDeNota;
  /** Esquema de la versión reemplazada; solo en tratamientos previos. */
  readonly regimenName?: string;
}

/** Operaciones de UNA transacción de corrección (una sola conexión, paciente bloqueado). */
export interface TransaccionDeCorreccion extends PacienteBloqueable {
  /** `null` si el biomarcador no existe o es de otro paciente (404). */
  biomarcador(patientId: string, biomarkerId: string): Promise<BiomarcadorActual | null>;
  /** `null` si el tratamiento no existe o es de otro paciente (404). */
  tratamiento(patientId: string, treatmentId: string): Promise<TratamientoActual | null>;
  /** `null` si el atributo no existe o es de otro paciente (404). */
  atributo(patientId: string, attributeId: string): Promise<AtributoActual | null>;
  /** `null` si la nota no existe o es de otro paciente (404). */
  nota(patientId: string, noteId: string): Promise<NotaActual | null>;
  /** Biomarcadores vigentes del examen distintos de `exceptoId` (D3). */
  contarOtrosBiomarcadoresVigentes(examId: string, exceptoId: string): Promise<number>;
  /** Tipo de cáncer del diagnóstico vigente; `null` sin diagnóstico (la normalización decide `no_mapeado`). */
  tipoDeCancerVigente(patientId: string): Promise<string | null>;
  /** Inserta las filas nuevas y reemplaza las anteriores; `false` si el biomarcador ya no estaba vigente (D2). */
  guardarCorreccionDeBiomarcador(plan: PlanDeCorreccionDeBiomarcador): Promise<boolean>;
  /** Inserta el tratamiento nuevo y reemplaza el anterior; `false` si ya no estaba vigente (D2). */
  guardarCorreccionDeTratamiento(plan: PlanDeCorreccionDeTratamiento): Promise<boolean>;
  /** Inserta el atributo nuevo y reemplaza el anterior; `false` si ya no estaba vigente (D2). */
  guardarCorreccionDeAtributo(plan: PlanDeCorreccionDeAtributo): Promise<boolean>;
  /** Inserta la nota nueva y reemplaza la anterior; `false` si ya no estaba vigente (D2). */
  guardarCorreccionDeNota(plan: PlanDeCorreccionDeNota): Promise<boolean>;
}

export interface RepositorioDeCorrecciones {
  /** Ejecuta `trabajo` en una transacción: si lanza, se revierte todo (D1). */
  enTransaccion<T>(trabajo: (tx: TransaccionDeCorreccion) => Promise<T>): Promise<T>;
  /** Notas vigentes del paciente (la más reciente primero); `null` si el paciente no existe. */
  notasVigentes(patientId: string): Promise<readonly NotaVigente[] | null>;
  /** Cadena de versiones reemplazadas desde `biomarkerId`, tope `limite`; `null` si no existe o es de otro paciente. */
  historialDeBiomarcador(
    patientId: string,
    biomarkerId: string,
    limite: number,
  ): Promise<readonly VersionReemplazada[] | null>;
  historialDeNota(
    patientId: string,
    noteId: string,
    limite: number,
  ): Promise<readonly VersionReemplazada[] | null>;
  historialDeTratamiento(
    patientId: string,
    treatmentId: string,
    limite: number,
  ): Promise<readonly VersionReemplazada[] | null>;
  historialDeAtributo(
    patientId: string,
    attributeId: string,
    limite: number,
  ): Promise<readonly VersionReemplazada[] | null>;
}
