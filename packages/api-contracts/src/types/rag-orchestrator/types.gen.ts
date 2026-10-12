// GENERADO desde apps/rag-orchestrator/openapi.yaml — no editar a mano (npm run contracts:generate)

export type ClientOptions = {
    baseUrl: 'http://rag-orchestrator:8000' | (string & {});
};

/**
 * Opción terapéutica descrita en la evidencia; es una descripción de lo que la evidencia recuperada reporta y no constituye una indicación para el paciente (RN-23).
 */
export type EvidenceOption = {
    option: string;
    /**
     * En el idioma de la pregunta.
     */
    rationale: string;
    applicabilitySummary: ApplicabilitySummary;
    /**
     * true solo si todas sus fuentes lo son (ADR-31).
     */
    populationNotComparable: boolean;
    /**
     * Aplicabilidad de cada fuente que sustenta la opción; applicabilitySummary es la de la más aplicable (ADR-31).
     */
    perSource: Array<{
        externalId: string;
        summary: ApplicabilitySummary;
        populationNotComparable: boolean;
    }>;
    /**
     * Metadato secundario: puntaje del reranker normalizado a [0,1] que mide la relevancia de la evidencia recuperada. No ordena las opciones, no mide la solidez clínica ni la probabilidad de éxito (RN-03).
     */
    relevanceScore: number;
    warnings: Array<'datos_sin_verificar' | 'datos_en_conflicto' | 'datos_faltantes' | 'poblacion_no_comparable'>;
    /**
     * Toda opción tiene al menos una cita a un chunk recuperado en esa consulta (RN-01).
     */
    citedSources: Array<CitedSource>;
};

/**
 * Solo para revisión del oncólogo; no es una opción.
 */
export type DiscardedOption = {
    option: string;
    rationale: string;
    discardReason: 'cita_invalida' | 'afirmacion_sin_soporte' | 'sin_citas' | 'solo_soportada_por_analisis_previo';
    unsupportedClaims: Array<string>;
};

/**
 * Síntesis de la evidencia recuperada. Siempre presente: en los Sprints 1–3 puede venir vacía (agreements y discrepancies sin elementos), pero el contrato es el final (ADR-26).
 */
export type Synthesis = {
    agreements: Array<SupportedClaim>;
    discrepancies: Array<{
        claim: SupportedClaim;
        explainedBy: 'poblacion' | 'endpoint' | 'fecha' | 'diseno' | 'no_identificada';
        /**
         * Descripción de la diferencia entre fuentes, sin afirmación nueva ni valoración clínica.
         */
        explanation: string | null;
    }>;
};

export type SupportedClaim = ({
    citedSources?: Array<unknown>;
} | {
    patientDataRefs?: Array<unknown>;
}) & {
    /**
     * En el idioma de la pregunta.
     */
    text: string;
    citedSources: Array<CitedSource>;
    /**
     * Referencias opacas a datos del paciente, asignadas por clinical-api por petición (r1, r2…); nunca un UUID. clinical-api las resuelve en patientDataLinks.
     */
    patientDataRefs: Array<string>;
};

/**
 * Aplicabilidad de una fuente al paciente, criterio a criterio.
 */
export type SourceApplicability = {
    externalId: string;
    criteria: Array<ApplicabilityCriterion>;
    summary: ApplicabilitySummary;
    /**
     * Un criterio excluyente en no_coincide.
     */
    populationNotComparable: boolean;
};

/**
 * Un criterio del catálogo del tipo de cáncer y su estado frente al paciente (RN-28).
 */
export type ApplicabilityCriterion = {
    /**
     * Del catálogo del tipo de cáncer.
     */
    criterion: string;
    /**
     * Valor copiado del contexto del paciente; nunca generado (ADR-34).
     */
    patientValue: string | null;
    studyPopulationValue: string | null;
    status: 'coincide' | 'parcial' | 'no_coincide' | 'desconocido';
    unknownReason: 'falta_en_paciente' | 'no_reportado_por_fuente' | null;
    isExclusionary: boolean;
    patientDataWarning: 'sin_verificar' | 'en_conflicto' | 'faltante' | null;
    citedSources: Array<CitedSource>;
};

