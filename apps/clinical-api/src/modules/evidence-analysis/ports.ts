import type {
  AnalysisBasis,
  EvidenceAnalysis,
} from '../../../../../packages/api-contracts/src/client/clinical-api/index.js';
import type {
  ClinicalContext,
  DataClassification,
  RagQueryInternalRequest,
  RagQueryInternalResponse,
} from '../../../../../packages/api-contracts/src/client/rag-orchestrator/index.js';
import type { Clock } from '../../infrastructure/clock.js';

export type { Clock };

/** Generador de identificadores de correlación inyectable (nada de `Date.now()` ni `Math.random()` en el dominio). */
export interface TraceIdGenerator {
  /** `req_` + alfanumérico (patrón `^req_[A-Za-z0-9]{8,32}$` del contrato). */
  traceId(): string;
}

/** Seudónimo `psd_…` aleatorio POR CONSULTA (RN-11); nunca derivado del paciente. */
export interface PseudonymGenerator {
  nuevo(): string;
}

/** Versión del catálogo clínico que consume este despliegue (`manifest.json`). */
export interface CatalogVersionProvider {
  version(): string;
}

export type OrigenDeDatos = DataClassification;

/** Contexto que arma `construirContextoPermitido()`: todo el `ClinicalContext` salvo el seudónimo. */
export type ContextoPermitido = Omit<ClinicalContext, 'pseudoPatientId'>;

/** Qué dato del paciente respalda cada `dataRef` (no viaja a Backend 2; lo persiste L1D-104 en `patient_data_links`). */
export interface EnlaceDeDato {
  tabla: 'diagnosis' | 'biomarker' | 'clinical_attribute' | 'prior_treatment' | 'clinical_event';
  id: string;
}
export type MapaDeDataRefs = ReadonlyMap<string, EnlaceDeDato>;

export interface EntradaDeDesidentificacion {
  /** Correlación de los logs de la desidentificación (nunca de contenido). */
  traceId: string;
  /** Paciente del caso: solo sirve para leer su identidad conocida dentro de `desidentificar()`. */
  patientId: string;
  contexto: ContextoPermitido;
  query: string;
  dataOrigin: OrigenDeDatos;
}

/** Identidad conocida del paciente (y de su representante) con la que se compara el texto libre (RN-10, RN-11). */
export interface IdentidadDelPaciente {
  nombreCompleto: string;
  documento: string;
  telefono?: string | null;
  representante?: { nombreCompleto: string; documento: string } | null;
}

/** Lee la identidad conocida; `null` = sin identidad registrada. En el S1 no hay identidad almacenada (US-046, S2). */
export interface PatientIdentityReader {
  leer(patientId: string): Promise<IdentidadDelPaciente | null>;
}

/** Texto ya enmascarado y los TIPOS de lo detectado (nunca sus valores). */
export interface ResultadoDeEnmascarado {
  texto: string;
  findingTypes: string[];
  /** Cuántas coincidencias se sustituyeron. */
  hallazgos: number;
}

/** Detector de PII (ADR-40): el adapter del S1 es la opción A (identidad conocida + formatos configurados). */
export interface PiiDetector {
  enmascarar(texto: string): ResultadoDeEnmascarado;
}

/** Un detector por consulta: su identidad conocida vive solo mientras dura `desidentificar()`. */
export interface PiiDetectorFactory {
  para(identidad: IdentidadDelPaciente | null): PiiDetector;
}

export interface SalidaDeDesidentificacion {
  clinicalContext: ClinicalContext;
  query: string;
}

/** Desidentificación (RN-10, RN-11): `crearContextDeidentifier()` (L1D-203). */
export interface ContextDeidentifier {
  desidentificar(entrada: EntradaDeDesidentificacion): Promise<SalidaDeDesidentificacion>;
}

export interface OpcionesDeConsultaRag {
  /** Valor de la cabecera `X-Request-Deadline` (parámetro tipado de la operación; lo calcula L1D-104). */
  deadline?: string;
  /** Aborta la llamada al vencer `RAG_TIMEOUT_MS`. */
  signal?: AbortSignal;
}

/** Fallo de la llamada a rag-orchestrator: `status` null = sin respuesta HTTP; `codigo` es el `error` de su cuerpo. */
export interface FalloDeRag {
  ok: false;
  status: number | null;
  codigo?: string | null;
  /** La llamada se abortó porque venció el plazo local (`RAG_TIMEOUT_MS`). */
  tiempoAgotado?: boolean;
}

export type RespuestaDeRag = { ok: true; cuerpo: RagQueryInternalResponse } | FalloDeRag;

/** Cliente de `/rag/query`: el SDK generado de L1D-105 sobre el transporte con JWT de servicio. */
export interface RagQueryClient {
  consultar(
    request: RagQueryInternalRequest,
    opciones?: OpcionesDeConsultaRag,
  ): Promise<RespuestaDeRag>;
}

export interface EntradaDeCierre {
  traceId: string;
  patientId: string;
  /** Episodio de atención del paciente al que se asocia el registro (`episode_id`). */
  episodeId: string | null;
  userId: string;
  questionTemplateId: string | null;
  continueWithWarning: boolean;
  request: RagQueryInternalRequest;
  dataRefs: MapaDeDataRefs;
  respuesta: RespuestaDeRag;
}

/** Respuesta HTTP de un fallo de rag-orchestrator ya traducida (`mapearFalloRag()`), sin eco de su cuerpo. */
export interface RespuestaDeFallo {
  status: 409 | 422 | 502 | 503 | 504;
  codigo:
    | 'CATALOG_VERSION_MISMATCH'
    | 'TIPO_CANCER_NO_REGISTRADO'
    | 'ERROR_SERVICIO_IA'
    | 'LOCAL_LLM_UNAVAILABLE'
    | 'DEADLINE_VENCIDO';
  /** Etiqueta del log (sin PHI). */
  resultado: string;
}

export type ResultadoDelAnalisis =
  { tipo: 'completado'; cuerpo: EvidenceAnalysis } | { tipo: 'fallo'; respuesta: RespuestaDeFallo };

/** Base del análisis (FR-27): el adaptador del S1 es mínimo; US-066 (S2) lo sustituye sin tocar el service. */
export interface AnalysisBasisBuilder {
  construir(
    request: RagQueryInternalRequest,
    respuesta: RagQueryInternalResponse,
    continueWithWarning: boolean,
  ): AnalysisBasis;
}

/** Cierre del análisis: persistir el `AIAnalysisRecord` ANTES de responder (RN-06). Lo implementa L1D-104. */
export interface AnalysisCompletion {
  completar(entrada: EntradaDeCierre): Promise<ResultadoDelAnalisis>;
}
