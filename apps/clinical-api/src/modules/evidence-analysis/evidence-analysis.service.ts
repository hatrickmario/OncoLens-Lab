import type {
  ClinicalContext,
  DataClassification,
  RagQueryInternalRequest,
  SourcesSelected,
} from '../../../../../packages/api-contracts/src/client/rag-orchestrator/index.js';
import { exigirTipoCancer } from './case-guards.js';
import { construirContextoPermitido } from './clinical-context.builder.js';
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
  /** Plazo hacia rag-orchestrator en ms (`RAG_TIMEOUT_MS`, RN-22). */
  ragTimeoutMs: number;
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

export interface EntradaDelRequestInterno {
  traceId: string;
  query: string;
  sourcesSelected: SourcesSelected;
  dataClassification: DataClassification;
  catalogVersion: string;
  maxOptions: number;
  filtros: PeticionDeAnalisis['filtersApplied'];
  clinicalContext: ClinicalContext;
  anioActual: number;
  aniosPorDefecto: number;
}

/** Año mínimo efectivo: el de la petición; `null` = toda la evidencia; ausente = año actual menos el valor por defecto. */
function anioMinimoEfectivo(
  filtros: PeticionDeAnalisis['filtersApplied'],
  anioActual: number,
  aniosPorDefecto: number,
): number | null {
  const pedido = filtros?.publishedFromYear;
  return pedido === undefined ? anioActual - aniosPorDefecto : pedido;
}

/** `RagQueryInternalRequest` completo: filtros efectivos (cuatro booleanos y año) y nada que no esté en el contrato. */
export function armarRagQueryRequest(entrada: EntradaDelRequestInterno): RagQueryInternalRequest {
  const { filtros } = entrada;
  return {
    traceId: entrada.traceId,
    query: entrada.query,
    sourcesSelected: entrada.sourcesSelected,
    dataClassification: entrada.dataClassification,
    catalogVersion: entrada.catalogVersion,
    maxOptions: entrada.maxOptions,
    filtersApplied: {
      historiaCompleta: filtros?.historiaCompleta ?? false,
      soloBiomarcadoresRelevantes: filtros?.soloBiomarcadoresRelevantes ?? false,
      ultimosSeisMeses: filtros?.ultimosSeisMeses ?? false,
      antecedentesFamiliares: filtros?.antecedentesFamiliares ?? false,
      publishedFromYear: anioMinimoEfectivo(filtros, entrada.anioActual, entrada.aniosPorDefecto),
    },
    clinicalContext: entrada.clinicalContext,
  };
}

/**
 * Gateway de `POST /platform/evidence-analyses`: leer el caso → cortar si no hay tipo de cáncer → contexto por
 * allowlist → desidentificar → consultar a rag-orchestrator → cerrar el análisis. Los puertos llegan por la factory.
 */
export function crearEvidenceAnalysisService(
  dependencias: DependenciasDelService,
): EvidenceAnalysisService {
  const { casos, deidentificador, rag, cierre, catalogo, reloj, config } = dependencias;
  return {
    async solicitar({ traceId, userId, peticion }) {
      const caso = await casos.leerCaso(peticion.patientId);
      if (caso === null) throw new PacienteNoEncontradoError();
      exigirTipoCancer(caso);

      const ahora = reloj.now();
      const { contexto, dataRefs } = construirContextoPermitido(caso, ahora);
      const { clinicalContext, query } = await deidentificador.desidentificar({
        contexto,
        query: peticion.query,
        dataOrigin: caso.paciente.dataOrigin,
      });
      const request = armarRagQueryRequest({
        traceId,
        query,
        sourcesSelected: peticion.sourcesSelected,
        dataClassification: caso.paciente.dataOrigin,
        catalogVersion: catalogo.version(),
        maxOptions: config.analysisMaxOptions,
        filtros: peticion.filtersApplied,
        clinicalContext,
        anioActual: ahora.getUTCFullYear(),
        aniosPorDefecto: config.evidenceDefaultYears,
      });
      const respuesta = await rag.consultar(request);
      return cierre.completar({
        traceId,
        patientId: peticion.patientId,
        episodeId: caso.episodioId,
        userId,
        questionTemplateId: peticion.questionTemplateId ?? null,
        continueWithWarning: peticion.continueWithWarning,
        request,
        dataRefs,
        respuesta,
      });
    },
  };
}