/**
 * Conteo por estado de los criterios de aplicabilidad. Nunca un puntaje o porcentaje clínico (RN-28).
 */
export type ApplicabilitySummary = {
    coincide: number;
    parcial: number;
    noCoincide: number;
    desconocido: number;
};

/**
 * Cita a una fuente del corpus: todos sus campos están copiados del catálogo del corpus, nunca del texto generado (RN-04, RN-25). Cierra el auxiliar CitedSourceFields.
 */
export type CitedSource = CitedSourceFields;

/**
 * Identificador de trazabilidad (X-Trace-Id). Un valor nuevo por llamada, también por turno de seguimiento.
 */
export type TraceId = string;

/**
 * Con datos reales solo se usan modelos locales, sin fallback a la nube (RN-12).
 */
export type DataClassification = 'sintetico' | 'real_anonimizado' | 'real_identificado';

/**
 * Referencia opaca a un dato del contexto, asignada por clinical-api por petición (r1, r2…); nunca un UUID ni un identificador enlazable.
 */
export type DataRef = string;

/**
 * Texto libre enmascarado (RN-11): clinical-api sustituye la PII detectada antes de enviarlo; los términos de catálogo pasan sin cambio.
 */
export type TextoEnmascarado = string;

/**
 * Texto libre enmascarado (RN-11), o null si el dato no se registró; los términos de catálogo pasan sin cambio.
 */
export type TextoEnmascaradoNulo = string | null;

/**
 * Procedencia de un dato del contexto. Sin identificadores de documento (RN-10).
 */
export type Provenance = {
    entryMethod: 'ocr' | 'manual' | 'manual_correction' | 'seed';
    extractionConfidence: 'alta' | 'media' | 'baja' | 'n_a';
    reviewStatus: 'auto_aceptado' | 'requiere_revision' | 'verificado' | 'corregido';
    conflict: boolean;
};

export type SourcesSelected = {
    guias: boolean;
    ensayos: boolean;
    publicaciones: boolean;
};

/**
 * Filtros efectivos de la consulta, resueltos por clinical-api.
 */
export type RagFiltersApplied = {
    historiaCompleta: boolean;
    soloBiomarcadoresRelevantes: boolean;
    ultimosSeisMeses: boolean;
    antecedentesFamiliares: boolean;
    /**
     * Valor efectivo del filtro de antigüedad: clinical-api ya aplicó el valor de la petición o año actual menos EVIDENCE_DEFAULT_YEARS. null significa toda la evidencia. Siempre presente.
     */
    publishedFromYear: number | null;
};

/**
 * Metadatos de la ejecución, con los que clinical-api registra modelos, versión del prompt y del catálogo (RN-06). Mismo bloque en /rag/query, /rag/follow-up y /case/summary; los campos del corpus y retrievalParams son null donde la operación no consulta el corpus.
 */
export type RagMeta = {
    queryLanguage: 'es' | 'en';
    responseLanguage: 'es' | 'en';
    llmProvider: string;
    llmModel: string;
    embeddingModel: string | null;
    rerankerModel: string | null;
    nliModel: string;
    promptVersion: string;
    /**
     * Versión del catálogo clínico cargada por rag-orchestrator (ADR-38).
     */
    catalogVersion: string;
    corpusRelease: string | null;
    corpusCutoffDate: string | null;
    /**
     * Fuentes excluidas del corpus, declaradas como exclusión.
     */
    excludedSources: Array<string> | null;
    retrievalParams: {
        topK: number;
        rerankTopN: number;
        relevanceThreshold: number;
        retrievalMode: 'dense' | 'hibrida';
    } | null;
    latencyMs: number;
};

/**
 * Memoria de un análisis previo del paciente (RN-24): contexto, nunca evidencia. No es citable ni cuenta como soporte NLI. Sin identidad, con tiempos relativos.
 */
