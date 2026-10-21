# GENERADO desde apps/rag-orchestrator/openapi.yaml — no editar a mano (npm run contracts:generate)

from __future__ import annotations

from datetime import date
from enum import Enum, StrEnum
from typing import Annotated, Any, Literal

from pydantic import AnyUrl, BaseModel, ConfigDict, Field, RootModel


class HealthStatus(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    status: Literal['ok']


class Detail(RootModel[str]):
    root: Annotated[str, Field(min_length=1)]


class Warning(StrEnum):
    datos_sin_verificar = 'datos_sin_verificar'
    datos_en_conflicto = 'datos_en_conflicto'
    datos_faltantes = 'datos_faltantes'
    poblacion_no_comparable = 'poblacion_no_comparable'


class DiscardReason(StrEnum):
    cita_invalida = 'cita_invalida'
    afirmacion_sin_soporte = 'afirmacion_sin_soporte'
    sin_citas = 'sin_citas'
    solo_soportada_por_analisis_previo = 'solo_soportada_por_analisis_previo'


class DiscardedOption(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    option: str
    rationale: str
    discardReason: DiscardReason
    unsupportedClaims: list[str]


class ExplainedBy(StrEnum):
    poblacion = 'poblacion'
    endpoint = 'endpoint'
    fecha = 'fecha'
    diseno = 'diseno'
    no_identificada = 'no_identificada'


class PatientDataRef(RootModel[str]):
    root: Annotated[str, Field(pattern='^r[0-9]+$')]


class ApplicabilityStatus(StrEnum):
    coincide = 'coincide'
    parcial = 'parcial'
    no_coincide = 'no_coincide'
    desconocido = 'desconocido'


class UnknownReason(Enum):
    falta_en_paciente = 'falta_en_paciente'
    no_reportado_por_fuente = 'no_reportado_por_fuente'
    NoneType_None = None


class PatientDataWarning(Enum):
    sin_verificar = 'sin_verificar'
    en_conflicto = 'en_conflicto'
    faltante = 'faltante'
    NoneType_None = None


class ApplicabilitySummary(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    coincide: Annotated[int, Field(ge=0)]
    parcial: Annotated[int, Field(ge=0)]
    noCoincide: Annotated[int, Field(ge=0)]
    desconocido: Annotated[int, Field(ge=0)]


class TraceId(RootModel[str]):
    root: Annotated[
        str,
        Field(
            description='Identificador de trazabilidad (X-Trace-Id). Un valor nuevo por llamada, también por turno de seguimiento.',
            pattern='^req_[A-Za-z0-9]{8,32}$',
        ),
    ]


class DataClassification(StrEnum):
    sintetico = 'sintetico'
    real_anonimizado = 'real_anonimizado'
    real_identificado = 'real_identificado'


class DataRef(RootModel[str]):
    root: Annotated[
        str,
        Field(
            description='Referencia opaca a un dato del contexto, asignada por clinical-api por petición (r1, r2…); nunca un UUID ni un identificador enlazable.',
            pattern='^r[0-9]+$',
        ),
    ]


class TextoEnmascarado(RootModel[str]):
    root: Annotated[
        str,
        Field(
            description='Texto libre enmascarado (RN-11): clinical-api sustituye la PII detectada antes de enviarlo; los términos de catálogo pasan sin cambio.'
        ),
    ]


class TextoEnmascaradoNulo(RootModel[str | None]):
    root: Annotated[
        str | None,
        Field(
            description='Texto libre enmascarado (RN-11), o null si el dato no se registró; los términos de catálogo pasan sin cambio.'
        ),
    ]


class EntryMethod(StrEnum):
    ocr = 'ocr'
    manual = 'manual'
    manual_correction = 'manual_correction'
    seed = 'seed'


class ExtractionConfidence(StrEnum):
    alta = 'alta'
    media = 'media'
    baja = 'baja'
    n_a = 'n_a'


class ReviewStatus(StrEnum):
    auto_aceptado = 'auto_aceptado'
    requiere_revision = 'requiere_revision'
    verificado = 'verificado'
    corregido = 'corregido'


class Provenance(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    entryMethod: EntryMethod
    extractionConfidence: ExtractionConfidence
    reviewStatus: ReviewStatus
    conflict: bool


class SourcesSelected(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    guias: bool
    ensayos: bool
    publicaciones: bool


class RagFiltersApplied(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    historiaCompleta: bool
    soloBiomarcadoresRelevantes: bool
    ultimosSeisMeses: bool
    antecedentesFamiliares: bool
    publishedFromYear: Annotated[
        int | None,
        Field(
            description='Valor efectivo del filtro de antigüedad: clinical-api ya aplicó el valor de la petición o año actual menos EVIDENCE_DEFAULT_YEARS. null significa toda la evidencia. Siempre presente.'
        ),
    ]


class QueryLanguage(StrEnum):
    es = 'es'
    en = 'en'


class ResponseLanguage(StrEnum):
    es = 'es'
    en = 'en'


class LlmProvider(StrEnum):
    local = 'local'
    nube = 'nube'


class RetrievalMode(StrEnum):
    dense = 'dense'
    hibrida = 'hibrida'


class RetrievalParams(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    topK: Annotated[int, Field(ge=1)]
    rerankTopN: Annotated[int, Field(ge=1)]
    relevanceThreshold: Annotated[float, Field(ge=0.0, le=1.0)]
    retrievalMode: RetrievalMode


class RagMeta(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    queryLanguage: QueryLanguage
    responseLanguage: ResponseLanguage
    llmProvider: Annotated[
        LlmProvider,
        Field(
            description='Dónde corrió el modelo (RN-12). Con datos reales siempre es local, sin fallback a la nube; clinical-api lo persiste y lo verifica contra dataClassification.'
        ),
    ]
    llmModel: str
    embeddingModel: str
    rerankerModel: str
    nliModel: str
    promptVersion: str
    catalogVersion: Annotated[
        str,
        Field(
            description='Versión del catálogo clínico cargada por rag-orchestrator (ADR-38).',
            min_length=1,
        ),
    ]
    corpusRelease: str
    corpusCutoffDate: date
    excludedSources: Annotated[
        list[str],
        Field(description='Fuentes excluidas del corpus, declaradas como exclusión.'),
    ]
    retrievalParams: RetrievalParams
    latencyMs: Annotated[int, Field(ge=0)]


class CaseSummaryMeta(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    queryLanguage: QueryLanguage
    responseLanguage: ResponseLanguage
    llmProvider: Annotated[
        LlmProvider,
        Field(
            description='Dónde corrió el modelo (RN-12). Con datos reales siempre es local, sin fallback a la nube; clinical-api lo persiste y lo verifica contra dataClassification.'
        ),
    ]
    llmModel: str
    embeddingModel: None
    rerankerModel: None
    nliModel: str
    promptVersion: str
    catalogVersion: Annotated[
        str,
        Field(
            description='Versión del catálogo clínico cargada por rag-orchestrator (ADR-38).',
            min_length=1,
        ),
    ]
    corpusRelease: None
    corpusCutoffDate: None
    excludedSources: None
    retrievalParams: None
    latencyMs: Annotated[int, Field(ge=0)]


class OutcomesSinceItem(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    eventType: TextoEnmascarado
    monthsAgo: Annotated[int, Field(ge=0)]
    description: TextoEnmascarado


class PriorAnalysisMemory(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    source: Literal['analisis_previo_ia']
    citable: Literal[False]
    monthsAgo: Annotated[int, Field(ge=0)]
    question: TextoEnmascarado
    synthesisSummary: TextoEnmascarado
    optionsDescribed: list[TextoEnmascarado]
    linkedDecision: Annotated[
        str | None,
        Field(
            description='Dato rotulado, no es soporte ni cita (RN-24). Texto libre enmascarado (RN-11).'
        ),
    ]
    outcomesSince: Annotated[
        list[OutcomesSinceItem],
        Field(
            description='Evolución registrada por el oncólogo después del análisis. Dato rotulado, no es soporte ni cita (RN-24).'
        ),
    ]


class Population(StrEnum):
    adulto = 'adulto'
    pediatrico = 'pediatrico'


class Diagnosis(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    dataRef: DataRef
    cancerType: TextoEnmascarado
    histology: TextoEnmascaradoNulo | None
    grade: TextoEnmascaradoNulo | None
    stagingSystem: TextoEnmascarado
    stageValue: TextoEnmascarado
    performanceScale: TextoEnmascaradoNulo | None
    performanceValue: int | None
    monthsSinceDiagnosis: Annotated[int, Field(ge=0)]
    provenance: Provenance


class ResultType(StrEnum):
    cuantitativo = 'cuantitativo'
    cualitativo = 'cualitativo'


class ClinicalSignificance(StrEnum):
    normal = 'normal'
    alterado = 'alterado'
    relevante = 'relevante'
    crítico = 'crítico'


class Biomarker(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    dataRef: DataRef
    biomarkerName: TextoEnmascarado
    value: TextoEnmascarado
    resultType: ResultType
    clinicalSignificance: ClinicalSignificance
    monthsAgo: Annotated[int, Field(ge=0)]
    provenance: Provenance


class NoteType(StrEnum):
    antecedente = 'antecedente'
    comorbilidad = 'comorbilidad'
    alergia = 'alergia'
    antecedente_familiar = 'antecedente_familiar'
    nota_libre = 'nota_libre'


class ClinicalNote(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    dataRef: DataRef
    noteType: NoteType
    content: TextoEnmascarado
    monthsAgo: Annotated[int, Field(ge=0)]
    provenance: Provenance


class Attribute(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    dataRef: DataRef
    key: TextoEnmascarado
    value: TextoEnmascarado
    monthsAgo: Annotated[int | None, Field(ge=0)]
    provenance: Provenance


class AtcCode(RootModel[str]):
    root: Annotated[str, Field(pattern='^[A-Z][0-9]{2}[A-Z]{2}[0-9]{2}$')]


class EndReason(StrEnum):
    progresion = 'progresion'
    toxicidad = 'toxicidad'
    completado = 'completado'
    otro = 'otro'
    desconocido = 'desconocido'


class PriorTreatment(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    dataRef: DataRef
    lineNumber: int | None
    setting: TextoEnmascarado
    regimenName: TextoEnmascarado
    atcCodes: list[AtcCode]
    monthsSinceStart: Annotated[int | None, Field(ge=0)]
    monthsSinceEnd: Annotated[int | None, Field(ge=0)]
    endReason: EndReason
    provenance: Provenance


class Event(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    dataRef: DataRef
    eventType: TextoEnmascarado
    monthsAgo: Annotated[int | None, Field(ge=0)]
    description: TextoEnmascarado
    provenance: Provenance


class Trend(StrEnum):
    sube = 'sube'
    baja = 'baja'
    estable = 'estable'


class BiomarkerTrend(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    dataRef: DataRef
    biomarkerName: TextoEnmascarado
    trend: Trend
    points: Annotated[int, Field(ge=1)]


class ClinicalContext(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    pseudoPatientId: Annotated[
        str,
        Field(
            description='Aleatorio por consulta (y por turno de seguimiento); nunca en el prompt.',
            pattern='^psd_[A-Za-z0-9]+$',
        ),
    ]
    population: Population
    diagnosis: Diagnosis | None
    biomarkers: list[Biomarker]
    clinicalNotes: Annotated[
        list[ClinicalNote],
        Field(description='Filtradas según filtersApplied y enmascaradas.'),
    ]
    currentLine: Annotated[
        int | None, Field(description='Línea de tratamiento actual.')
    ]
    attributes: Annotated[
        list[Attribute],
        Field(
            description='ClinicalAttribute (estado menopáusico, estado de castración, sitios metastásicos…).'
        ),
    ]
    priorTreatments: list[PriorTreatment]
    events: Annotated[
        list[Event],
        Field(description='Eventos relevantes del timeline, con fechas relativas.'),
    ]
    biomarkerTrends: list[BiomarkerTrend]
    missingCriticalData: Annotated[
        list[TextoEnmascarado],
        Field(description='Faltantes del checklist; se tratan como "desconocido".'),
    ]
    priorAnalyses: Annotated[
        list[PriorAnalysisMemory],
        Field(
            description='Memoria de análisis previos. Contexto, nunca evidencia; no citable ni válida como soporte NLI (RN-24).'
        ),
    ]


class AgentLimits(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    maxIterations: Annotated[int, Field(ge=0)]
    maxSubQueries: Annotated[int, Field(ge=0)]


class RagQueryInternalRequest(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    traceId: TraceId
    query: Annotated[
        str,
        Field(
            description='Pregunta ya enmascarada (RN-11).',
            max_length=2000,
            min_length=1,
        ),
    ]
    sourcesSelected: SourcesSelected
    dataClassification: DataClassification
    catalogVersion: Annotated[str, Field(min_length=1)]
    maxOptions: Annotated[
        int,
        Field(description='1 en los Sprints 1–3 y 3 desde el Sprint 4.', ge=1, le=3),
    ]
    filtersApplied: RagFiltersApplied
    agentLimits: Annotated[
        AgentLimits | None,
        Field(
            description='Agente acotado (FR-30); ausente o maxIterations = 0 mientras el agente no esté habilitado.'
        ),
    ] = None
    clinicalContext: ClinicalContext


class RagQueryStatus(StrEnum):
    con_evidencia = 'con_evidencia'
    sin_evidencia = 'sin_evidencia'


class Origin(StrEnum):
    estructural = 'estructural'
    llm_verificado = 'llm_verificado'


class Limitation(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    text: str
    origin: Origin


class Assumption(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    text: str


class RetrievalStats(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    retrieved: Annotated[int, Field(ge=0)]
    aboveThreshold: Annotated[int, Field(ge=0)]


class AgentStep(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    subQuery: str
    target: str
    foundEvidence: bool


class RagFollowUpRequest(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    traceId: TraceId
    dataClassification: DataClassification
    catalogVersion: Annotated[str, Field(min_length=1)]
    question: Annotated[
        str,
        Field(
            description='Pregunta ya enmascarada (RN-11).',
            max_length=2000,
            min_length=1,
        ),
    ]
    clinicalContext: ClinicalContext
    analysisMemory: Annotated[
        list[PriorAnalysisMemory],
        Field(
            description='Memoria rotulada del análisis al que se ancla la pregunta (misma forma que ClinicalContext.priorAnalyses): contexto, nunca soporte ni cita (RN-24).'
        ),
    ]
    filtersApplied: RagFiltersApplied


class RagFollowUpStatus(StrEnum):
    con_evidencia = 'con_evidencia'
    sin_evidencia = 'sin_evidencia'
    fuera_de_contexto = 'fuera_de_contexto'


class CaseSummaryInternalRequest(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    traceId: TraceId
    dataClassification: DataClassification
    clinicalContext: ClinicalContext


class Claim(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    text: Annotated[str, Field(min_length=1)]
    supportingDataRefs: Annotated[
        list[DataRef],
        Field(description='Referencias opacas a datos del contexto.', min_length=1),
    ]


class CaseSummaryInternalResponse(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    claims: list[Claim]
    omittedClaims: Annotated[int, Field(ge=0)]
    meta: CaseSummaryMeta


class ExtractedFieldConfidence(StrEnum):
    alta = 'alta'
    media = 'media'
    baja = 'baja'


class SourceSpan(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    page: Annotated[int, Field(ge=1)]
    bbox: list[float] | None
    textOffset: Annotated[int, Field(ge=0)]


class ExtractedField(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    value: str
    extractionScore: Annotated[float, Field(ge=0.0, le=1.0)]
    extractionConfidence: Annotated[
        ExtractedFieldConfidence, Field(title='ExtractedFieldConfidence')
    ]
    sourceSpan: SourceSpan


class FindingType(StrEnum):
    nombre = 'nombre'
    documento_identidad = 'documento_identidad'
    fecha = 'fecha'
    direccion = 'direccion'
    telefono = 'telefono'
    email = 'email'
    historia_clinica = 'historia_clinica'
    otro = 'otro'


class PiiScan(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    clean: bool
    findingTypes: Annotated[
        list[FindingType],
        Field(
            description='Tipos de hallazgo, nunca valores. Lista cerrada asumida; la refina ADR-40.'
        ),
    ]


class IdentityFound(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    idType: str
    nationalId: str


class MappingStatus(StrEnum):
    mapeado = 'mapeado'
    no_mapeado = 'no_mapeado'


class SignificanceSource(StrEnum):
    documento = 'documento'
    regla = 'regla'
    inferido_ia = 'inferido_ia'


class Biomarker1(BaseModel):
    biomarkerName: ExtractedField | None = None
    originalName: str | None = None
    loincCode: Annotated[
        str | None,
        Field(
            description='Propuesto; clinical-api decide la normalización final (ADR-33).'
        ),
    ] = None
    mappingStatus: MappingStatus | None = None
    value: ExtractedField | None = None
    unit: ExtractedField | None = None
    normalizedUnit: str | None = None
    referenceRange: ExtractedField | None = None
    resultType: str | None = None
    clinicalSignificance: str | None = None
    significanceSource: SignificanceSource | None = None


class DatePrecision(StrEnum):
    dia = 'dia'
    mes = 'mes'
    anio = 'anio'
    incierta = 'incierta'


class Event1(BaseModel):
    eventType: str | None = None
    eventDate: ExtractedField | None = None
    datePrecision: DatePrecision | None = None
    description: ExtractedField | None = None
    icd10Code: str | None = None
    cupsCode: str | None = None


class Attribute1(BaseModel):
    key: str | None = None
    value: ExtractedField | None = None


class PriorTreatment1(BaseModel):
    regimenName: ExtractedField | None = None
    atcCodes: list[str] | None = None
    setting: str | None = None
    lineNumber: int | None = None
    startedAt: ExtractedField | None = None
    endedAt: ExtractedField | None = None
    endReason: str | None = None


class ExtractedData(BaseModel):
    diagnosis: dict[str, Any] | None = None
    clinicalNotes: list[dict[str, Any]] | None = None
    exam: dict[str, Any] | None = None
    biomarkers: list[Biomarker1] | None = None
    events: Annotated[
        list[Event1] | None,
        Field(
            description='Eventos fechados (diagnóstico, cirugía, respuesta, progresión, toxicidad, recaída…).'
        ),
    ] = None
    attributes: Annotated[
        list[Attribute1] | None,
        Field(
            description='Atributos del catálogo (estado menopáusico, histología, grado, sitios metastásicos…).'
        ),
    ] = None
    priorTreatments: Annotated[
        list[PriorTreatment1] | None,
        Field(description='Líneas de tratamiento previas.'),
    ] = None


class DocumentExtractResponse(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    piiScan: PiiScan
    identityFound: Annotated[
        IdentityFound | None,
        Field(
            description='Existe solo para que clinical-api verifique que el documento pertenece al paciente; nunca se registra en logs. Es la única excepción a la regla de no identidad de este contrato.'
        ),
    ]
    sourceLab: str | None
    extractedData: Annotated[
        ExtractedData,
        Field(
            description='Solo las secciones que el documento contenía; cada campo es un ExtractedField. La forma por tipo de documento queda abierta: la cierran FEAT-01b (historia clínica) y FEAT-01c (registro asistido).'
        ),
    ]
    catalogVersion: str


class ErrorTokenServicioInvalido(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    error: Literal['TOKEN_SERVICIO_INVALIDO']
    message: str
    traceId: str


class ErrorCatalogVersionMismatch(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    error: Literal['CATALOG_VERSION_MISMATCH']
    message: str
    traceId: str


class ErrorTipoNoHabilitado(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    error: Literal['TIPO_NO_HABILITADO']
    message: str
    traceId: str


class DetailItem(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    loc: list[str | int]
    msg: str
    type: str


class ErrorValidacion(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    error: Literal['CUERPO_INVALIDO']
    message: str
    traceId: str
    detail: list[DetailItem]


class ErrorColaInferenciaLlena(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    error: Literal['COLA_INFERENCIA_LLENA']
    message: str
    traceId: str


class ErrorLlmLocalNoDisponible(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    error: Literal['LOCAL_LLM_UNAVAILABLE']
    message: str
    traceId: str


class ErrorInterno(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    error: Literal['ERROR_INTERNO']
    message: str
    traceId: str


class ErrorRecuperacionNoDisponible(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    error: Literal['RETRIEVAL_UNAVAILABLE']
    message: str
    traceId: str


class ErrorNliNoDisponible(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    error: Literal['NLI_UNAVAILABLE']
    message: str
    traceId: str


class ErrorTipoCancerNoRegistrado(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    error: Literal['TIPO_CANCER_NO_REGISTRADO']
    message: str
    traceId: str


class ErrorDeadlineVencido(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    error: Literal['DEADLINE_VENCIDO']
    message: str
    traceId: str


class Language(StrEnum):
    es = 'es'
    en = 'en'


class SourceType(StrEnum):
    guideline = 'guideline'
    clinical_trial = 'clinical_trial'
    literature = 'literature'
    genomic_study = 'genomic_study'


class LicenseClass(StrEnum):
    dominio_publico = 'dominio_publico'
    cc_by = 'cc_by'
    cc_by_sa = 'cc_by_sa'
    cc_by_nc = 'cc_by_nc'


class CitedSourceFields(BaseModel):
    title: Annotated[
        str, Field(description='Título de la fuente, copiado del catálogo del corpus.')
    ]
    sourceName: Annotated[
        str,
        Field(
            description='Nombre de la fuente, copiado del catálogo del corpus.',
            examples=['NCI PDQ'],
        ),
    ]
    externalId: Annotated[
        str,
        Field(
            description='Identificador externo de la fuente (DOI, NCT, PMID, CDR…), copiado del catálogo.',
            examples=['CDR0000062787'],
        ),
    ]
    language: Language
    sourceType: SourceType
    licenseClass: Annotated[
        LicenseClass,
        Field(
            description='Clase de licencia copiada del catálogo del corpus (ADR-36, RN-21). El MVP solo ingiere tres clases por configuración (CORPUS_ACCEPTED_LICENSES); cc_by_nc existe en el contrato para que añadirla después no cambie el enum.'
        ),
    ]
    studyDesign: Annotated[str | None, Field(examples=['eca'])]
    trialPhase: Annotated[str | None, Field(examples=['III'])]
    primaryEndpoint: str | None
    sampleSize: Annotated[int | None, Field(ge=0)]
    publishedAt: date | None
    lastUpdatedAt: date | None
    guidelineVersion: str | None
    authors: Annotated[
        str | None,
        Field(
            description='Autoría copiada del catálogo del corpus; null si el catálogo no la registra (la UI muestra "No disponible", RN-25).'
        ),
    ]
    sourceUrl: Annotated[
        AnyUrl | None,
        Field(
            description='Enlace a la fuente, copiado del catálogo del corpus; null si el catálogo no lo registra. Solo https. La UI lo abre con rel="noopener noreferrer".'
        ),
    ]
    possiblyOutdated: Annotated[
        bool,
        Field(description='Más de EVIDENCE_STALE_YEARS desde su última actualización.'),
    ]
    newerVersionAvailable: Annotated[
        bool,
        Field(
            description='Hay una versión más reciente del documento en el corpus. Lo calcula el detector de vigencia (FR-26); en un análisis nuevo viaja false.'
        ),
    ]
    chunkTextSnapshot: Annotated[
        str, Field(description='Texto original de la fuente, sin traducir.')
    ]
    chunkId: Annotated[
        str,
        Field(
            description='Referencia al chunk del corpus recuperado en esa consulta; puede no resolverse si el chunk se reindexó.'
        ),
    ]


class PerSourceItem(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    externalId: str
    summary: ApplicabilitySummary
    populationNotComparable: bool


class CitedSource(CitedSourceFields):
    model_config = ConfigDict(
        extra='forbid',
    )


class EvidenceOption(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    option: str
    rationale: Annotated[str, Field(description='En el idioma de la pregunta.')]
    details: Annotated[
        list[Detail] | None,
        Field(
            description='Párrafos opcionales de detalle que amplían la justificación, en el idioma de la pregunta. Cada afirmación pasó citas y NLI (RN-01) y el filtro de lenguaje (RN-23); el párrafo que no las supera se omite y cuenta en omittedClaims. Ausente (nunca vacío) si ninguno se soporta.',
            max_length=2,
        ),
    ] = None
    applicabilitySummary: ApplicabilitySummary
    populationNotComparable: Annotated[
        bool, Field(description='true solo si todas sus fuentes lo son (ADR-31).')
    ]
    perSource: Annotated[
        list[PerSourceItem],
        Field(
            description='Aplicabilidad de cada fuente que sustenta la opción; applicabilitySummary es la de la más aplicable (ADR-31).'
        ),
    ]
    relevanceScore: Annotated[
        float,
        Field(
            description='Metadato secundario: puntaje del reranker normalizado a [0,1] que mide la relevancia de la evidencia recuperada. No ordena las opciones, no mide la solidez clínica ni la probabilidad de éxito (RN-03).',
            examples=[0.87],
            ge=0.0,
            le=1.0,
        ),
    ]
    warnings: list[Warning]
    citedSources: Annotated[
        list[CitedSource],
        Field(
            description='Toda opción tiene al menos una cita a un chunk recuperado en esa consulta (RN-01).',
            min_length=1,
        ),
    ]


class SupportedClaim1(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    text: Annotated[
        str, Field(description='En el idioma de la pregunta.', min_length=1)
    ]
    citedSources: Annotated[list[CitedSource], Field(min_length=1)]
    patientDataRefs: Annotated[
        list[PatientDataRef],
        Field(
            description='Referencias opacas a datos del paciente, asignadas por clinical-api por petición (r1, r2…); nunca un UUID. clinical-api las resuelve en patientDataLinks.'
        ),
    ]


class SupportedClaim2(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    text: Annotated[
        str, Field(description='En el idioma de la pregunta.', min_length=1)
    ]
    citedSources: list[CitedSource]
    patientDataRefs: Annotated[
        list[PatientDataRef],
        Field(
            description='Referencias opacas a datos del paciente, asignadas por clinical-api por petición (r1, r2…); nunca un UUID. clinical-api las resuelve en patientDataLinks.',
            min_length=1,
        ),
    ]


class SupportedClaim(RootModel[SupportedClaim1 | SupportedClaim2]):
    root: Annotated[
        SupportedClaim1 | SupportedClaim2,
        Field(
            description='Afirmación generada que pasó el chequeo de soporte (RN-01). Está anclada a una cita del corpus recuperado en esa consulta, a un dato del paciente mediante una referencia opaca rN, o a ambos (ADR-34): al menos uno de los dos arreglos no está vacío.'
        ),
    ]


class ApplicabilityCriterion(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    criterion: Annotated[
        str,
        Field(description='Del catálogo del tipo de cáncer.', examples=['estado_her2']),
    ]
    patientValue: Annotated[
        str | None,
        Field(
            description='Valor copiado del contexto del paciente; nunca generado (ADR-34).'
        ),
    ]
    studyPopulationValue: str | None
    status: Annotated[ApplicabilityStatus, Field(title='ApplicabilityStatus')]
    unknownReason: UnknownReason | None
    isExclusionary: bool
    patientDataWarning: PatientDataWarning | None
    citedSources: list[CitedSource]


class RagFollowUpResponse(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    status: Annotated[
        RagFollowUpStatus,
        Field(
            description='rag-orchestrator clasifica fuera_de_contexto cuando la pregunta no se refiere al análisis ni a su evidencia: no se genera respuesta.',
            title='RagFollowUpStatus',
        ),
    ]
    answer: list[SupportedClaim]
    citedSources: Annotated[
        list[CitedSource],
        Field(
            description='Fuentes del turno; clinical-api calcula isNewSource al comparar sus chunkId con el análisis persistido.'
        ),
    ]
    omittedClaims: Annotated[int, Field(ge=0)]
    topRelevanceScore: Annotated[
        float | None,
        Field(
            description='Metadato secundario: puntaje del reranker normalizado a [0,1] de la evidencia recuperada con mayor relevancia. No ordena las opciones ni mide la solidez clínica ni la probabilidad de éxito (RN-03). null si no hay evidencia o la pregunta está fuera de contexto (RN-02): null no es 0.0.',
            ge=0.0,
            le=1.0,
        ),
    ]
    meta: RagMeta


class Discrepancy(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    claim: SupportedClaim
    explainedBy: ExplainedBy
    explanation: Annotated[
        str | None,
        Field(
            description='Descripción de la diferencia entre fuentes, sin afirmación nueva ni valoración clínica.'
        ),
    ]


class Synthesis(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    agreements: list[SupportedClaim]
    discrepancies: list[Discrepancy]


class SourceApplicability(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    externalId: str
    criteria: list[ApplicabilityCriterion]
    summary: ApplicabilitySummary
    populationNotComparable: Annotated[
        bool, Field(description='Un criterio excluyente en no_coincide.')
    ]


class RagQueryInternalResponse(BaseModel):
    model_config = ConfigDict(
        extra='forbid',
    )
    status: Annotated[RagQueryStatus, Field(title='RagQueryStatus')]
    synthesis: Synthesis
    applicability: list[SourceApplicability]
    evidenceOptions: Annotated[
        list[EvidenceOption],
        Field(
            description='Orden determinista por aplicabilidad (RN-28); ya vienen ordenadas.',
            max_length=3,
        ),
    ]
    discardedOptions: list[DiscardedOption]
    limitations: list[Limitation]
    assumptions: Annotated[
        list[Assumption],
        Field(
            description='Solo las propuestas por el LLM y verificadas; las de regla las agrega clinical-api.'
        ),
    ]
    retrievalStats: RetrievalStats
    omittedClaims: Annotated[int, Field(ge=0)]
    agentSteps: list[AgentStep]
    topRelevanceScore: Annotated[
        float | None,
        Field(
            description='Metadato secundario: puntaje del reranker normalizado a [0,1] de la evidencia recuperada con mayor relevancia. No ordena las opciones ni mide la solidez clínica ni la probabilidad de éxito (RN-03). null cuando ningún chunk supera el umbral (RN-02): null no es 0.0.',
            ge=0.0,
            le=1.0,
        ),
    ]
    meta: RagMeta
