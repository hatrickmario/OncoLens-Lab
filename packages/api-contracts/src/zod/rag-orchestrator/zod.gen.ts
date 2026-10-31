// GENERADO desde apps/rag-orchestrator/openapi.yaml — no editar a mano (npm run contracts:generate)

import * as z from 'zod';

export const zHealthStatus = z.strictObject({
    status: z.literal('ok'),
    configKeys: z.array(z.string().regex(/^[A-Z][A-Z0-9_]*$/)).optional(),
    serviceVersion: z.string().min(1).optional(),
    catalogVersion: z.string().min(1).optional()
});

/**
 * Solo para revisión del oncólogo; no es una opción.
 */
export const zDiscardedOption = z.strictObject({
    option: z.string(),
    rationale: z.string(),
    discardReason: z.enum([
        'cita_invalida',
        'afirmacion_sin_soporte',
        'sin_citas',
        'solo_soportada_por_analisis_previo',
        'lenguaje_no_permitido'
    ]),
    unsupportedClaims: z.array(z.string())
});

/**
 * Conteo por estado de los criterios de aplicabilidad. Nunca un puntaje o porcentaje clínico (RN-28).
 */
export const zApplicabilitySummary = z.strictObject({
    coincide: z.int().gte(0),
    parcial: z.int().gte(0),
    noCoincide: z.int().gte(0),
    desconocido: z.int().gte(0)
});

/**
 * Identificador de trazabilidad (X-Trace-Id). Un valor nuevo por llamada, también por turno de seguimiento.
 */
export const zTraceId = z.string().regex(/^req_[A-Za-z0-9]{8,32}$/);

/**
 * Con datos reales solo se usan modelos locales, sin fallback a la nube (RN-12).
 */
export const zDataClassification = z.enum([
    'sintetico',
    'real_anonimizado',
    'real_identificado'
]);

/**
 * Referencia opaca a un dato del contexto, asignada por clinical-api por petición (r1, r2…); nunca un UUID ni un identificador enlazable.
 */
export const zDataRef = z.string().regex(/^r[0-9]+$/);

/**
 * Texto libre enmascarado (RN-11): clinical-api sustituye la PII detectada antes de enviarlo; los términos de catálogo pasan sin cambio.
 */
export const zTextoEnmascarado = z.string();

/**
 * Texto libre enmascarado (RN-11), o null si el dato no se registró; los términos de catálogo pasan sin cambio.
 */
export const zTextoEnmascaradoNulo = z.string().nullable();

/**
 * Procedencia de un dato del contexto. Sin identificadores de documento (RN-10).
 */
export const zProvenance = z.strictObject({
    entryMethod: z.enum([
        'ocr',
        'manual',
        'manual_correction',
        'seed'
    ]),
    extractionConfidence: z.enum([
        'alta',
        'media',
        'baja',
        'n_a'
    ]),
    reviewStatus: z.enum([
        'auto_aceptado',
        'requiere_revision',
        'verificado',
        'corregido'
    ]),
    conflict: z.boolean()
});

export const zSourcesSelected = z.strictObject({
    guias: z.boolean(),
    ensayos: z.boolean(),
    publicaciones: z.boolean()
});

/**
 * Filtros efectivos de la consulta, resueltos por clinical-api.
 */
export const zRagFiltersApplied = z.strictObject({
    historiaCompleta: z.boolean(),
    soloBiomarcadoresRelevantes: z.boolean(),
    ultimosSeisMeses: z.boolean(),
    antecedentesFamiliares: z.boolean(),
    publishedFromYear: z.int().nullable()
});

/**
 * Metadatos de una ejecución que consulta el corpus (/rag/query y /rag/follow-up), con los que clinical-api registra modelos, versión del prompt y del catálogo (RN-06). Estricto: ningún campo es nulo y catalogVersion es obligatorio. /case/summary no consulta el corpus y usa CaseSummaryMeta.
 */