export type PriorAnalysisMemory = {
    source: 'analisis_previo_ia';
    citable: false;
    monthsAgo: number;
    question: TextoEnmascarado;
    synthesisSummary: TextoEnmascarado;
    optionsDescribed: Array<TextoEnmascarado>;
    /**
     * Dato rotulado, no es soporte ni cita (RN-24). Texto libre enmascarado (RN-11).
     */
    linkedDecision: string | null;
    /**
     * Evolución registrada por el oncólogo después del análisis. Dato rotulado, no es soporte ni cita (RN-24).
     */
    outcomesSince: Array<{
        eventType: TextoEnmascarado;
        monthsAgo: number;
        description: TextoEnmascarado;
    }>;
};

/**
 * Desidentificado por clinical-api: sin identidad ni identificadores enlazables; fechas relativas; texto libre enmascarado (RN-10, RN-11). Cada ítem lleva una referencia opaca dataRef (r1…rN) asignada por petición.
 */
export type ClinicalContext = {
    /**
     * Aleatorio por consulta (y por turno de seguimiento); nunca en el prompt.
     */
    pseudoPatientId: string;
    population: 'adulto' | 'pediatrico';
    diagnosis: {
        dataRef: DataRef;
        cancerType: TextoEnmascarado;
        histology: TextoEnmascaradoNulo;
        grade: TextoEnmascaradoNulo;
        stagingSystem: TextoEnmascarado;
        stageValue: TextoEnmascarado;
        performanceScale: TextoEnmascaradoNulo;
        performanceValue: number | null;
        monthsSinceDiagnosis: number;
        provenance: Provenance;
    } | null;
    biomarkers: Array<{
        dataRef: DataRef;
        biomarkerName: TextoEnmascarado;
        value: TextoEnmascarado;
        resultType: 'cuantitativo' | 'cualitativo';
        clinicalSignificance: 'normal' | 'alterado' | 'relevante' | 'crítico';
        monthsAgo: number;
        provenance: Provenance;
    }>;
    /**
     * Filtradas según filtersApplied y enmascaradas.
     */
    clinicalNotes: Array<{
        dataRef: DataRef;
        noteType: 'antecedente' | 'comorbilidad' | 'alergia' | 'antecedente_familiar' | 'nota_libre';
        content: TextoEnmascarado;
        monthsAgo: number;
        provenance: Provenance;
    }>;
    /**
     * Línea de tratamiento actual.
     */
    currentLine: number | null;
    /**
     * ClinicalAttribute (estado menopáusico, estado de castración, sitios metastásicos…).
     */
    attributes: Array<{
        dataRef: DataRef;
        key: TextoEnmascarado;
        value: TextoEnmascarado;
        monthsAgo: number | null;
        provenance: Provenance;
    }>;
    priorTreatments: Array<{
        dataRef: DataRef;
        lineNumber: number | null;
        setting: TextoEnmascarado;
        regimenName: TextoEnmascarado;
        atcCodes: Array<string>;
        monthsSinceStart: number | null;
        monthsSinceEnd: number | null;
        endReason: 'progresion' | 'toxicidad' | 'completado' | 'otro' | 'desconocido';
        provenance: Provenance;
    }>;
    /**
     * Eventos relevantes del timeline, con fechas relativas.
     */
    events: Array<{
        dataRef: DataRef;
        eventType: TextoEnmascarado;
        monthsAgo: number | null;
        description: TextoEnmascarado;
        provenance: Provenance;
    }>;
    biomarkerTrends: Array<{
        dataRef: DataRef;
        biomarkerName: TextoEnmascarado;
        trend: 'sube' | 'baja' | 'estable';
        points: number;
    }>;
    /**
     * Faltantes del checklist; se tratan como "desconocido".
     */
    missingCriticalData: Array<TextoEnmascarado>;
    /**
     * Memoria de análisis previos. Contexto, nunca evidencia; no citable ni válida como soporte NLI (RN-24).
     */
    priorAnalyses: Array<PriorAnalysisMemory>;
};

