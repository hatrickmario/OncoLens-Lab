// GENERADO desde apps/clinical-api/openapi.yaml — no editar a mano (npm run contracts:generate)

import * as z from 'zod';

/**
 * Solo para revisión del oncólogo; no es una opción.
 */
export const zDiscardedOption = z.object({
    option: z.string(),
    rationale: z.string(),
    discardReason: z.enum([
        'cita_invalida',
        'afirmacion_sin_soporte',
        'sin_citas',
        'solo_soportada_por_analisis_previo'
    ]),
    unsupportedClaims: z.array(z.string())
});

/**
 * Conteo por estado de los criterios de aplicabilidad. Nunca un puntaje o porcentaje clínico (RN-28).
 */
export const zApplicabilitySummary = z.object({
    coincide: z.int().gte(0),
    parcial: z.int().gte(0),
    noCoincide: z.int().gte(0),
    desconocido: z.int().gte(0)
});

export const zLoginRequest = z.object({
    email: z.email().max(254)
});

export const zProvenance = z.object({
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
    conflict: z.boolean(),
    sourceDocumentId: z.uuid().nullable(),
    additionalSourceDocumentIds: z.array(z.uuid())
});

export const zDocument = z.object({
    id: z.uuid(),
    patientId: z.uuid(),
    documentType: z.enum(['historia_clinica', 'examen']),
    originalFilename: z.string(),
    ocrStatus: z.enum([
        'pendiente',
        'procesando',
        'completado',
        'error',
        'cuarentena_pii',
        'requiere_revision_identidad'
    ]),
    uploadedAt: z.iso.datetime()
});

export const zBiomarker = z.object({
    id: z.uuid(),
    name: z.string(),
    loincCode: z.string().nullable(),
    mappingStatus: z.enum(['mapeado', 'no_mapeado']),
    trend: z.enum([
        'sube',
        'baja',
        'estable'
    ]).nullable(),
    value: z.string(),
    unit: z.string().nullable(),
    referenceRange: z.string().nullable(),
    resultType: z.enum(['cuantitativo', 'cualitativo']),
    clinicalSignificance: z.enum([
        'normal',
        'alterado',
        'relevante',
        'crítico'
    ]),
    significanceSource: z.enum([
        'documento',
        'regla',
        'inferido_ia'
    ]),
    examType: z.string(),
    performedAt: z.iso.date(),
    provenance: zProvenance
});

/**
 * Registro manual de un biomarcador desde un faltante. El nombre viaja en el cuerpo, nunca en la URL.
 */
export const zBiomarkerManualCreate = z.object({
    name: z.string().min(1).max(200),
    value: z.string().min(1).max(200),
    unit: z.string().max(50).optional(),
    resultType: z.enum(['cuantitativo', 'cualitativo']),
    performedAt: z.iso.date()
});

/**
 * Gradación estructurada de un diagnóstico (solo lectura). En lectura gleasonScore e isupGradeGroup siempre vienen derivados de los patrones. El estado de revisión de cada gradación es provenance.reviewStatus.
 */
export const zDiagnosisGrading = z.object({
    id: z.uuid(),
    gradingSystem: z.enum(['gleason_isup', 'nottingham']),
    specimenType: z.enum(['biopsia', 'prostatectomia']).nullable(),
    gradeScope: z.enum([
        'nucleo_sitio',
        'peor',
        'global'
    ]).nullable(),
    gleasonPrimaryPattern: z.int().gte(3).lte(5).nullable(),
    gleasonSecondaryPattern: z.int().gte(3).lte(5).nullable(),
    gleasonScore: z.int().gte(6).lte(10).nullable(),
    isupGradeGroup: z.int().gte(1).lte(5).nullable(),
    nottinghamGrade: z.int().gte(1).lte(3).nullable(),
    isReference: z.boolean(),
    provenance: zProvenance
});