export const zRagMeta = z.strictObject({
    queryLanguage: z.enum(['es', 'en']),
    responseLanguage: z.enum(['es', 'en']),
    llmProvider: z.enum(['local', 'nube']),
    llmModel: z.string(),
    embeddingModel: z.string(),
    rerankerModel: z.string(),
    nliModel: z.string(),
    promptVersion: z.string(),
    catalogVersion: z.string().min(1),
    corpusRelease: z.string(),
    corpusCutoffDate: z.iso.date(),
    excludedSources: z.array(z.string()),
    retrievalParams: z.strictObject({
        topK: z.int().gte(1),
        rerankTopN: z.int().gte(1),
        relevanceThreshold: z.number().gte(0).lte(1),
        retrievalMode: z.enum(['dense', 'hibrida']),
        fusion: z.enum([
            'ninguna',
            'rrf',
            'ponderada'
        ]),
        fusionParam: z.number().gte(0)
    }),
    latencyMs: z.int().gte(0)
});

/**
 * Metadatos del resumen del caso (RN-06). /case/summary no consulta el corpus: los campos del corpus, los modelos de recuperación y retrievalParams son null; el resto es obligatorio y catalogVersion se exige igual que en RagMeta.
 */
export const zCaseSummaryMeta = z.strictObject({
    queryLanguage: z.enum(['es', 'en']),
    responseLanguage: z.enum(['es', 'en']),
    llmProvider: z.enum(['local', 'nube']),
    llmModel: z.string(),
    embeddingModel: z.null(),
    rerankerModel: z.null(),
    nliModel: z.string(),
    promptVersion: z.string(),
    catalogVersion: z.string().min(1),
    corpusRelease: z.null(),
    corpusCutoffDate: z.null(),
    excludedSources: z.null(),
    retrievalParams: z.null(),
    latencyMs: z.int().gte(0)
});

/**
 * Memoria de un análisis previo del paciente (RN-24): contexto, nunca evidencia. No es citable ni cuenta como soporte NLI. Sin identidad, con tiempos relativos.
 */
export const zPriorAnalysisMemory = z.strictObject({
    source: z.literal('analisis_previo_ia'),
    citable: z.literal(false),
    monthsAgo: z.int().gte(0),
    question: zTextoEnmascarado,
    synthesisSummary: zTextoEnmascarado,
    optionsDescribed: z.array(zTextoEnmascarado),
    linkedDecision: z.string().nullable(),
    outcomesSince: z.array(z.strictObject({
        eventType: zTextoEnmascarado,
        monthsAgo: z.int().gte(0),
        description: zTextoEnmascarado
    }))
});

/**
 * Desidentificado por clinical-api: sin identidad ni identificadores enlazables; fechas relativas; texto libre enmascarado (RN-10, RN-11). Cada ítem lleva una referencia opaca dataRef (r1…rN) asignada por petición.
 */
export const zClinicalContext = z.strictObject({
    pseudoPatientId: z.string().regex(/^psd_[A-Za-z0-9]+$/),
    population: z.enum(['adulto', 'pediatrico']),
    diagnosis: z.strictObject({
        dataRef: zDataRef,
        cancerType: zTextoEnmascarado,
        histology: zTextoEnmascaradoNulo,
        grade: zTextoEnmascaradoNulo,
        stagingSystem: zTextoEnmascarado,
        stageValue: zTextoEnmascarado,
        performanceScale: zTextoEnmascaradoNulo,
        performanceValue: z.int().nullable(),
        monthsSinceDiagnosis: z.int().gte(0),
        provenance: zProvenance
    }).nullable(),
    biomarkers: z.array(z.strictObject({
        dataRef: zDataRef,
        biomarkerName: zTextoEnmascarado,
        value: zTextoEnmascarado,
        resultType: z.enum(['cuantitativo', 'cualitativo']),
        clinicalSignificance: z.enum([
            'normal',
            'alterado',
            'relevante',
            'crítico'
        ]),
        monthsAgo: z.int().gte(0),
        provenance: zProvenance
    })),
    clinicalNotes: z.array(z.strictObject({
        dataRef: zDataRef,
        noteType: z.enum([
            'antecedente',
            'comorbilidad',
            'alergia',
            'antecedente_familiar',
            'nota_libre'
        ]),
        content: zTextoEnmascarado,
        monthsAgo: z.int().gte(0),
        provenance: zProvenance
    })),
    currentLine: z.int().nullable(),
    attributes: z.array(z.strictObject({
        dataRef: zDataRef,
        key: zTextoEnmascarado,
        value: zTextoEnmascarado,
        monthsAgo: z.int().gte(0).nullable(),
        provenance: zProvenance
    })),
    priorTreatments: z.array(z.strictObject({
        dataRef: zDataRef,
        lineNumber: z.int().nullable(),
        setting: zTextoEnmascarado,
        regimenName: zTextoEnmascarado,
        atcCodes: z.array(z.string().regex(/^[A-Z][0-9]{2}[A-Z]{2}[0-9]{2}$/)),
        monthsSinceStart: z.int().gte(0).nullable(),
        monthsSinceEnd: z.int().gte(0).nullable(),
        endReason: z.enum([
            'progresion',
            'toxicidad',
            'completado',
            'otro',
            'desconocido'
        ]),
        provenance: zProvenance
    })),
    events: z.array(z.strictObject({
        dataRef: zDataRef,
        eventType: zTextoEnmascarado,
        monthsAgo: z.int().gte(0).nullable(),
        description: zTextoEnmascarado,
        provenance: zProvenance
    })),
    biomarkerTrends: z.array(z.strictObject({
        dataRef: zDataRef,
        biomarkerName: zTextoEnmascarado,
        trend: z.enum([
            'sube',
            'baja',
            'estable'
        ]),
        points: z.int().gte(1)
    })),
    missingCriticalData: z.array(zTextoEnmascarado),
    priorAnalyses: z.array(zPriorAnalysisMemory)
});

