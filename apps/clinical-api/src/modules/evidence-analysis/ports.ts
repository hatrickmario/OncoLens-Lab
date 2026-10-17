import type {
  ClinicalContext,
  DataClassification,
  RagQueryInternalRequest,
  RagQueryInternalResponse,
} from '../../../../../packages/api-contracts/src/client/rag-orchestrator/index.js';
import type { Clock } from '../../infrastructure/clock.js';

export type { Clock };

/** Generador de identificadores de correlación inyectable (nada de `Date.now()` ni `Math.random()` en el dominio). */
export interface IdGenerator {
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
  contexto: ContextoPermitido;
  query: string;
  dataOrigin: OrigenDeDatos;
}

export interface SalidaDeDesidentificacion {
  clinicalContext: ClinicalContext;
  query: string;
}

/** Desidentificación (RN-10, RN-11). El adaptador definitivo es de L1D-203; el de este change es provisional. */
export interface ContextDeidentifier {
  desidentificar(entrada: EntradaDeDesidentificacion): Promise<SalidaDeDesidentificacion>;
}

export interface OpcionesDeConsultaRag {
  /** Valor de la cabecera `X-Request-Deadline` (parámetro tipado de la operación; lo calcula L1D-104). */
  deadline?: string;
}

export type RespuestaDeRag =
  { ok: true; cuerpo: RagQueryInternalResponse } | { ok: false; status: number | null };

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
  userId: string;
  request: RagQueryInternalRequest;
  dataRefs: MapaDeDataRefs;
  respuesta: RespuestaDeRag;
}

export type ResultadoDelAnalisis =
  { tipo: 'completado'; cuerpo: unknown } | { tipo: 'error_servicio_ia' };

/** Cierre del análisis: persistir el `AIAnalysisRecord` ANTES de responder (RN-06). Lo implementa L1D-104. */
export interface AnalysisCompletion {
  completar(entrada: EntradaDeCierre): Promise<ResultadoDelAnalisis>;
}
