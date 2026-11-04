import type { TiposDeCancerHabilitados } from '../../infrastructure/tipos-de-cancer-habilitados.js';
import type { CatalogoDeDatosCriticos } from '../completeness/ports.js';
import type { PacienteBloqueable } from '../compartido/paciente-activo.js';
import type { EstadoDeRevisionVisible } from '../compartido/estados-de-revision.js';
import type { CatalogoTerminologico } from '../reconciliation/ports.js';

/*
 * Glosario: «registro manual» es el dato que el oncólogo escribe a mano (no extraído de un documento); «corrección» es
 * un diagnóstico nuevo que reemplaza al vigente sin tocar sus valores (RN-08); «gradación de referencia» es la de la
 * que se deriva el texto de `Diagnosis.grade` (DEC-05).
 */

/** Puerto de lectura de `escalas.json` del catálogo montado (L1D-90, D6, RN-29). */
export interface CatalogoDeEscalas {
  version(): string;
  sistemaDeEstadificacionValido(sistema: string, tipoDeCancer: string): boolean;
  /** Rango inclusivo de la escala funcional; `undefined` si la escala no está en el catálogo. */
  rangoDeEscala(escala: string): { readonly minimo: number; readonly maximo: number } | undefined;
  sistemaDeGradacionValido(sistema: string, tipoDeCancer: string): boolean;
  /** Sistemas de estadificación del tipo de cáncer, en el orden del catálogo (los que ofrece el formulario, RN-29). */
  sistemasDeEstadificacion(tipoDeCancer: string): readonly string[];
  /** Escalas funcionales con su rango inclusivo, en el orden del catálogo. */
  escalasFuncionales(): readonly {
    readonly codigo: string;
    readonly minimo: number;
    readonly maximo: number;
  }[];
  /** Sistemas de gradación del tipo de cáncer, en el orden del catálogo. */
  sistemasDeGradacion(tipoDeCancer: string): readonly string[];
}

/** Lo que `opcionesDeRegistroManual` lee del catálogo montado: escalas, términos, datos críticos y tipos de cáncer. */
export interface FuenteDeOpciones {
  readonly escalas: CatalogoDeEscalas;
  readonly terminologia: CatalogoTerminologico;
  readonly datosCriticos: CatalogoDeDatosCriticos;
  /** Tipos del `manifest.json`, en su orden; los habilitados son los que `tiposHabilitados` acepta (RN-20). */
  readonly tiposDelCatalogo: readonly string[];
  readonly tiposHabilitados: TiposDeCancerHabilitados;
}

export type SistemaDeGradacion = 'gleason_isup' | 'nottingham';
export type MetodoDeEntrada = 'ocr' | 'manual' | 'manual_correction' | 'seed';
export type ConfianzaDeExtraccion = 'alta' | 'media' | 'baja' | 'n_a';

/** Procedencia que se copia tal cual al duplicar una gradación al diagnóstico de la corrección. */
export interface ProcedenciaDeGradacion {
  readonly entryMethod: MetodoDeEntrada;
  readonly extractionConfidence: ConfianzaDeExtraccion;
  readonly extractionScore: number | null;
  readonly reviewStatus: EstadoDeRevisionVisible;
  readonly sourceDocumentId: string | null;
  readonly reviewedBy: string | null;
  readonly reviewedAt: Date | null;
}

export interface GradacionGuardada extends ProcedenciaDeGradacion {
  readonly id: string;
  readonly gradingSystem: SistemaDeGradacion;
  readonly specimenType: string | null;
  readonly gradeScope: string | null;
  readonly gleasonPrimaryPattern: number | null;
  readonly gleasonSecondaryPattern: number | null;
  readonly gleasonScore: number | null;
  readonly isupGradeGroup: number | null;
  readonly nottinghamGrade: number | null;
  readonly isReference: boolean;
  readonly createdAt: Date;
}

/** Gradación que se inserta bajo un diagnóstico nuevo (id nuevo, referencia recalculada). */
export interface GradacionAGuardar extends GradacionGuardada {
  readonly diagnosisId: string;
}