export type RagQueryInternalRequest = {
    traceId: TraceId;
    /**
     * Pregunta ya enmascarada (RN-11).
     */
    query: string;
    sourcesSelected: SourcesSelected;
    dataClassification: DataClassification;
    catalogVersion: string;
    /**
     * 1 en los Sprints 1–3 y 3 desde el Sprint 4.
     */
    maxOptions: number;
    filtersApplied: RagFiltersApplied;
    /**
     * Agente acotado (FR-30); ausente o maxIterations = 0 mientras el agente no esté habilitado.
     */
    agentLimits?: {
        maxIterations: number;
        maxSubQueries: number;
    };
    clinicalContext: ClinicalContext;
};

/**
 * Usa los schemas compartidos de contracts/schemas/evidence.yaml (Synthesis, SourceApplicability, EvidenceOption, DiscardedOption). clinical-api agrega la Base del análisis y persiste el AIAnalysisRecord.
 */
export type RagQueryInternalResponse = {
    status: 'con_evidencia' | 'sin_evidencia';
    synthesis: Synthesis;
    applicability: Array<SourceApplicability>;
    /**
     * Orden determinista por aplicabilidad (RN-28); ya vienen ordenadas.
     */
    evidenceOptions: Array<EvidenceOption>;
    discardedOptions: Array<DiscardedOption>;
    limitations: Array<{
        text: string;
        origin: 'estructural' | 'llm_verificado';
    }>;
    /**
     * Solo las propuestas por el LLM y verificadas; las de regla las agrega clinical-api.
     */
    assumptions: Array<{
        text: string;
    }>;
    retrievalStats: {
        retrieved: number;
        aboveThreshold: number;
    };
    omittedClaims: number;
    agentSteps: Array<{
        subQuery: string;
        target: string;
        foundEvidence: boolean;
    }>;
    /**
     * Metadato secundario: puntaje del reranker normalizado a [0,1] de la mejor evidencia recuperada. No ordena las opciones ni mide la solidez clínica ni la probabilidad de éxito (RN-03). null cuando ningún chunk supera el umbral (RN-02): null no es 0.0.
     */
    topRelevanceScore: number | null;
    meta: RagMeta;
};

export type RagFollowUpRequest = {
    traceId: TraceId;
    dataClassification: DataClassification;
    catalogVersion: string;
    /**
     * Pregunta ya enmascarada (RN-11).
     */
    question: string;
    clinicalContext: ClinicalContext;
    /**
     * Memoria rotulada del análisis al que se ancla la pregunta (misma forma que ClinicalContext.priorAnalyses): contexto, nunca soporte ni cita (RN-24).
     */
    analysisMemory: Array<PriorAnalysisMemory>;
    filtersApplied: RagFiltersApplied;
};

export type RagFollowUpResponse = {
    /**
     * rag-orchestrator clasifica fuera_de_contexto cuando la pregunta no se refiere al análisis ni a su evidencia: no se genera respuesta.
     */
    status: 'con_evidencia' | 'sin_evidencia' | 'fuera_de_contexto';
    answer: Array<SupportedClaim>;
    /**
     * Fuentes del turno; clinical-api calcula isNewSource al comparar sus chunkId con el análisis persistido.
     */
    citedSources: Array<CitedSource>;
    omittedClaims: number;
    /**
     * Metadato secundario: puntaje del reranker normalizado a [0,1] de la mejor evidencia recuperada. No ordena las opciones ni mide la solidez clínica ni la probabilidad de éxito (RN-03). null si no hay evidencia o la pregunta está fuera de contexto (RN-02): null no es 0.0.
     */
    topRelevanceScore: number | null;
    meta: RagMeta;
};

export type CaseSummaryInternalRequest = {
    traceId: TraceId;
    dataClassification: DataClassification;
    clinicalContext: ClinicalContext;
};

/**
 * Resumen del caso. Cada afirmación referencia datos del contexto por su dataRef; las que no pasan el soporte se omiten.
 */
export type CaseSummaryInternalResponse = {
    claims: Array<{
        text: string;
        /**
         * Referencias opacas a datos del contexto.
         */
        supportingDataRefs: Array<DataRef>;
    }>;
    omittedClaims: number;
    meta: RagMeta;
};

