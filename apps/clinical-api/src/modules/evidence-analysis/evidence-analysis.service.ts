import type { AppliedFilters } from '../../../../../packages/api-contracts/src/client/clinical-api/index.js';
import type {
  ClinicalContext,
  DataClassification,
  RagQueryInternalRequest,
  SourcesSelected,
} from '../../../../../packages/api-contracts/src/client/rag-orchestrator/index.js';
import { exigirTipoCancer, alcanceDelTipo } from './case-guards.js';
import {
  construirContextoPermitido,
  construirContextoSinDatosClinicos,
} from './clinical-context.builder.js';
import type { CasoClinico, CasoRepository } from './evidence-analysis.repository.js';
import type { PeticionDeAnalisis } from './evidence-analysis.schema.js';
import type {
  AnalysisCompletion,
  CatalogVersionProvider,
  ChecklistDeFaltantes,
  Clock,
  ContextDeidentifier,
  RagQueryClient,
  RespuestaDeRag,
  ResultadoDelAnalisis,
  TiposDeCancerHabilitados,
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
  desidentificador: ContextDeidentifier;
  rag: RagQueryClient;
  cierre: AnalysisCompletion;
  catalogo: CatalogVersionProvider;
  /** Faltantes críticos calculados en el servidor en cada análisis (US-006). */
  checklist: ChecklistDeFaltantes;
  /** `ENABLED_CANCER_TYPES` validada contra el manifiesto (RN-20). */
  tiposHabilitados: TiposDeCancerHabilitados;
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

/** Filtros efectivos de la petición (cuatro booleanos y año): los que viajan a Backend 2 y los que quedan en la Base. */
export function filtrosEfectivos(
  filtros: PeticionDeAnalisis['filtersApplied'],
  anioActual: number,
  aniosPorDefecto: number,
): AppliedFilters {
  return {
    historiaCompleta: filtros?.historiaCompleta ?? false,
    soloBiomarcadoresRelevantes: filtros?.soloBiomarcadoresRelevantes ?? false,
    ultimosSeisMeses: filtros?.ultimosSeisMeses ?? false,
    antecedentesFamiliares: filtros?.antecedentesFamiliares ?? false,
    publishedFromYear: anioMinimoEfectivo(filtros, anioActual, aniosPorDefecto),
  };
}

/** `RagQueryInternalRequest` completo: filtros efectivos (cuatro booleanos y año) y nada que no esté en el contrato. */
export function armarRagQueryRequest(entrada: EntradaDelRequestInterno): RagQueryInternalRequest {
  return {
    traceId: entrada.traceId,
    query: entrada.query,
    sourcesSelected: entrada.sourcesSelected,
    dataClassification: entrada.dataClassification,
    catalogVersion: entrada.catalogVersion,
    maxOptions: entrada.maxOptions,
    filtersApplied: filtrosEfectivos(entrada.filtros, entrada.anioActual, entrada.aniosPorDefecto),
    clinicalContext: entrada.clinicalContext,
  };
}

/** Valor de `X-Request-Deadline` (ISO 8601): ahora más `RAG_TIMEOUT_MS` (RN-22), con el reloj inyectado. */
export function calcularDeadline(ahora: Date, ragTimeoutMs: number): string {
  return new Date(ahora.getTime() + ragTimeoutMs).toISOString();
}

/**
 * Consulta a rag-orchestrator con su plazo: envía el deadline y aborta la llamada al vencer `ragTimeoutMs`. El
 * temporizador se limpia siempre, también cuando la llamada falla.
 */
async function consultarConPlazo(
  rag: RagQueryClient,
  request: RagQueryInternalRequest,
  deadline: string,
  ragTimeoutMs: number,
): Promise<RespuestaDeRag> {
  const controlador = new AbortController();
  const temporizador = setTimeout(() => {
    controlador.abort();
  }, ragTimeoutMs);
  try {
    return await rag.consultar(request, { deadline, signal: controlador.signal });
  } finally {
    clearTimeout(temporizador);
  }
}

/**
 * Gateway de `POST /platform/evidence-analyses`: leer el caso → cortar si no hay tipo de cáncer → cerrar sin IA si el
 * tipo no está habilitado → faltantes críticos (fallo cerrado si no se calculan) → contexto por allowlist → desidentificar → consultar a rag-orchestrator → cerrar el
 * análisis. Los puertos llegan por la factory.
 */
export function crearEvidenceAnalysisService(
  dependencias: DependenciasDelService,
): EvidenceAnalysisService {
  const {
    casos,
    desidentificador,
    rag,
    cierre,
    catalogo,
    checklist,
    tiposHabilitados,
    reloj,
    config,
  } = dependencias;

  /**
   * RN-20: un tipo no habilitado no se analiza. Nada del caso viaja a Backend 2; solo la pregunta se desidentifica,
   * porque se persiste (RN-11), y el registro se escribe antes de responder (RN-06).
   */
  async function cerrarTipoNoHabilitado(
    { traceId, userId, peticion }: SolicitudDeAnalisis,
    caso: CasoClinico,
    ahora: Date,
  ): Promise<ResultadoDelAnalisis> {
    const contextoVacio = construirContextoSinDatosClinicos(caso.paciente.population);
    const { query } = await desidentificador.desidentificar({
      traceId,
      patientId: peticion.patientId,
      contexto: contextoVacio,
      query: peticion.query,
      dataOrigin: caso.paciente.dataOrigin,
    });
    return cierre.completarTipoNoHabilitado({
      traceId,
      patientId: peticion.patientId,
      episodeId: caso.episodioId,
      userId,
      questionTemplateId: peticion.questionTemplateId ?? null,
      continueWithWarning: peticion.continueWithWarning,
      query,
      sourcesSelected: peticion.sourcesSelected,
      filtersApplied: filtrosEfectivos(
        peticion.filtersApplied,
        ahora.getUTCFullYear(),
        config.evidenceDefaultYears,
      ),
      dataClassification: caso.paciente.dataOrigin,
      catalogVersion: catalogo.version(),
      contextoVacio,
    });
  }

  /**
   * Tipo habilitado: los faltantes críticos se calculan en el servidor antes de armar el contexto (si fallan, el
   * análisis falla cerrado sin llamar a Backend 2), luego se desidentifica, se consulta con plazo y se cierra (RN-06).
   */
  async function analizarConIA(
    { traceId, userId, peticion }: SolicitudDeAnalisis,
    caso: CasoClinico,
    ahora: Date,
  ): Promise<ResultadoDelAnalisis> {
    const faltantes = await checklist.faltantes(peticion.patientId);
    const { contexto, dataRefs } = construirContextoPermitido(caso, ahora, faltantes);
    const { clinicalContext, query } = await desidentificador.desidentificar({
      traceId,
      patientId: peticion.patientId,
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
    const respuesta = await consultarConPlazo(
      rag,
      request,
      calcularDeadline(ahora, config.ragTimeoutMs),
      config.ragTimeoutMs,
    );
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
  }

  return {
    async solicitar(solicitud) {
      const caso = await casos.leerCaso(solicitud.peticion.patientId);
      if (caso === null) throw new PacienteNoEncontradoError();
      exigirTipoCancer(caso);

      const ahora = reloj.now();
      if (alcanceDelTipo(caso, tiposHabilitados) === 'tipo_no_habilitado') {
        return cerrarTipoNoHabilitado(solicitud, caso, ahora);
      }
      return analizarConIA(solicitud, caso, ahora);
    },
  };
}