export const zRagQueryInternalRequest = z.strictObject({
    traceId: zTraceId,
    query: z.string().min(1).max(2000),
    sourcesSelected: zSourcesSelected,
    dataClassification: zDataClassification,
    catalogVersion: z.string().min(1),
    maxOptions: z.int().gte(1).lte(3),
    filtersApplied: zRagFiltersApplied,
    agentLimits: z.strictObject({
        maxIterations: z.int().gte(0),
        maxSubQueries: z.int().gte(0)
    }).optional(),
    clinicalContext: zClinicalContext
});

export const zRagFollowUpRequest = z.strictObject({
    traceId: zTraceId,
    dataClassification: zDataClassification,
    catalogVersion: z.string().min(1),
    question: z.string().min(1).max(2000),
    clinicalContext: zClinicalContext,
    analysisMemory: z.array(zPriorAnalysisMemory),
    filtersApplied: zRagFiltersApplied
});

export const zCaseSummaryInternalRequest = z.strictObject({
    traceId: zTraceId,
    dataClassification: zDataClassification,
    clinicalContext: zClinicalContext
});

/**
 * Resumen del caso. Cada afirmación referencia datos del contexto por su dataRef; las que no pasan el soporte se omiten.
 */
export const zCaseSummaryInternalResponse = z.strictObject({
    claims: z.array(z.strictObject({
        text: z.string().min(1),
        supportingDataRefs: z.array(zDataRef).min(1)
    })),
    omittedClaims: z.int().gte(0),
    meta: zCaseSummaryMeta
});

export const zExtractedField = z.strictObject({
    value: z.string(),
    extractionScore: z.number().gte(0).lte(1),
    extractionConfidence: z.enum([
        'alta',
        'media',
        'baja'
    ]),
    sourceSpan: z.strictObject({
        page: z.int().gte(1),
        bbox: z.array(z.number()).nullable(),
        textOffset: z.int().gte(0)
    })
});