export type ExtractedField = {
    value: string;
    extractionScore: number;
    extractionConfidence: 'alta' | 'media' | 'baja';
    sourceSpan: {
        page: number;
        bbox: Array<number> | null;
        textOffset: number;
    };
};

export type DocumentExtractResponse = {
    piiScan: {
        clean: boolean;
        /**
         * Tipos de hallazgo, nunca valores. Lista cerrada asumida; la refina ADR-40.
         */
        findingTypes: Array<'nombre' | 'documento_identidad' | 'fecha' | 'direccion' | 'telefono' | 'email' | 'historia_clinica' | 'otro'>;
    };
    /**
     * Existe solo para que clinical-api verifique que el documento pertenece al paciente; nunca se registra en logs. Es la única excepción a la regla de no identidad de este contrato.
     */
    identityFound: {
        idType: string;
        nationalId: string;
    } | null;
    sourceLab: string | null;
    /**
     * Solo las secciones que el documento contenía; cada campo es un ExtractedField. La forma por tipo de documento queda abierta: la cierran FEAT-01b (historia clínica) y FEAT-01c (registro asistido).
     */
    extractedData: {
        diagnosis?: {
            [key: string]: unknown;
        };
        clinicalNotes?: Array<{
            [key: string]: unknown;
        }>;
        exam?: {
            [key: string]: unknown;
        };
        biomarkers?: Array<{
            biomarkerName?: ExtractedField;
            originalName?: string;
            /**
             * Propuesto; clinical-api decide la normalización final (ADR-33).
             */
            loincCode?: string | null;
            mappingStatus?: 'mapeado' | 'no_mapeado';
            value?: ExtractedField;
            unit?: ExtractedField;
            normalizedUnit?: string | null;
            referenceRange?: ExtractedField;
            resultType?: string;
            clinicalSignificance?: string;
            significanceSource?: 'documento' | 'regla' | 'inferido_ia';
        }>;
        /**
         * Eventos fechados (diagnóstico, cirugía, respuesta, progresión, toxicidad, recaída…).
         */
        events?: Array<{
            eventType?: string;
            eventDate?: ExtractedField;
            datePrecision?: 'dia' | 'mes' | 'anio' | 'incierta';
            description?: ExtractedField;
            icd10Code?: string | null;
            cupsCode?: string | null;
        }>;
        /**
         * Atributos del catálogo (estado menopáusico, histología, grado, sitios metastásicos…).
         */
        attributes?: Array<{
            key?: string;
            value?: ExtractedField;
        }>;
        /**
         * Líneas de tratamiento previas.
         */
        priorTreatments?: Array<{
            regimenName?: ExtractedField;
            atcCodes?: Array<string>;
            setting?: string;
            lineNumber?: number | null;
            startedAt?: ExtractedField;
            endedAt?: ExtractedField;
            endReason?: string;
        }>;
    };
    catalogVersion: string;
};

export type ErrorTokenServicioInvalido = {
    error: 'TOKEN_SERVICIO_INVALIDO';
    message: string;
    traceId: string;
};

export type ErrorCatalogVersionMismatch = {
    error: 'CATALOG_VERSION_MISMATCH';
    message: string;
    traceId: string;
};

export type ErrorTipoNoHabilitado = {
    error: 'TIPO_NO_HABILITADO';
    message: string;
    traceId: string;
};

/**
 * Error de validación sin eco: detail lleva la ubicación, el mensaje y el tipo, nunca el valor recibido (sin input ni ctx).
 */
export type ErrorValidacion = {
    error: 'CUERPO_INVALIDO';
    message: string;
    traceId: string;
    detail: Array<{
        loc: Array<string | number>;
        msg: string;
        type: string;
    }>;
};

export type ErrorColaInferenciaLlena = {
    error: 'COLA_INFERENCIA_LLENA';
    message: string;
    traceId: string;
};

export type ErrorLlmLocalNoDisponible = {
    error: 'LOCAL_LLM_UNAVAILABLE';
    message: string;
    traceId: string;
};

