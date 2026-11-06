import type { CaseView } from '../../../../../packages/api-contracts/src/client/clinical-api/index.js';
import type { EstadoDeRevisionVisible } from '../compartido/estados-de-revision.js';

/*
 * Glosario: «vista de caso» es `CaseView` (`GET …/case`); un «evento derivado» es el del timeline que sale de una
 * entidad con tabla propia (diagnóstico, examen, tratamiento previo, análisis; ADR-32) y un «evento clínico» es una
 * fila de `ClinicalEvent`. «Vigente» es no rechazado ni reemplazado (RN-07, `sqlDatoVigente()`).
 */

export type EventoDelTimeline = CaseView['timeline'][number];
export type TratamientoPrevioDelCaso = CaseView['priorTreatments'][number];
export type AtributoDelCaso = CaseView['attributes'][number];
export type SerieDelCaso = CaseView['biomarkerSeries'][number];
export type ChecklistDelCaso = CaseView['completeness'];

export type MetodoDeEntrada = 'ocr' | 'manual' | 'manual_correction' | 'seed';
export type ConfianzaDeExtraccion = 'alta' | 'media' | 'baja' | 'n_a';
export type PrecisionDeFecha = 'dia' | 'mes' | 'anio' | 'incierta';

/** Procedencia de una fila vigente: el estado `rechazado`/`reemplazado` nunca llega aquí (D9). */
export interface ProcedenciaDeFila {
  readonly entryMethod: MetodoDeEntrada;
  readonly extractionConfidence: ConfianzaDeExtraccion;
  readonly reviewStatus: EstadoDeRevisionVisible;
  readonly conflict: boolean;
  readonly sourceDocumentId: string | null;
}

/** Instante de creación en ISO UTC con microsegundos: ordena por texto igual que por tiempo. */
export type InstanteIso = string;
/** Fecha `YYYY-MM-DD`. */
export type FechaIso = string;

export interface DiagnosticoLeido {
  readonly id: string;
  readonly histology: string;
  readonly icd10Code: string | null;
  readonly diagnosedAt: FechaIso;
  readonly createdAt: InstanteIso;
  readonly procedencia: ProcedenciaDeFila;
}

/** Un biomarcador vigente con el examen del que cuelga (una sola consulta con `JOIN`, D12). */
export interface BiomarcadorLeido {
  readonly examId: string;
  readonly examType: string;
  readonly performedAt: FechaIso;
  readonly examCreatedAt: InstanteIso;
  readonly examEntryMethod: MetodoDeEntrada;
  readonly examSourceDocumentId: string | null;
  readonly biomarkerId: string;
  readonly name: string;
  readonly loincCode: string | null;
  readonly value: string;
  readonly unit: string | null;
  readonly extractionConfidence: ConfianzaDeExtraccion;
  readonly reviewStatus: EstadoDeRevisionVisible;
  readonly conflict: boolean;
}

export interface TratamientoPrevioLeido {
  readonly id: string;
  readonly lineNumber: number | null;
  readonly setting: string;
  readonly regimenName: string;
  readonly atcCodes: readonly string[];
  readonly cupsCode: string | null;
  readonly startedAt: FechaIso | null;
  readonly endedAt: FechaIso | null;
  readonly ongoing: boolean;
  readonly endReason: string;
  readonly createdAt: InstanteIso;
  readonly procedencia: ProcedenciaDeFila;
  readonly supersedesId: string | null;
}

export interface EventoClinicoLeido {
  readonly id: string;
  readonly eventType: string;
  readonly eventDate: FechaIso | null;
  readonly datePrecision: PrecisionDeFecha;
  readonly description: string;
  readonly icd10Code: string | null;
  readonly cupsCode: string | null;
  readonly createdAt: InstanteIso;
  readonly procedencia: ProcedenciaDeFila;
}

export interface AtributoLeido {
  readonly id: string;
  readonly key: string;
  readonly value: string;
  readonly observedAt: FechaIso | null;
  readonly procedencia: ProcedenciaDeFila;
  readonly supersedesId: string | null;
}

export type TipoDeRegistroDeIa = 'analisis_evidencia' | 'resumen_caso';

/** Del `AIAnalysisRecord` solo lo que el timeline necesita: nunca el análisis ni el contexto (RN-10). */
export interface RegistroDeIaLeido {
  readonly id: string;
  readonly analysisType: TipoDeRegistroDeIa;
  /** Fecha UTC de `created_at`. */
  readonly fecha: FechaIso;
  readonly createdAt: InstanteIso;
}

/** Todo lo vigente del paciente que la vista necesita, leído con una consulta por entidad. */
export interface DatosDelCaso {
  readonly diagnosticos: readonly DiagnosticoLeido[];
  readonly biomarcadores: readonly BiomarcadorLeido[];
  readonly tratamientos: readonly TratamientoPrevioLeido[];
  readonly eventos: readonly EventoClinicoLeido[];
  readonly atributos: readonly AtributoLeido[];
  readonly registrosDeIa: readonly RegistroDeIaLeido[];
}

export interface RepositorioDeLaVistaDeCaso {
  /** `true` si el paciente existe; no lee ningún dato clínico ni de `identity`. */
  existePaciente(patientId: string): Promise<boolean>;
  /** Los datos vigentes (RN-07) del paciente; lanza ante un fallo de la base, nunca devuelve datos parciales. */
  leerDatosDelCaso(patientId: string): Promise<DatosDelCaso>;
}

export interface CaseViewService {
  /** Lanza `PacienteNoEncontradoError` si el paciente no existe. */
  obtener(patientId: string): Promise<CaseView>;
}