export const zDiagnosis = z.object({
    id: z.uuid(),
    cancerType: z.string(),
    icd10Code: z.string().nullable(),
    histology: z.string().nullable(),
    histologyCode: z.string().nullable(),
    grade: z.string().readonly().nullable(),
    gradings: z.array(zDiagnosisGrading).readonly(),
    stagingSystem: z.string(),
    stageValue: z.string(),
    performanceScale: z.string().nullable(),
    performanceValue: z.int().nullable(),
    diagnosedAt: z.iso.date(),
    isActive: z.boolean(),
    provenance: zProvenance
});

/**
 * Gradación de próstata. gleasonScore e isupGradeGroup son opcionales: el servidor los deriva de los patrones y, si llegan, valida su coherencia (422 GRADACION_INCOHERENTE): score = primario + secundario; grupo ISUP: 3+3 es 1, 3+4 es 2, 4+3 es 3, score 8 es 4, score 9 o 10 es 5 (DEC-05).
 */
export const zGleasonIsupGradingInput = z.object({
    gradingSystem: z.literal('gleason_isup'),
    specimenType: z.enum(['biopsia', 'prostatectomia']),
    gradeScope: z.enum([
        'nucleo_sitio',
        'peor',
        'global'
    ]),
    gleasonPrimaryPattern: z.int().gte(3).lte(5),
    gleasonSecondaryPattern: z.int().gte(3).lte(5),
    gleasonScore: z.int().gte(6).lte(10).optional(),
    isupGradeGroup: z.int().gte(1).lte(5).optional()
});

/**
 * Gradación de mama (Nottingham, grado 1 a 3).
 */
export const zNottinghamGradingInput = z.object({
    gradingSystem: z.literal('nottingham'),
    nottinghamGrade: z.int().gte(1).lte(3)
});

export const zDiagnosisGradingInput = z.discriminatedUnion('gradingSystem', [
    zGleasonIsupGradingInput,
    zNottinghamGradingInput
]);

/**
 * Sin diagnóstico vigente crea uno manual y exige cancerType, stagingSystem, stageValue y diagnosedAt (si faltan, 422 CUERPO_INVALIDO). Con diagnóstico vigente es una corrección explícita: crea uno manual_correction y el anterior pasa a reemplazado (RN-08). Los valores de catálogo (cancerType, stagingSystem, performanceScale) y el rango de performanceValue se validan contra el catálogo (422 VALOR_FUERA_DE_CATALOGO). grade no forma parte del cuerpo: es derivado.
 */
export const zDiagnosisManualCreate = z.object({
    cancerType: z.string().min(1).optional(),
    histology: z.string().max(200).nullish(),
    stagingSystem: z.string().min(1).optional(),
    stageValue: z.string().min(1).max(20).optional(),
    performanceScale: z.string().min(1).optional(),
    performanceValue: z.int().gte(0).optional(),
    diagnosedAt: z.iso.date().optional(),
    grading: zDiagnosisGradingInput.optional()
});

export const zIdType = z.enum([
    'cedula_ciudadania',
    'tarjeta_identidad',
    'cedula_extranjeria',
    'pasaporte',
    'seudonimo',
    'sintetico'
]);

export const zDataOrigin = z.enum([
    'sintetico',
    'real_anonimizado',
    'real_identificado'
]);

export const zLifecycleStatus = z.enum(['activo', 'egresado']);

/**
 * Vista del doctor (permiso clinical:read).
 */
export const zPatientSummary = z.object({
    view: z.literal('doctor'),
    id: z.uuid(),
    identification: z.object({
        idType: zIdType,
        nationalId: z.string(),
        fullName: z.string()
    }),
    dataOrigin: zDataOrigin,
    lifecycleStatus: zLifecycleStatus,
    birthYear: z.int(),
    requiresRatification: z.boolean(),
    cancerTypeEnabled: z.boolean(),
    diagnosis: zDiagnosis.nullable(),
    recentBiomarkers: z.array(zBiomarker),
    pendingReviewCount: z.int().gte(0),
    missingCriticalCount: z.int().gte(0)
});