export type ErrorDeadlineVencido = {
    error: 'DEADLINE_VENCIDO';
    message: string;
    traceId: string;
};

/**
 * Campos de una cita, todos copiados del catálogo del corpus y nunca del texto generado (RN-04, RN-25). Auxiliar abierto: solo se compone dentro de un allOf que cierra con unevaluatedProperties false (CitedSource y FollowUpCitedSource). Un campo ausente en el catálogo viaja como null y la UI lo muestra como "No disponible".
 */
export type CitedSourceFields = {
    /**
     * Título de la fuente, copiado del catálogo del corpus.
     */
    title: string;
    /**
     * Nombre de la fuente, copiado del catálogo del corpus.
     */
    sourceName: string;
    /**
     * Identificador externo de la fuente (DOI, NCT, PMID, CDR…), copiado del catálogo.
     */
    externalId: string;
    language: 'es' | 'en';
    sourceType: 'guideline' | 'clinical_trial' | 'literature' | 'genomic_study';
    /**
     * Clase de licencia copiada del catálogo del corpus (ADR-36, RN-21). El MVP solo ingiere tres clases por configuración (CORPUS_ACCEPTED_LICENSES); cc_by_nc existe en el contrato para que añadirla después no cambie el enum.
     */
    licenseClass: 'dominio_publico' | 'cc_by' | 'cc_by_sa' | 'cc_by_nc';
    studyDesign: string | null;
    trialPhase: string | null;
    primaryEndpoint: string | null;
    sampleSize: number | null;
    publishedAt: string | null;
    lastUpdatedAt: string | null;
    guidelineVersion: string | null;
    /**
     * Autoría copiada del catálogo del corpus; null si el catálogo no la registra (la UI muestra "No disponible", RN-25).
     */
    authors: string | null;
    /**
     * Enlace a la fuente, copiado del catálogo del corpus; null si el catálogo no lo registra. Solo https. La UI lo abre con rel="noopener noreferrer".
     */
    sourceUrl: string | null;
    /**
     * Más de EVIDENCE_STALE_YEARS desde su última actualización.
     */
    possiblyOutdated: boolean;
    /**
     * Hay una versión más reciente del documento en el corpus. Lo calcula el detector de vigencia (FR-26); en un análisis nuevo viaja false.
     */
    newerVersionAvailable: boolean;
    /**
     * Texto original de la fuente, sin traducir.
     */
    chunkTextSnapshot: string;
    /**
     * Referencia best-effort al chunk recuperado en esa consulta.
     */
    chunkId: string;
};

export type RequestDeadline = string;

export type RagQueryData = {
    body: RagQueryInternalRequest;
    headers?: {
        'X-Request-Deadline'?: string;
    };
    path?: never;
    query?: never;
    url: '/rag/query';
};

export type RagQueryErrors = {
    /**
     * JWT de servicio ausente o inválido.
     */
    401: ErrorTokenServicioInvalido;
    /**
     * catalogVersion distinto del catálogo cargado (ADR-38).
     */
    409: ErrorCatalogVersionMismatch;
    /**
     * Cuerpo inválido (Pydantic), o TIPO_NO_HABILITADO: cancerType fuera de ENABLED_CANCER_TYPES, que responde sin invocar al LLM (defensa en profundidad).
     */
    422: ErrorTipoNoHabilitado | ErrorValidacion;
    /**
     * Cola de inferencia llena.
     */
    429: ErrorColaInferenciaLlena;
    /**
     * LLM local no disponible. Con datos reales solo se usan modelos locales, sin fallback a la nube (RN-12).
     */
    503: ErrorLlmLocalNoDisponible;
    /**
     * Deadline vencido; la generación se aborta.
     */
    504: ErrorDeadlineVencido;
};

export type RagQueryError = RagQueryErrors[keyof RagQueryErrors];

export type RagQueryResponses = {
    /**
     * Resultado.
     */
    200: RagQueryInternalResponse;
};

export type RagQueryResponse = RagQueryResponses[keyof RagQueryResponses];

