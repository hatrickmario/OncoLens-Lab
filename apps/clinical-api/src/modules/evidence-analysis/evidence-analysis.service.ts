import type { CasoRepository } from './evidence-analysis.repository.js';
import type { PeticionDeAnalisis } from './evidence-analysis.schema.js';
import type {
  AnalysisCompletion,
  CatalogVersionProvider,
  Clock,
  ContextDeidentifier,
  RagQueryClient,
  ResultadoDelAnalisis,
} from './ports.js';

/** El `patientId` de la petición no corresponde a ningún paciente. */
export class PacienteNoEncontradoError extends Error {
  constructor() {
    super('Paciente no encontrado');
    this.name = 'PacienteNoEncontradoError';
  }
}

export interface ConfiguracionDelAnalisis {
  /** `maxOptions` enviado a Backend 2 (`ANALYSIS_MAX_OPTIONS`, RN-22). */
  analysisMaxOptions: number;
  /** Años de antigüedad por defecto de la evidencia (`EVIDENCE_DEFAULT_YEARS`, RN-22). */
  evidenceDefaultYears: number;
}

export interface DependenciasDelService {
  casos: CasoRepository;
  deidentificador: ContextDeidentifier;
  rag: RagQueryClient;
  cierre: AnalysisCompletion;
  catalogo: CatalogVersionProvider;
  reloj: Clock;
  config: ConfiguracionDelAnalisis;
}

export interface SolicitudDeAnalisis {
  traceId: string;
  userId: string;
  peticion: PeticionDeAnalisis;
}

export interface EvidenceAnalysisService {
  solicitar(solicitud: SolicitudDeAnalisis): Promise<ResultadoDelAnalisis>;
}

export function crearEvidenceAnalysisService(
  _dependencias: DependenciasDelService,
): EvidenceAnalysisService {
  return {
    solicitar() {
      throw new Error('no implementado');
    },
  };
}