/**
 * Vista del administrador: identificación enmascarada, estado y fecha de alta. Sin diagnóstico, biomarcadores, documentos, análisis ni contadores clínicos (mínimo privilegio).
 */
export const zPatientAdminSummary = z.object({
    view: z.literal('admin'),
    id: z.uuid(),
    idType: zIdType,
    nationalIdMasked: z.string(),
    dataOrigin: zDataOrigin,
    lifecycleStatus: zLifecycleStatus,
    registeredAt: z.iso.datetime()
});

export const zPatientSearchRequest = z.intersection(z.unknown(), z.object({
    idType: zIdType.optional(),
    nationalId: z.string().min(1).optional(),
    name: z.string().min(2).optional(),
    page: z.int().gte(1).optional().default(1)
}));

export const zPatientPage = z.object({
    items: z.array(z.union([zPatientSummary, zPatientAdminSummary])),
    page: z.int().gte(1),
    pageSize: z.int().gte(1),
    total: z.int().gte(0)
});

/**
 * Filtros de la petición; todos opcionales.
 */
export const zEvidenceAnalysisFilters = z.object({
    historiaCompleta: z.boolean().optional(),
    soloBiomarcadoresRelevantes: z.boolean().optional(),
    ultimosSeisMeses: z.boolean().optional(),
    antecedentesFamiliares: z.boolean().optional(),
    publishedFromYear: z.int().nullish()
});

export const zEvidenceAnalysisRequest = z.object({
    patientId: z.uuid(),
    query: z.string().min(1).max(2000),
    questionTemplateId: z.string().nullish(),
    continueWithWarning: z.boolean().optional().default(false),
    sourcesSelected: z.intersection(z.union([
        z.object({
            guias: z.literal(true).optional()
        }),
        z.object({
            ensayos: z.literal(true).optional()
        }),
        z.object({
            publicaciones: z.literal(true).optional()
        })
    ]), z.object({
        guias: z.boolean(),
        ensayos: z.boolean(),
        publicaciones: z.boolean()
    })),
    filtersApplied: zEvidenceAnalysisFilters.optional()
});

/**
 * Filtros efectivos con los que se ejecutó el análisis.
 */
export const zAppliedFilters = z.object({
    historiaCompleta: z.boolean(),
    soloBiomarcadoresRelevantes: z.boolean(),
    ultimosSeisMeses: z.boolean(),
    antecedentesFamiliares: z.boolean(),
    publishedFromYear: z.int().nullable()
});

/**
 * Base del análisis (FR-27). Siempre presente, también con sin_evidencia.
 */
export const zAnalysisBasis = z.object({
    patientDataUsed: z.array(z.object({
        label: z.string(),
        reviewStatus: z.enum([
            'auto_aceptado',
            'requiere_revision',
            'verificado',
            'corregido'
        ]),
        conflict: z.boolean()
    })),
    missingCriticalData: z.array(z.string()),
    continuedWithWarning: z.boolean(),
    assumptions: z.array(z.object({
        text: z.string(),
        origin: z.enum(['regla_catalogo', 'llm_verificado'])
    })),
    sourcesConsulted: z.object({
        selected: z.array(z.enum([
            'guias',
            'ensayos',
            'publicaciones'
        ])),
        filters: zAppliedFilters,
        retrieved: z.int().gte(0),
        aboveThreshold: z.int().gte(0)
    }),
    sourcesNotIncluded: z.array(z.string()),
    corpusCutoffDate: z.iso.date(),
    limitations: z.array(z.object({
        text: z.string(),
        origin: z.enum(['estructural', 'llm_verificado'])
    })),
    priorAnalysesUsed: z.array(z.object({
        analysisId: z.uuid(),
        createdAt: z.iso.datetime()
    })),
    agentSteps: z.array(z.object({
        subQuery: z.string(),
        target: z.string(),
        foundEvidence: z.boolean()
    })),
    omittedClaims: z.int().gte(0)
});