export type RagFollowUpData = {
    body: RagFollowUpRequest;
    headers?: {
        'X-Request-Deadline'?: string;
    };
    path?: never;
    query?: never;
    url: '/rag/follow-up';
};

export type RagFollowUpErrors = {
    /**
     * JWT de servicio ausente o inválido.
     */
    401: ErrorTokenServicioInvalido;
    /**
     * catalogVersion distinto del catálogo cargado (ADR-38).
     */
    409: ErrorCatalogVersionMismatch;
    /**
     * Cuerpo inválido (Pydantic), o TIPO_NO_HABILITADO.
     */
    422: ErrorTipoNoHabilitado | ErrorValidacion;
    /**
     * Cola de inferencia llena.
     */
    429: ErrorColaInferenciaLlena;
    /**
     * LLM local no disponible (LOCAL_LLM_UNAVAILABLE). Con datos reales solo se usan modelos locales, sin fallback a la nube (RN-12).
     */
    503: ErrorLlmLocalNoDisponible;
    /**
     * Deadline vencido; la generación se aborta.
     */
    504: ErrorDeadlineVencido;
};

export type RagFollowUpError = RagFollowUpErrors[keyof RagFollowUpErrors];

export type RagFollowUpResponses = {
    /**
     * Respuesta del turno.
     */
    200: RagFollowUpResponse;
};

export type RagFollowUpResponse2 = RagFollowUpResponses[keyof RagFollowUpResponses];

export type ExtractDocumentData = {
    body: {
        file: Blob | File;
        traceId: TraceId;
        documentType: 'historia_clinica' | 'examen';
        dataClassification: DataClassification;
        mode: 'registro' | 'carga';
    };
    path?: never;
    query?: never;
    url: '/documents/extract';
};

export type ExtractDocumentErrors = {
    /**
     * JWT de servicio ausente o inválido.
     */
    401: ErrorTokenServicioInvalido;
    /**
     * Tamaño máximo excedido. Pendiente: el código y el cuerpo de este error los fija la historia dueña de la extracción (FEAT-01b); aquí no se inventa ningún código.
     */
    413: unknown;
    /**
     * Tipo de archivo no admitido o documento ilegible. Pendiente: el código y el cuerpo de este error los fija la historia dueña de la extracción (FEAT-01b); aquí no se inventa ningún código.
     */
    415: unknown;
    /**
     * Cuerpo inválido (Pydantic).
     */
    422: ErrorValidacion;
    /**
     * LLM local no disponible. Con datos reales solo se usan modelos locales, sin fallback a la nube (RN-12).
     */
    503: ErrorLlmLocalNoDisponible;
};

export type ExtractDocumentError = ExtractDocumentErrors[keyof ExtractDocumentErrors];

export type ExtractDocumentResponses = {
    /**
     * Datos extraídos (o piiScan.clean=false sin datos clínicos).
     */
    200: DocumentExtractResponse;
};

export type ExtractDocumentResponse = ExtractDocumentResponses[keyof ExtractDocumentResponses];

export type CaseSummaryData = {
    body: CaseSummaryInternalRequest;
    path?: never;
    query?: never;
    url: '/case/summary';
};

export type CaseSummaryErrors = {
    /**
     * JWT de servicio ausente o inválido.
     */
    401: ErrorTokenServicioInvalido;
    /**
     * Cuerpo inválido (Pydantic).
     */
    422: ErrorValidacion;
    /**
     * Cola de inferencia llena.
     */
    429: ErrorColaInferenciaLlena;
    /**
     * LLM local no disponible. Con datos reales solo se usan modelos locales, sin fallback a la nube (RN-12).
     */
    503: ErrorLlmLocalNoDisponible;
};

export type CaseSummaryError = CaseSummaryErrors[keyof CaseSummaryErrors];

export type CaseSummaryResponses = {
    /**
     * Resumen.
     */
    200: CaseSummaryInternalResponse;
};

export type CaseSummaryResponse = CaseSummaryResponses[keyof CaseSummaryResponses];