export const zDocumentExtractResponse = z.strictObject({
    piiScan: z.strictObject({
        clean: z.boolean(),
        findingTypes: z.array(z.enum([
            'nombre',
            'documento_identidad',
            'fecha',
            'direccion',
            'telefono',
            'email',
            'historia_clinica',
            'otro'
        ]))
    }),
    identityFound: z.strictObject({
        idType: z.string(),
        nationalId: z.string()
    }).nullable(),
    sourceLab: z.string().nullable(),
    extractedData: z.object({
        diagnosis: z.record(z.string(), z.unknown()).optional(),
        clinicalNotes: z.array(z.record(z.string(), z.unknown())).optional(),
        exam: z.record(z.string(), z.unknown()).optional(),
        biomarkers: z.array(z.object({
            biomarkerName: zExtractedField.optional(),
            originalName: z.string().optional(),
            loincCode: z.string().nullish(),
            mappingStatus: z.enum(['mapeado', 'no_mapeado']).optional(),
            value: zExtractedField.optional(),
            unit: zExtractedField.optional(),
            normalizedUnit: z.string().nullish(),
            referenceRange: zExtractedField.optional(),
            resultType: z.string().optional(),
            clinicalSignificance: z.string().optional(),
            significanceSource: z.enum([
                'documento',
                'regla',
                'inferido_ia'
            ]).optional()
        })).optional(),
        events: z.array(z.object({
            eventType: z.string().optional(),
            eventDate: zExtractedField.optional(),
            datePrecision: z.enum([
                'dia',
                'mes',
                'anio',
                'incierta'
            ]).optional(),
            description: zExtractedField.optional(),
            icd10Code: z.string().nullish(),
            cupsCode: z.string().nullish()
        })).optional(),
        attributes: z.array(z.object({
            key: z.string().optional(),
            value: zExtractedField.optional()
        })).optional(),
        priorTreatments: z.array(z.object({
            regimenName: zExtractedField.optional(),
            atcCodes: z.array(z.string()).optional(),
            setting: z.string().optional(),
            lineNumber: z.int().nullish(),
            startedAt: zExtractedField.optional(),
            endedAt: zExtractedField.optional(),
            endReason: z.string().optional()
        })).optional()
    }),
    catalogVersion: z.string()
});

export const zErrorTokenServicioInvalido = z.strictObject({
    error: z.literal('TOKEN_SERVICIO_INVALIDO'),
    message: z.string(),
    traceId: z.string()
});

export const zErrorCatalogVersionMismatch = z.strictObject({
    error: z.literal('CATALOG_VERSION_MISMATCH'),
    message: z.string(),
    traceId: z.string()
});

export const zErrorTipoNoHabilitado = z.strictObject({
    error: z.literal('TIPO_NO_HABILITADO'),
    message: z.string(),
    traceId: z.string()
});

/**
 * Error de validación sin eco: detail lleva la ubicación, el mensaje y el tipo, nunca el valor recibido (sin input ni ctx).
 */
export const zErrorValidacion = z.strictObject({
    error: z.literal('CUERPO_INVALIDO'),
    message: z.string(),
    traceId: z.string(),
    detail: z.array(z.strictObject({
        loc: z.array(z.union([
            z.string(),
            z.int()
        ])),
        msg: z.string(),
        type: z.string()
    }))
});

export const zErrorColaInferenciaLlena = z.strictObject({
    error: z.literal('COLA_INFERENCIA_LLENA'),
    message: z.string(),
    traceId: z.string()
});

export const zErrorLlmLocalNoDisponible = z.strictObject({
    error: z.literal('LOCAL_LLM_UNAVAILABLE'),
    message: z.string(),
    traceId: z.string()
});

/**
 * La salida del LLM no se pudo parsear o no cumple el esquema interno de afirmaciones. El message es fijo: nunca incluye detalles internos ni texto generado.
 */
export const zErrorSalidaLlmInvalida = z.strictObject({
    error: z.literal('LLM_OUTPUT_INVALID'),
    message: z.string(),
    traceId: z.string()
});

export const zErrorInterno = z.strictObject({
    error: z.literal('ERROR_INTERNO'),
    message: z.string(),
    traceId: z.string()
});

export const zErrorRecuperacionNoDisponible = z.strictObject({
    error: z.literal('RETRIEVAL_UNAVAILABLE'),
    message: z.string(),
    traceId: z.string()
});

export const zErrorNliNoDisponible = z.strictObject({
    error: z.literal('NLI_UNAVAILABLE'),
    message: z.string(),
    traceId: z.string()
});

export const zErrorTipoCancerNoRegistrado = z.strictObject({
    error: z.literal('TIPO_CANCER_NO_REGISTRADO'),
    message: z.string(),
    traceId: z.string()
});

export const zErrorDeadlineVencido = z.strictObject({
    error: z.literal('DEADLINE_VENCIDO'),
    message: z.string(),
    traceId: z.string()
});