/**
 * Vigencia del análisis (FR-12, FR-26). En un análisis nuevo es neutra: patientData false, changedData vacío y newerEvidenceOrCatalog false; el detector de vigencia la calcula después.
 */
export const zStaleness = z.object({
    patientData: z.boolean(),
    changedData: z.array(z.string()),
    newerEvidenceOrCatalog: z.boolean()
});

/**
 * Resuelve una referencia opaca rN de la respuesta a la entidad real del paciente. Es propio de clinical-api: el UUID nunca viaja a Backend 2.
 */
export const zPatientDataLink = z.object({
    dataRef: z.string().regex(/^r[0-9]+$/),
    entityType: z.enum([
        'diagnosis',
        'biomarker',
        'clinical_note',
        'clinical_attribute',
        'prior_treatment',
        'clinical_event'
    ]),
    entityId: z.uuid()
});

export const zFollowUpCreate = z.object({
    question: z.string().min(1).max(2000)
});

export const zErrorNoAutenticado = z.object({
    error: z.literal('NO_AUTENTICADO'),
    message: z.string(),
    traceId: z.string()
});

export const zErrorCredencialesInvalidas = z.object({
    error: z.literal('CREDENCIALES_INVALIDAS'),
    message: z.string(),
    traceId: z.string()
});

export const zErrorPermisoDenegado = z.object({
    error: z.literal('PERMISO_DENEGADO'),
    message: z.string(),
    traceId: z.string()
});

export const zErrorPermisoOOptOut = z.object({
    error: z.enum(['PERMISO_DENEGADO', 'OPT_OUT_ANALISIS_IA']),
    message: z.string(),
    traceId: z.string()
});

export const zErrorNoEncontrado = z.object({
    error: z.literal('NO_ENCONTRADO'),
    message: z.string(),
    traceId: z.string()
});

export const zErrorLimiteSeguimiento = z.object({
    error: z.literal('LIMITE_SEGUIMIENTO'),
    message: z.string(),
    traceId: z.string()
});

export const zErrorDocumentoDuplicado = z.object({
    error: z.literal('DOCUMENTO_DUPLICADO'),
    message: z.string(),
    traceId: z.string()
});

export const zErrorCuerpoInvalido = z.object({
    error: z.literal('CUERPO_INVALIDO'),
    message: z.string(),
    traceId: z.string()
});

export const zErrorSolicitudNoProcesable = z.object({
    error: z.enum(['CUERPO_INVALIDO', 'PACIENTE_EGRESADO']),
    message: z.string(),
    traceId: z.string()
});

export const zErrorRegistroManualInvalido = z.object({
    error: z.enum([
        'CUERPO_INVALIDO',
        'PACIENTE_EGRESADO',
        'VALOR_FUERA_DE_CATALOGO'
    ]),
    message: z.string(),
    traceId: z.string()
});

export const zErrorDiagnosticoInvalido = z.object({
    error: z.enum([
        'CUERPO_INVALIDO',
        'PACIENTE_EGRESADO',
        'VALOR_FUERA_DE_CATALOGO',
        'GRADACION_INCOHERENTE'
    ]),
    message: z.string(),
    traceId: z.string()
});

export const zErrorSeguimientoNoProcesable = z.object({
    error: z.enum([
        'CUERPO_INVALIDO',
        'PACIENTE_EGRESADO',
        'ANALISIS_SIN_EVIDENCIA'
    ]),
    message: z.string(),
    traceId: z.string()
});

export const zErrorLimiteSolicitudes = z.object({
    error: z.literal('LIMITE_SOLICITUDES'),
    message: z.string(),
    traceId: z.string()
});

export const zErrorLimiteGeneracion = z.object({
    error: z.enum(['LIMITE_SOLICITUDES', 'COLA_INFERENCIA_LLENA']),
    message: z.string(),
    traceId: z.string()
});

export const zErrorServicioIa = z.object({
    error: z.literal('ERROR_SERVICIO_IA'),
    message: z.string(),
    traceId: z.string()
});