/** Valores clínicos de un diagnóstico (lo que `fusionarCorreccion` combina). */
export interface DatosDelDiagnostico {
  readonly cancerType: string;
  readonly icd10Code: string | null;
  readonly mappingStatus: 'mapeado' | 'no_mapeado';
  readonly histology: string | null;
  readonly histologyCode: string | null;
  readonly grade: string | null;
  readonly stagingSystem: string | null;
  readonly stageValue: string | null;
  readonly performanceScale: string | null;
  readonly performanceValue: number | null;
  readonly diagnosedAt: string;
}

export interface DiagnosticoVigente {
  readonly id: string;
  readonly datos: DatosDelDiagnostico;
  readonly gradaciones: readonly GradacionGuardada[];
}

export interface DiagnosticoAGuardar extends DatosDelDiagnostico {
  readonly id: string;
  readonly patientId: string;
  readonly episodeId: string;
  readonly entryMethod: 'manual' | 'manual_correction';
  /** Un diagnóstico manual nace vigente y verificado (RN-08). */
  readonly isActive: true;
  readonly extractionConfidence: 'n_a';
  readonly reviewStatus: 'verificado';
  readonly reviewedBy: string;
  readonly reviewedAt: Date;
  readonly createdAt: Date;
}

export interface ExamenAGuardar {
  readonly id: string;
  readonly examType: 'registro_manual';
  readonly entryMethod: 'manual';
  readonly patientId: string;
  readonly episodeId: string;
  readonly performedAt: string;
  readonly createdAt: Date;
}

export interface BiomarcadorAGuardar {
  readonly id: string;
  readonly examId: string;
  readonly name: string;
  readonly originalName: string;
  readonly loincCode: string | null;
  readonly mappingStatus: 'mapeado' | 'no_mapeado';
  readonly value: string;
  readonly unit: string | null;
  readonly resultType: 'cuantitativo' | 'cualitativo';
  /** Convención del dato manual (`[S5 resp. 13]`): relevante por regla; sin rango, sin texto fuente, sin confianza de extracción. */
  readonly clinicalSignificance: 'relevante';
  readonly significanceSource: 'regla';
  readonly extractionConfidence: 'n_a';
  readonly reviewStatus: 'verificado';
  readonly referenceRange: '';
  readonly sourceSpan: '{}';
  readonly reviewedBy: string;
  readonly reviewedAt: Date;
  readonly createdAt: Date;
}

/** Operaciones de UNA transacción de registro manual (el repository las ejecuta sobre una sola conexión). */
export interface TransaccionDeRegistro extends PacienteBloqueable {
  /** Episodio al que se asocia el registro: el abierto, o el más reciente. */
  episodioDelRegistro(patientId: string): Promise<string>;
  /** Diagnóstico vigente (activo, no rechazado ni reemplazado) con sus gradaciones; `null` si no hay. */
  diagnosticoVigente(patientId: string): Promise<DiagnosticoVigente | null>;
  guardarBiomarcador(examen: ExamenAGuardar, biomarcador: BiomarcadorAGuardar): Promise<void>;
  /** Inserta el diagnóstico nuevo (activo, verificado) con sus gradaciones y, si `reemplazaA`, deja ese como `reemplazado` e inactivo. */
  guardarDiagnostico(
    nuevo: DiagnosticoAGuardar,
    gradaciones: readonly GradacionAGuardar[],
    reemplazaA: string | null,
  ): Promise<void>;
}

export interface RepositorioDeRegistroManual {
  /** Tipo de cáncer del diagnóstico vigente (`null` sin vigente); `undefined` si el paciente no existe. Lectura sin bloqueo. */
  tipoDeCancerVigente(
    patientId: string,
  ): Promise<{ readonly tipoDeCancer: string | null } | undefined>;
  /** Ejecuta `trabajo` en una transacción: si lanza, se revierte todo (D8). */
  enTransaccion<T>(trabajo: (tx: TransaccionDeRegistro) => Promise<T>): Promise<T>;
}