/**
 * Campos de una cita, todos copiados del catálogo del corpus y nunca del texto generado (RN-04, RN-25). Auxiliar abierto: solo se compone dentro de un allOf que cierra con unevaluatedProperties false (CitedSource y FollowUpCitedSource). Un campo ausente en el catálogo viaja como null y la UI lo muestra como "No disponible".
 */
export const zCitedSourceFields = z.object({
    title: z.string(),
    sourceName: z.string(),
    externalId: z.string(),
    language: z.enum(['es', 'en']),
    sourceType: z.enum([
        'guideline',
        'clinical_trial',
        'literature',
        'genomic_study'
    ]),
    licenseClass: z.enum([
        'dominio_publico',
        'cc_by',
        'cc_by_sa',
        'cc_by_nc'
    ]),
    studyDesign: z.string().nullable(),
    trialPhase: z.string().nullable(),
    primaryEndpoint: z.string().nullable(),
    sampleSize: z.int().gte(0).nullable(),
    publishedAt: z.iso.date().nullable(),
    lastUpdatedAt: z.iso.date().nullable(),
    guidelineVersion: z.string().nullable(),
    authors: z.string().nullable(),
    sourceUrl: z.url().regex(/^https:\/\//).nullable(),
    possiblyOutdated: z.boolean(),
    newerVersionAvailable: z.boolean(),
    chunkTextSnapshot: z.string(),
    chunkId: z.string()
});

/**
 * Cita a una fuente del corpus: todos sus campos están copiados del catálogo del corpus, nunca del texto generado (RN-04, RN-25). Cierra el auxiliar CitedSourceFields.
 */
export const zCitedSource = zCitedSourceFields;

/**
 * Opción terapéutica descrita en la evidencia; es una descripción de lo que la evidencia recuperada reporta y no constituye una indicación para el paciente (RN-23).
 */
export const zEvidenceOption = z.strictObject({
    option: z.string(),
    rationale: z.string(),
    details: z.array(z.string().min(1)).max(2).optional(),
    applicabilitySummary: zApplicabilitySummary,
    populationNotComparable: z.boolean(),
    perSource: z.array(z.strictObject({
        externalId: z.string(),
        summary: zApplicabilitySummary,
        populationNotComparable: z.boolean()
    })),
    relevanceScore: z.number().gte(0).lte(1),
    warnings: z.array(z.enum([
        'datos_sin_verificar',
        'datos_en_conflicto',
        'datos_faltantes',
        'poblacion_no_comparable'
    ])),
    citedSources: z.array(zCitedSource).min(1)
});

export const zSupportedClaim = z.intersection(z.union([
    z.object({
        citedSources: z.array(z.unknown()).min(1).optional()
    }),
    z.object({
        patientDataRefs: z.array(z.unknown()).min(1).optional()
    })
]), z.strictObject({
    text: z.string().min(1),
    citedSources: z.array(zCitedSource),
    patientDataRefs: z.array(z.string().regex(/^r[0-9]+$/))
}));

/**
 * Síntesis de la evidencia recuperada. Siempre presente: en los Sprints 1–3 puede venir vacía (agreements y discrepancies sin elementos), pero el contrato es el final (ADR-26).
 */
export const zSynthesis = z.strictObject({
    agreements: z.array(zSupportedClaim),
    discrepancies: z.array(z.strictObject({
        claim: zSupportedClaim,
        explainedBy: z.enum([
            'poblacion',
            'endpoint',
            'fecha',
            'diseno',
            'no_identificada'
        ]),
        explanation: z.string().nullable()
    }))
});

export const zRagFollowUpResponse = z.strictObject({
    status: z.enum([
        'con_evidencia',
        'sin_evidencia',
        'fuera_de_contexto'
    ]),
    answer: z.array(zSupportedClaim),
    citedSources: z.array(zCitedSource),
    omittedClaims: z.int().gte(0),
    topRelevanceScore: z.number().gte(0).lte(1).nullable(),
    meta: zRagMeta
});

export const zStudyPopulationValue = z.strictObject({
    value: z.string().max(200),
    chunkId: z.string(),
    scope: z.enum([
        'elegibilidad',
        'subgrupo',
        'mencion'
    ])
});

/**
 * Un criterio del catálogo del tipo de cáncer y su estado frente al paciente (RN-28).
 */
export const zApplicabilityCriterion = z.strictObject({
    criterion: z.string(),
    patientValue: z.string().nullable(),
    studyPopulationValue: z.string().nullable(),
    studyPopulationValues: z.array(zStudyPopulationValue).optional(),
    partialReason: z.enum([
        'inclusiva',
        'mezclada',
        'rango_solapado',
        'solo_subgrupo'
    ]).nullish(),
    status: z.enum([
        'coincide',
        'parcial',
        'no_coincide',
        'desconocido'
    ]),
    unknownReason: z.enum([
        'falta_en_paciente',
        'no_reportado_por_fuente',
        'varios_valores_en_la_fuente',
        'valores_en_conflicto',
        'respaldo_fallido',
        'sin_regla_de_comparacion'
    ]).nullable(),
    isExclusionary: z.boolean(),
    patientDataWarning: z.enum([
        'sin_verificar',
        'en_conflicto',
        'faltante'
    ]).nullable(),
    citedSources: z.array(zCitedSource)
});

/**
 * Aplicabilidad de una fuente al paciente, criterio a criterio.
 */
export const zSourceApplicability = z.strictObject({
    externalId: z.string(),
    criteria: z.array(zApplicabilityCriterion),
    summary: zApplicabilitySummary,
    populationNotComparable: z.boolean()
});

/**
 * Usa los schemas compartidos de contracts/schemas/evidence.yaml (Synthesis, SourceApplicability, EvidenceOption, DiscardedOption). clinical-api agrega la Base del análisis y persiste el AIAnalysisRecord.
 */
export const zRagQueryInternalResponse = z.strictObject({
    status: z.enum(['con_evidencia', 'sin_evidencia']),
    synthesis: zSynthesis,
    applicability: z.array(zSourceApplicability),
    evidenceOptions: z.array(zEvidenceOption).max(3),
    discardedOptions: z.array(zDiscardedOption),
    limitations: z.array(z.strictObject({
        text: z.string(),
        origin: z.enum(['estructural', 'llm_verificado'])
    })),
    assumptions: z.array(z.strictObject({
        text: z.string()
    })),
    retrievalStats: z.strictObject({
        retrieved: z.int().gte(0),
        aboveThreshold: z.int().gte(0)
    }),
    omittedClaims: z.int().gte(0),
    agentSteps: z.array(z.strictObject({
        subQuery: z.string(),
        target: z.string(),
        foundEvidence: z.boolean()
    })),
    topRelevanceScore: z.number().gte(0).lte(1).nullable(),
    meta: zRagMeta
});

export const zRequestDeadline = z.iso.datetime();

/**
 * Mismo valor que traceId del cuerpo (o uno nuevo si falta o no cumple el patrón); liga todas las líneas de log de la request (NFR-10).
 */
export const zTraceIdHeader = zTraceId;

/**
 * El proceso está listo y, con LLM_PROVIDER=local, el LLM nativo responde.
 */
export const zGetHealthResponse = zHealthStatus;

export const zRagQueryBody = zRagQueryInternalRequest;

export const zRagQueryHeaders = z.object({
    'X-Request-Deadline': z.iso.datetime().optional(),
    'X-Trace-Id': zTraceId.optional()
});

/**
 * Resultado.
 */
export const zRagQueryResponse = zRagQueryInternalResponse;

export const zAnswerFollowUpBody = zRagFollowUpRequest;

export const zAnswerFollowUpHeaders = z.object({
    'X-Request-Deadline': z.iso.datetime().optional(),
    'X-Trace-Id': zTraceId.optional()
});

/**
 * Respuesta del turno.
 */
export const zAnswerFollowUpResponse = zRagFollowUpResponse;

export const zExtractDocumentBody = z.strictObject({
    file: z.string(),
    traceId: zTraceId,
    documentType: z.enum(['historia_clinica', 'examen']),
    dataClassification: zDataClassification,
    mode: z.enum(['registro', 'carga'])
});

/**
 * Datos extraídos (o piiScan.clean=false sin datos clínicos).
 */
export const zExtractDocumentResponse = zDocumentExtractResponse;

export const zCaseSummaryBody = zCaseSummaryInternalRequest;

/**
 * Resumen.
 */
export const zCaseSummaryResponse = zCaseSummaryInternalResponse;