export const zErrorLlmLocalNoDisponible = z.object({
    error: z.literal('LOCAL_LLM_UNAVAILABLE'),
    message: z.string(),
    traceId: z.string()
});

export const zErrorDeadlineVencido = z.object({
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
export const zEvidenceOption = z.object({
    option: z.string(),
    rationale: z.string(),
    applicabilitySummary: zApplicabilitySummary,
    populationNotComparable: z.boolean(),
    perSource: z.array(z.object({
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
]), z.object({
    text: z.string().min(1),
    citedSources: z.array(zCitedSource),
    patientDataRefs: z.array(z.string().regex(/^r[0-9]+$/))
}));

/**
 * Síntesis de la evidencia recuperada. Siempre presente: en los Sprints 1–3 puede venir vacía (agreements y discrepancies sin elementos), pero el contrato es el final (ADR-26).
 */
export const zSynthesis = z.object({
    agreements: z.array(zSupportedClaim),
    discrepancies: z.array(z.object({
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

/**
 * Un criterio del catálogo del tipo de cáncer y su estado frente al paciente (RN-28).
 */
export const zApplicabilityCriterion = z.object({
    criterion: z.string(),
    patientValue: z.string().nullable(),
    studyPopulationValue: z.string().nullable(),
    status: z.enum([
        'coincide',
        'parcial',
        'no_coincide',
        'desconocido'
    ]),
    unknownReason: z.enum(['falta_en_paciente', 'no_reportado_por_fuente']).nullable(),
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
export const zSourceApplicability = z.object({
    externalId: z.string(),
    criteria: z.array(zApplicabilityCriterion),
    summary: zApplicabilitySummary,
    populationNotComparable: z.boolean()
});

/**
 * Análisis de evidencia (síntesis, aplicabilidad y opciones descritas en la evidencia, RN-23).
 */
export const zEvidenceAnalysis = z.object({
    id: z.uuid(),
    traceId: z.string(),
    queryText: z.string(),
    questionTemplateId: z.string().nullable(),
    queryLanguage: z.enum(['es', 'en']),
    status: z.enum([
        'con_evidencia',
        'sin_evidencia',
        'tipo_no_habilitado'
    ]),
    synthesis: zSynthesis,
    applicability: z.array(zSourceApplicability),
    evidenceOptions: z.array(zEvidenceOption).max(3),
    discardedOptions: z.array(zDiscardedOption),
    analysisBasis: zAnalysisBasis,
    topRelevanceScore: z.number().gte(0).lte(1).nullable(),
    staleness: zStaleness,
    rerunOfAnalysisId: z.uuid().nullable(),
    patientDataLinks: z.array(zPatientDataLink),
    disclaimer: z.string().min(1),
    createdAt: z.iso.datetime()
});

/**
 * Cita de un turno de seguimiento, con la marca de fuente nueva que calcula clinical-api.
 */
export const zFollowUpCitedSource = zCitedSourceFields.and(z.object({
    isNewSource: z.boolean()
}));

export const zFollowUpTurn = z.object({
    id: z.uuid(),
    analysisId: z.uuid(),
    turnNumber: z.int().gte(1),
    question: z.string(),
    status: z.enum([
        'con_evidencia',
        'sin_evidencia',
        'fuera_de_contexto'
    ]),
    answer: z.array(zSupportedClaim),
    citedSources: z.array(zFollowUpCitedSource),
    omittedClaims: z.int().gte(0),
    patientDataLinks: z.array(zPatientDataLink),
    disclaimer: z.string().min(1),
    createdAt: z.iso.datetime()
});

export const zLoginRequestWritable = z.object({
    email: z.email().max(254),
    password: z.string().min(1).max(1024)
});

export const zDiagnosisWritable = z.object({
    id: z.uuid(),
    cancerType: z.string(),
    icd10Code: z.string().nullable(),
    histology: z.string().nullable(),
    histologyCode: z.string().nullable(),
    stagingSystem: z.string(),
    stageValue: z.string(),
    performanceScale: z.string().nullable(),
    performanceValue: z.int().nullable(),
    diagnosedAt: z.iso.date(),
    isActive: z.boolean(),
    provenance: zProvenance
});

/**
 * Vista del doctor (permiso clinical:read).
 */
export const zPatientSummaryWritable = z.object({
    view: z.literal('doctor'),
    id: z.uuid(),
    identification: z.object({
        idType: zIdType,
        nationalId: z.string(),
        fullName: z.string()
    }),
    dataOrigin: zDataOrigin,
    lifecycleStatus: zLifecycleStatus,
    birthYear: z.int(),
    requiresRatification: z.boolean(),
    cancerTypeEnabled: z.boolean(),
    diagnosis: zDiagnosisWritable.nullable(),
    recentBiomarkers: z.array(zBiomarker),
    pendingReviewCount: z.int().gte(0),
    missingCriticalCount: z.int().gte(0)
});

export const zPatientPageWritable = z.object({
    items: z.array(z.union([zPatientSummaryWritable, zPatientAdminSummary])),
    page: z.int().gte(1),
    pageSize: z.int().gte(1),
    total: z.int().gte(0)
});

export const zPatientId = z.uuid();

export const zAnalysisId = z.uuid();

export const zLoginBody = zLoginRequestWritable;

/**
 * Sesión iniciada; no hay cuerpo.
 */
export const zLoginResponse = z.void();

/**
 * Sesión revocada; no hay cuerpo.
 */
export const zLogoutResponse = z.void();

export const zListPatientsQuery = z.object({
    status: z.enum(['activo', 'egresado']).optional(),
    dataOrigin: z.enum([
        'sintetico',
        'real_anonimizado',
        'real_identificado'
    ]).optional(),
    page: z.int().gte(1).optional().default(1)
});

/**
 * Página de pacientes.
 */
export const zListPatientsResponse = zPatientPage;

export const zSearchPatientsBody = zPatientSearchRequest;

/**
 * Página de pacientes que coinciden.
 */
export const zSearchPatientsResponse = zPatientPage;

export const zGetPatientPath = z.object({
    patientId: z.uuid()
});

/**
 * Ficha del paciente.
 */
export const zGetPatientResponse = z.discriminatedUnion('view', [
    zPatientSummary,
    zPatientAdminSummary
]);

export const zUploadDocumentBody = z.object({
    file: z.string(),
    documentType: z.enum(['historia_clinica', 'examen'])
});

export const zUploadDocumentPath = z.object({
    patientId: z.uuid()
});

/**
 * Documento recibido, extracción en curso.
 */
export const zUploadDocumentResponse = zDocument;

export const zCreateEvidenceAnalysisBody = zEvidenceAnalysisRequest;

export const zCreateEvidenceAnalysisHeaders = z.object({
    'Idempotency-Key': z.string().optional()
});

/**
 * Resultado del análisis.
 */
export const zCreateEvidenceAnalysisResponse = zEvidenceAnalysis;

export const zCreateManualBiomarkerBody = zBiomarkerManualCreate;

export const zCreateManualBiomarkerPath = z.object({
    patientId: z.uuid()
});

/**
 * Biomarcador registrado.
 */
export const zCreateManualBiomarkerResponse = zBiomarker;

export const zCreateManualDiagnosisBody = zDiagnosisManualCreate;

export const zCreateManualDiagnosisPath = z.object({
    patientId: z.uuid()
});

/**
 * Diagnóstico registrado.
 */
export const zCreateManualDiagnosisResponse = zDiagnosis;

export const zListFollowUpsPath = z.object({
    analysisId: z.uuid()
});

/**
 * Turnos en orden de creación.
 */
export const zListFollowUpsResponse = z.array(zFollowUpTurn);

export const zCreateFollowUpBody = zFollowUpCreate;

export const zCreateFollowUpPath = z.object({
    analysisId: z.uuid()
});

/**
 * Turno de seguimiento registrado.
 */
export const zCreateFollowUpResponse = zFollowUpTurn;
