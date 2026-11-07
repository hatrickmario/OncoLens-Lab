// GENERADO desde apps/clinical-api/openapi.yaml — no editar a mano (npm run contracts:generate)

export type ClientOptions = {
    baseUrl: 'http://clinical-api:3000' | (string & {});
};

export type HealthStatus = {
    status: 'ok';
    /**
     * Nombres de las claves de configuración cargadas; nunca valores (RN-14).
     */
    configKeys?: Array<string>;
    /**
     * Versión del contrato (info.version) del servicio que responde.
     */
    serviceVersion?: string;
    /**
     * Versión del catálogo clínico montado (manifest.json); sin ruta ni contenido.
     */
    catalogVersion?: string;
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
    /**
     * Párrafos opcionales de detalle que amplían la justificación, en el idioma de la pregunta. Cada afirmación pasó citas y NLI (RN-01) y el filtro de lenguaje (RN-23); el párrafo que no las supera se omite y cuenta en omittedClaims. Ausente (nunca vacío) si ninguno se soporta.
     */
    details?: Array<string>;
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
    discardReason: 'cita_invalida' | 'afirmacion_sin_soporte' | 'sin_citas' | 'solo_soportada_por_analisis_previo' | 'lenguaje_no_permitido';
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
    /**
     * Deprecado; se retira en el S5 (ADR-26). Con lista, el primer valor con scope elegibilidad de los fragmentos citados por la opción; si no hay ninguno, null. Con la forma antigua, su texto.
     *
     * @deprecated
     */
    studyPopulationValue: string | null;
    /**
     * Valores de población de los fragmentos que cita la opción (ADR-47). El tope POPULATION_MAX_VALUES_PER_CRITERION rige por fragmento y criterio al extraer; aquí no hay maxItems. Opcional: las respuestas con la forma antigua no lo llevan.
     */
    studyPopulationValues?: Array<StudyPopulationValue>;
    /**
     * Motivo del estado parcial. Opcional.
     */
    partialReason?: 'inclusiva' | 'mezclada' | 'rango_solapado' | 'solo_subgrupo' | null;
    /**
     * ApplicabilityStatus
     */
    status: 'coincide' | 'parcial' | 'no_coincide' | 'desconocido';
    /**
     * varios_valores_en_la_fuente está reservado (ADR-47): ningún change del S4 lo produce.
     */
    unknownReason: 'falta_en_paciente' | 'no_reportado_por_fuente' | 'varios_valores_en_la_fuente' | 'valores_en_conflicto' | 'respaldo_fallido' | 'sin_regla_de_comparacion' | null;
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

export type LoginRequest = {
    email: string;
};

export type Provenance = {
    entryMethod: 'ocr' | 'manual' | 'manual_correction' | 'seed';
    extractionConfidence: 'alta' | 'media' | 'baja' | 'n_a';
    reviewStatus: 'auto_aceptado' | 'requiere_revision' | 'verificado' | 'corregido';
    conflict: boolean;
    sourceDocumentId: string | null;
    /**
     * Duplicados fusionados.
     */
    additionalSourceDocumentIds: Array<string>;
};

export type Document = {
    id: string;
    patientId: string;
    documentType: 'historia_clinica' | 'examen';
    originalFilename: string;
    ocrStatus: 'pendiente' | 'procesando' | 'completado' | 'error' | 'cuarentena_pii' | 'requiere_revision_identidad';
    uploadedAt: string;
};

export type Biomarker = {
    id: string;
    name: string;
    loincCode: string | null;
    mappingStatus: 'mapeado' | 'no_mapeado';
    /**
     * Respecto del valor anterior.
     */
    trend: 'sube' | 'baja' | 'estable' | null;
    value: string;
    unit: string | null;
    referenceRange: string | null;
    resultType: 'cuantitativo' | 'cualitativo';
    clinicalSignificance: 'normal' | 'alterado' | 'relevante' | 'crítico';
    significanceSource: 'documento' | 'regla' | 'inferido_ia';
    examType: string;
    performedAt: string;
    provenance: Provenance;
    /**
     * Fila a la que esta corrección reemplazó (ADR-50); ausente en un dato que nunca se corrigió. Le dice a la UI si hay histórico.
     */
    supersedesId?: string | null;
};

/**
 * Vista de caso (FR-21, FR-23). Sin identidad del paciente. Cada dato lleva su procedencia.
 */
export type CaseView = {
    timeline: Array<{
        id: string;
        eventType: string;
        /**
         * true si se deriva de Diagnosis, Exam, PriorTreatment, Treatment o AIAnalysisRecord (ADR-32).
         */
        derived: boolean;
        eventDate: string | null;
        datePrecision: 'dia' | 'mes' | 'anio' | 'incierta';
        /**
         * Texto corto, enmascarable.
         */
        description: string;
        codes: {
            icd10: string | null;
            cups: string | null;
        };
        provenance: Provenance;
    }>;
    priorTreatments: Array<{
        /**
         * Fila vigente; es la que se corrige (POST …/prior-treatments/{treatmentId}/corrections).
         */
        id: string;
        /**
         * Fila a la que esta corrección reemplazó (ADR-50); ausente si nunca se corrigió.
         */
        supersedesId?: string | null;
        lineNumber: number | null;
        setting: string;
        regimenName: string;
        atcCodes: Array<string>;
        startedAt: string | null;
        endedAt: string | null;
        ongoing: boolean;
        endReason: string;
        provenance: Provenance;
    }>;
    /**
     * ClinicalAttribute (estado menopáusico, estado de castración, sitios metastásicos…).
     */
    attributes: Array<{
        /**
         * Fila vigente; es la que se corrige (POST …/clinical-attributes/{attributeId}/corrections).
         */
        id: string;
        /**
         * Fila a la que esta corrección reemplazó (ADR-50); ausente si nunca se corrigió.
         */
        supersedesId?: string | null;
        key: string;
        value: string;
        observedAt: string | null;
        provenance: Provenance;
    }>;
    biomarkerSeries: Array<{
        name: string;
        loincCode: string | null;
        points: Array<{
            value: string;
            unit: string | null;
            performedAt: string;
            provenance: Provenance;
        }>;
    }>;
    /**
     * Checklist de datos críticos (determinista, FR-23).
     */
    completeness: Array<{
        item: string;
        status: 'presente_verificado' | 'presente_sin_verificar' | 'faltante' | 'no_aplica';
    }>;
    catalogVersion: string;
};

/**
 * Registro manual de una línea de tratamiento previa. Un tratamiento en curso (ongoing = true) no lleva endedAt ni endReason; uno terminado (ongoing = false) exige endReason. endedAt no puede ser anterior a startedAt.
 */
export type PriorTreatmentManualCreate = {
    lineNumber?: number;
    setting: 'neoadyuvante' | 'adyuvante' | 'primera_linea_metastasica' | 'segunda_linea_metastasica' | 'linea_posterior_metastasica' | 'otro' | 'desconocido';
    regimenName: string;
    startedAt?: string;
    endedAt?: string;
    ongoing: boolean;
    endReason?: 'progresion' | 'toxicidad' | 'completado' | 'otro' | 'desconocido';
};

export type PriorTreatment = {
    id: string;
    lineNumber: number | null;
    setting: string;
    /**
     * Tal como lo escribió quien registra.
     */
    regimenName: string;
    /**
     * Solo códigos ATC del catálogo versionado; vacío si no hay mapeo (RN-27).
     */
    atcCodes: Array<string>;
    mappingStatus: 'mapeado' | 'no_mapeado';
    startedAt: string | null;
    endedAt: string | null;
    ongoing: boolean;
    endReason: 'progresion' | 'toxicidad' | 'completado' | 'otro' | 'desconocido';
    provenance: Provenance;
    /**
     * Fila a la que esta corrección reemplazó (ADR-50); ausente en un dato que nunca se corrigió. Le dice a la UI si hay histórico.
     */
    supersedesId?: string | null;
};

/**
 * Registro manual de un atributo clínico. La clave y el valor se validan contra el catálogo montado para el tipo de cáncer del diagnóstico vigente (RN-29).
 */
export type ClinicalAttributeManualCreate = {
    attributeKey: string;
    value: string;
    observedAt?: string;
};

export type ClinicalAttribute = {
    id: string;
    key: string;
    value: string;
    observedAt: string | null;
    datePrecision: 'dia' | 'mes' | 'anio' | 'incierta';
    provenance: Provenance;
    /**
     * Fila a la que esta corrección reemplazó (ADR-50); ausente en un dato que nunca se corrigió. Le dice a la UI si hay histórico.
     */
    supersedesId?: string | null;
};

/**
 * Corrección de un atributo clínico. La clave es inmutable (no se admite attributeKey). value se valida contra el catálogo (RN-29); observedAt omitido conserva la fecha anterior.
 */
export type ClinicalAttributeCorrection = {
    value: string;
    observedAt?: string;
};

export type ClinicalAttributeList = {
    items: Array<ClinicalAttribute>;
    /**
     * Atributos que el catálogo permite registrar para el tipo de cáncer del paciente (RN-29).
     */
    allowedAttributes: Array<{
        key: string;
        label: string;
        values: Array<{
            value: string;
            label: string;
        }>;
    }>;
    catalogVersion: string;
};

/**
 * Valores del catálogo versionado para los formularios de registro manual. Backend 1 es el dueño de la normalización: el cliente solo ofrece estos valores y el servidor decide el mapeo (RN-27, ADR-33).
 */
export type ManualEntryOptions = {
    catalogVersion: string;
    /**
     * Tipo de cáncer del diagnóstico vigente; null sin diagnóstico vigente.
     */
    cancerType: string | null;
    enabledCancerTypes: Array<string>;
    biomarkerTerms: Array<{
        term: string;
        label: string;
    }>;
    stagingSystems: Array<string>;
    performanceScales: Array<{
        code: string;
        minimum: number;
        maximum: number;
    }>;
    gradingSystems: Array<'nottingham' | 'gleason_isup'>;
    /**
     * Destino de cada ítem crítico del catálogo, para abrir el formulario desde un faltante.
     */
    criticalItems: Array<{
        item: string;
        entity: 'Diagnosis' | 'Biomarker' | 'ClinicalAttribute' | 'PriorTreatment';
        field: string | null;
        /**
         * Término del biomarcador (match.name) si entity es Biomarker; null en otro caso.
         */
        term: string | null;
    }>;
};

/**
 * Registro manual de un biomarcador desde un faltante. El nombre viaja en el cuerpo, nunca en la URL.
 */
export type BiomarkerManualCreate = {
    name: string;
    value: string;
    unit?: string;
    resultType: 'cuantitativo' | 'cualitativo';
    performedAt: string;
};

/**
 * Corrección del valor de un biomarcador vigente. El término no cambia. performedAt es opcional: si se envía y difiere del examen, el dato pasa a un Examen de corrección.
 */
export type BiomarkerCorrection = {
    value: string;
    unit?: string | null;
    referenceRange?: string | null;
    /**
     * Posterior a hoy se rechaza con 422 y field = performedAt.
     */
    performedAt?: string;
};

export type NoteType = 'antecedente' | 'comorbilidad' | 'alergia' | 'antecedente_familiar' | 'nota_libre';

export type ClinicalNote = {
    id: string;
    noteType: NoteType;
    /**
     * El máximo lo impone CLINICAL_NOTE_MAX_CHARS (configuración, RN-22).
     */
    content: string;
    recordedAt: string;
    provenance: Provenance;
    supersedesId: string | null;
};

export type ClinicalNoteList = {
    items: Array<ClinicalNote>;
};

export type ClinicalNoteCorrection = {
    content?: string;
    noteType?: NoteType;
};

/**
 * Una versión reemplazada. value y unit en biomarcadores (value también en atributos); content y noteType solo en notas; regimenName solo en tratamientos previos.
 */
export type CorrectionHistoryEntry = {
    id: string;
    entryMethod: 'ocr' | 'manual' | 'manual_correction' | 'seed';
    reviewStatus: 'reemplazado';
    recordedAt: string;
    createdAt: string;
    value?: string;
    unit?: string | null;
    content?: string;
    noteType?: NoteType;
    /**
     * Esquema de la versión reemplazada; solo en tratamientos previos.
     */
    regimenName?: string;
};

/**
 * De la más reciente a la más antigua, sin la vigente; tope CORRECTION_HISTORY_MAX (RN-22).
 */
export type CorrectionHistory = {
    items: Array<CorrectionHistoryEntry>;
};

export type ErrorCorreccionInvalida = {
    error: 'CUERPO_INVALIDO' | 'PACIENTE_EGRESADO' | 'VALOR_FUERA_DE_CATALOGO';
    /**
     * Nombre lógico del dato que causó el error, no siempre una propiedad del cuerpo (p. ej. attributeKey al corregir la declaración de ausencia); ausente si el error no es de un campo (p. ej. PACIENTE_EGRESADO). Nunca repite el valor enviado.
     */
    field?: string;
    message: string;
    traceId: string;
};

export type ErrorDatoNoVigente = {
    error: 'DATO_NO_VIGENTE';
    message: string;
    traceId: string;
};

/**
 * Gradación estructurada de un diagnóstico (solo lectura). En lectura gleasonScore e isupGradeGroup siempre vienen derivados de los patrones. El estado de revisión de cada gradación es provenance.reviewStatus.
 */
export type DiagnosisGrading = {
    id: string;
    gradingSystem: 'gleason_isup' | 'nottingham';
    specimenType: 'biopsia' | 'prostatectomia' | null;
    gradeScope: 'nucleo_sitio' | 'peor' | 'global' | null;
    gleasonPrimaryPattern: number | null;
    gleasonSecondaryPattern: number | null;
    gleasonScore: number | null;
    isupGradeGroup: number | null;
    nottinghamGrade: number | null;
    /**
     * Es la gradación de la que se deriva Diagnosis.grade.
     */
    isReference: boolean;
    provenance: Provenance;
};

export type Diagnosis = {
    id: string;
    cancerType: string;
    icd10Code: string | null;
    histology: string | null;
    histologyCode: string | null;
    /**
     * Texto canónico derivado de la gradación de referencia; nunca se escribe a mano. Próstata: "Gleason 4+3=7 · ISUP 3". Mama: "Nottingham grado 2".
     */
    readonly grade: string | null;
    readonly gradings: Array<DiagnosisGrading>;
    stagingSystem: string;
    stageValue: string;
    performanceScale: string | null;
    performanceValue: number | null;
    diagnosedAt: string;
    isActive: boolean;
    provenance: Provenance;
};

/**
 * Sin diagnóstico vigente crea uno manual y exige cancerType, stagingSystem, stageValue y diagnosedAt (si faltan, 422 CUERPO_INVALIDO). Con diagnóstico vigente es una corrección explícita: crea uno manual_correction y el anterior pasa a reemplazado (RN-08). Los valores de catálogo (cancerType, stagingSystem, performanceScale) y el rango de performanceValue se validan contra el catálogo (422 VALOR_FUERA_DE_CATALOGO). grade no forma parte del cuerpo: es derivado.
 */
export type DiagnosisManualCreate = {
    cancerType?: string;
    histology?: string | null;
    stagingSystem?: string;
    stageValue?: string;
    performanceScale?: string;
    performanceValue?: number;
    diagnosedAt?: string;
    grading?: DiagnosisGradingInput;
};

export type DiagnosisGradingInput = ({
    gradingSystem: 'gleason_isup';
} & GleasonIsupGradingInput) | ({
    gradingSystem: 'nottingham';
} & NottinghamGradingInput);

/**
 * Gradación de próstata. gleasonScore e isupGradeGroup son opcionales: el servidor los deriva de los patrones y, si llegan, valida su coherencia (422 GRADACION_INCOHERENTE): score = primario + secundario; grupo ISUP: 3+3 es 1, 3+4 es 2, 4+3 es 3, score 8 es 4, score 9 o 10 es 5 (DEC-05).
 */
export type GleasonIsupGradingInput = {
    gradingSystem: 'gleason_isup';
    specimenType: 'biopsia' | 'prostatectomia';
    gradeScope: 'nucleo_sitio' | 'peor' | 'global';
    gleasonPrimaryPattern: number;
    gleasonSecondaryPattern: number;
    gleasonScore?: number;
    isupGradeGroup?: number;
};

/**
 * Gradación de mama (Nottingham, grado 1 a 3).
 */
export type NottinghamGradingInput = {
    gradingSystem: 'nottingham';
    nottinghamGrade: number;
};

export type CompletenessView = {
    catalogVersion: string;
    /**
     * false si el Diagnosis activo es de un tipo fuera de ENABLED_CANCER_TYPES o si no hay Diagnosis activo; entonces items = [].
     */
    cancerTypeEnabled: boolean;
    items: Array<CompletenessItem>;
};

export type CompletenessItem = {
    /**
     * Clave del catálogo (her2_ihq).
     */
    item: string;
    /**
     * label.es del catálogo; nunca valores del paciente.
     */
    label: string;
    status: 'presente_verificado' | 'presente_sin_verificar' | 'faltante' | 'no_aplica';
    /**
     * regla si status es faltante o no_aplica; si no, sale del entryMethod del registro que cuenta.
     */
    origin: 'documento' | 'manual' | 'correccion' | 'seed' | 'regla';
    /**
     * null si y solo si status es faltante o no_aplica.
     */
    provenance: CompletenessProvenance | null;
    /**
     * Cómo se cumplió un ítem presente: registro (hay registros suficientes en su destino) o declaracion_de_ausencia (el catálogo declara un satisfiedBy y hay una declaración vigente, p. ej. sin_tratamiento_previo, sin fila en el destino). Ausente cuando status es faltante o no_aplica, y en los ítems que no tienen satisfiedBy; en un ítem presente, ausente equivale a registro. Hoy solo tratamientos_previos lo emite.
     */
    resolvedBy?: 'registro' | 'declaracion_de_ausencia';
    destination: {
        entity: 'Diagnosis' | 'Biomarker' | 'ClinicalAttribute' | 'PriorTreatment';
        /**
         * null cuando el destino es la entidad entera (PriorTreatment).
         */
        field: string | null;
    };
    /**
     * Condición del catálogo que no se cumplió; no nula solo si status es no_aplica.
     */
    condition: {
        item: string;
        operator: 'igualdad' | 'pertenencia' | 'prefijo';
        values: Array<string>;
    } | null;
};

/**
 * Subconjunto propio del checklist; no es el Provenance completo (no lleva extractionConfidence, conflict ni additionalSourceDocumentIds, que el cálculo no lee).
 */
export type CompletenessProvenance = {
    entryMethod: 'ocr' | 'manual' | 'manual_correction' | 'seed';
    reviewStatus: 'auto_aceptado' | 'requiere_revision' | 'verificado' | 'corregido';
    sourceDocumentId: string | null;
    /**
     * Solo si el registro viene de un documento y su source_span tiene página.
     */
    page?: number;
};

/**
 * Vista del doctor (permiso clinical:read).
 */
export type PatientSummary = {
    view: 'doctor';
    id: string;
    /**
     * Solo para el doctor autorizado; cada lectura se audita.
     */
    identification: {
        idType: IdType;
        nationalId: string;
        fullName: string;
    };
    dataOrigin: DataOrigin;
    lifecycleStatus: LifecycleStatus;
    birthYear: number;
    requiresRatification: boolean;
    /**
     * false significa fuera del alcance del piloto.
     */
    cancerTypeEnabled: boolean;
    diagnosis: Diagnosis | null;
    /**
     * Último valor por biomarcador (serie completa en GET …/biomarkers?biomarkerName=).
     */
    recentBiomarkers: Array<Biomarker>;
    pendingReviewCount: number;
    /**
     * Datos críticos faltantes (FR-23).
     */
    missingCriticalCount: number;
    /**
     * false si el checklist no pudo calcularse; entonces missingCriticalCount = 0 y no debe mostrarse como contador (RN-26). Ausente equivale a true.
     */
    completenessAvailable?: boolean;
    /**
     * false si el paciente tiene opt-out vigente de analisis_ia o es real sin convenio (RN-15); toda generación con IA responde 403. No expone la referencia, el motivo ni la causa (RN-10).
     */
    aiAnalysisAvailable: boolean;
};

/**
 * Elemento del listado y de la búsqueda para quien tiene clinical:read. Nombre y documento ENMASCARADOS: la identidad completa solo viaja en la ficha (PatientSummary), con auditoría (RN-10).
 */
export type PatientListItem = {
    view: 'doctor_listado';
    id: string;
    idType: IdType;
    /**
     * Documento enmascarado de longitud fija: "•••• " (cuatro U+2022 y un espacio) seguido de los 2 últimos caracteres del número normalizado ("•••• 67"); no revela la longitud del documento. El completo solo se descifra en la ficha, auditado.
     */
    nationalIdMasked: string;
    /**
     * Iniciales de cada palabra del nombre en mayúscula seguidas de punto y separadas por espacio ("L. F. R. P."). El completo solo en la ficha, auditado.
     */
    fullNameMasked: string;
    dataOrigin: DataOrigin;
    lifecycleStatus: LifecycleStatus;
    birthYear: number;
    cancerTypeEnabled: boolean;
    pendingReviewCount: number;
    /**
     * Datos críticos faltantes (FR-23), calculados con el mismo servicio que la ficha.
     */
    missingCriticalCount: number;
    /**
     * false si el checklist no pudo calcularse para este paciente; entonces missingCriticalCount = 0 y no debe mostrarse como contador (RN-26). Ausente equivale a true.
     */
    completenessAvailable?: boolean;
};

/**
 * Vista del administrador: identificación enmascarada, estado y fecha de alta. Sin diagnóstico, biomarcadores, documentos, análisis ni contadores clínicos (mínimo privilegio).
 */
export type PatientAdminSummary = {
    view: 'admin';
    id: string;
    idType: IdType;
    /**
     * Documento enmascarado de longitud fija ("•••• 01": cuatro U+2022, un espacio y los 2 últimos caracteres); el descifrado completo solo ocurre por la CLI, auditado.
     */
    nationalIdMasked: string;
    dataOrigin: DataOrigin;
    lifecycleStatus: LifecycleStatus;
    registeredAt: string;
};

export type IdType = 'cedula_ciudadania' | 'tarjeta_identidad' | 'cedula_extranjeria' | 'pasaporte' | 'seudonimo' | 'sintetico';

export type DataOrigin = 'sintetico' | 'real_anonimizado' | 'real_identificado';

export type LifecycleStatus = 'activo' | 'egresado';

export type PatientSearchRequest = unknown & {
    idType?: IdType;
    nationalId?: string;
    name?: string;
    page?: number;
};

export type PatientPage = {
    items: Array<PatientListItem | PatientAdminSummary>;
    page: number;
    pageSize: number;
    total: number;
};

/**
 * Filtros de la petición; todos opcionales.
 */
export type EvidenceAnalysisFilters = {
    historiaCompleta?: boolean;
    soloBiomarcadoresRelevantes?: boolean;
    ultimosSeisMeses?: boolean;
    antecedentesFamiliares?: boolean;
    /**
     * Año mínimo de publicación de la evidencia. Ausente: clinical-api aplica año actual menos EVIDENCE_DEFAULT_YEARS. null: toda la evidencia. Entero: ese año mínimo.
     */
    publishedFromYear?: number | null;
};

export type EvidenceAnalysisRequest = {
    patientId: string;
    /**
     * Pregunta del oncólogo. clinical-api la normaliza antes de validarla, persistirla y enviarla (Unicode NFC, espacios colapsados a uno y recortados; mayúsculas y puntuación sin cambios). minLength y maxLength se miden después de normalizar (US-250).
     */
    query: string;
    /**
     * Plantilla de origen (FR-28).
     */
    questionTemplateId?: string | null;
    /**
     * true si el oncólogo eligió continuar con datos críticos faltantes; solo se registra, no bloquea (RN-26).
     */
    continueWithWarning?: boolean;
    sourcesSelected: ({
        guias?: true;
    } | {
        ensayos?: true;
    } | {
        publicaciones?: true;
    }) & {
        guias: boolean;
        ensayos: boolean;
        publicaciones: boolean;
    };
    filtersApplied?: EvidenceAnalysisFilters;
};

/**
 * Filtros efectivos con los que se ejecutó el análisis.
 */
export type AppliedFilters = {
    historiaCompleta: boolean;
    soloBiomarcadoresRelevantes: boolean;
    ultimosSeisMeses: boolean;
    antecedentesFamiliares: boolean;
    /**
     * Valor efectivo del filtro de antigüedad, nunca "ausente": el que vino en la petición o año actual menos EVIDENCE_DEFAULT_YEARS. null significa toda la evidencia.
     */
    publishedFromYear: number | null;
};

/**
 * Base del análisis (FR-27). Siempre presente, también con sin_evidencia.
 */
export type AnalysisBasis = {
    patientDataUsed: Array<{
        label: string;
        reviewStatus: 'auto_aceptado' | 'requiere_revision' | 'verificado' | 'corregido';
        conflict: boolean;
    }>;
    missingCriticalData: Array<string>;
    /**
     * Etiqueta en español del catálogo (label.es) de cada clave de missingCriticalData, mismo orden y longitud, resuelta con la catalog_version del análisis (FR-27 b). Texto de catálogo, nunca valores ni datos del paciente.
     */
    missingCriticalDataLabels: Array<string>;
    continuedWithWarning: boolean;
    assumptions: Array<{
        text: string;
        origin: 'regla_catalogo' | 'llm_verificado';
    }>;
    sourcesConsulted: {
        /**
         * `true` solo si la búsqueda se repitió con una reformulación de la pregunta con términos del catálogo (segundo loop, US-238) y el análisis quedó `con_evidencia`; `false` en cualquier otro caso (incluida una reescritura intentada sin rescate). Lo fija clinical-api desde `meta.retrievalParams.queryRewrite`; la consulta reformulada nunca sale de rag-orchestrator.
         */
        queryRewritten: boolean;
        selected: Array<'guias' | 'ensayos' | 'publicaciones'>;
        filters: AppliedFilters;
        retrieved: number;
        aboveThreshold: number;
    };
    /**
     * Fuentes excluidas del corpus del MVP, declaradas como exclusión.
     */
    sourcesNotIncluded: Array<string>;
    corpusCutoffDate: string;
    limitations: Array<{
        text: string;
        origin: 'estructural' | 'llm_verificado';
    }>;
    /**
     * Memoria usada como contexto; nunca evidencia ni soporte (RN-24).
     */
    priorAnalysesUsed: Array<{
        analysisId: string;
        createdAt: string;
    }>;
    /**
     * Búsqueda complementaria del agente acotado (FR-30). Vacío en el MVP: el agente es Post-MVP.
     */
    agentSteps: Array<{
        subQuery: string;
        /**
         * Criterio de aplicabilidad o punto de síntesis.
         */
        target: string;
        foundEvidence: boolean;
    }>;
    /**
     * Afirmaciones omitidas por falta de soporte.
     */
    omittedClaims: number;
    /**
     * Copiado sin transformar de RagQueryInternalResponse.optionsNotShown. Ausente solo en análisis históricos anteriores al S4; en los nuevos siempre presente (0 si no hubo recorte).
     */
    optionsNotShown?: number;
    /**
     * ANALYSIS_MAX_OPTIONS aplicado en este análisis (RN-22, FR-09). Ausente en análisis históricos.
     */
    maxOptions?: number;
    /**
     * ANALYSIS_FOLLOWUP_MAX vigente al crear este análisis (RN-22, FR-31): tope de preguntas de seguimiento que muestra la UI. La autoridad es el 409 LIMITE_SEGUIMIENTO. Ausente en análisis históricos.
     */
    maxFollowUps?: number;
};

/**
 * Vigencia del análisis (FR-12, FR-26). En un análisis nuevo es neutra: patientData false, changedData vacío y newerEvidenceOrCatalog false; el detector de vigencia la calcula después.
 */
export type Staleness = {
    /**
     * Cambiaron datos que el análisis usó (o un análisis usado como memoria quedó desactualizado).
     */
    patientData: boolean;
    changedData: Array<string>;
    /**
     * Hay una versión más reciente del corpus o del catálogo.
     */
    newerEvidenceOrCatalog: boolean;
};

/**
 * Resuelve una referencia opaca rN de la respuesta a la entidad real del paciente. Es propio de clinical-api: el UUID nunca viaja a Backend 2.
 */
export type PatientDataLink = {
    dataRef: string;
    entityType: 'diagnosis' | 'biomarker' | 'clinical_note' | 'clinical_attribute' | 'prior_treatment' | 'clinical_event';
    entityId: string;
};

/**
 * Análisis de evidencia (síntesis, aplicabilidad y opciones descritas en la evidencia, RN-23).
 */
export type EvidenceAnalysis = {
    id: string;
    traceId: string;
    /**
     * Texto de la pregunta, enmascarado si tenía PII (RN-11).
     */
    queryText: string;
    questionTemplateId: string | null;
    queryLanguage: 'es' | 'en';
    status: 'con_evidencia' | 'sin_evidencia' | 'tipo_no_habilitado';
    synthesis: Synthesis;
    applicability: Array<SourceApplicability>;
    /**
     * Como máximo 1 en los Sprints 1–3 y 3 desde el Sprint 4; orden determinista por aplicabilidad (RN-28).
     */
    evidenceOptions: Array<EvidenceOption>;
    discardedOptions: Array<DiscardedOption>;
    analysisBasis: AnalysisBasis;
    /**
     * Metadato secundario: puntaje del reranker normalizado a [0,1] de la evidencia recuperada con mayor relevancia. No ordena las opciones ni mide la solidez clínica ni la probabilidad de éxito (RN-03). null cuando no se encontró evidencia o el tipo no está habilitado (RN-02): null no es 0.0.
     */
    topRelevanceScore: number | null;
    staleness: Staleness;
    rerunOfAnalysisId: string | null;
    patientDataLinks: Array<PatientDataLink>;
    /**
     * Un solo texto configurable (AI_DISCLAIMER_TEXT, que manda sobre la redacción) con la frase de RN-19 en el literal validado (PRD E-11): "Generado por IA; requiere validación clínica independiente por el oncólogo tratante.". "Uso académico/investigación" es una etiqueta permanente de la UI y no forma parte de este campo.
     */
    disclaimer: string;
    createdAt: string;
};

export type FollowUpCreate = {
    /**
     * Pregunta de seguimiento. clinical-api la normaliza antes de validarla, desidentificarla, persistirla y enviarla (Unicode NFC, espacios colapsados a uno y recortados; mayúsculas y puntuación sin cambios). minLength y maxLength se miden después de normalizar (US-250, US-218).
     */
    question: string;
};

/**
 * Cita de un turno de seguimiento, con la marca de fuente nueva que calcula clinical-api.
 */
export type FollowUpCitedSource = CitedSourceFields & {
    /**
     * true si el chunk no estaba entre los del análisis persistido. La calcula clinical-api; Backend 2 no la conoce.
     */
    isNewSource: boolean;
};

export type FollowUpTurn = {
    id: string;
    analysisId: string;
    turnNumber: number;
    /**
     * Pregunta enmascarada si tenía PII (RN-11); es la versión que se guarda.
     */
    question: string;
    /**
     * fuera_de_contexto: la pregunta no se refiere a este análisis ni a su evidencia; no se generó respuesta.
     */
    status: 'con_evidencia' | 'sin_evidencia' | 'fuera_de_contexto';
    answer: Array<SupportedClaim>;
    citedSources: Array<FollowUpCitedSource>;
    omittedClaims: number;
    patientDataLinks: Array<PatientDataLink>;
    /**
     * Un solo texto configurable (AI_DISCLAIMER_TEXT, que manda sobre la redacción) con la frase de RN-19 en el literal validado (PRD E-11): "Generado por IA; requiere validación clínica independiente por el oncólogo tratante.". "Uso académico/investigación" es una etiqueta permanente de la UI y no forma parte de este campo.
     */
    disclaimer: string;
    createdAt: string;
};

/**
 * Conversación anclada a un paciente. No expone threadId: el hilo de Backend 2 no sale de clinical-api (ADR-51).
 */
export type Conversation = {
    conversationId: string;
    patientId: string;
    createdAt: string;
    /**
     * En orden de turnNumber.
     */
    turns: Array<ConversationTurn>;
};

export type ConversationTurnCreate = {
    /**
     * Pregunta del oncólogo. clinical-api la normaliza (Unicode NFC, espacios colapsados) y la enmascara antes de validarla, persistirla y enviarla; minLength y maxLength se miden después de normalizar.
     */
    question: string;
    /**
     * Turno de esta conversación al que se refiere la pregunta, si es una aclaración sobre él.
     */
    aboutTurnId?: string;
};

/**
 * Cita de un bloque `evidencia`. Los metadatos se copian del catálogo del corpus; si falta uno, viaja "No disponible" (RN-25).
 */
export type ChatCitation = {
    chunkId: string;
    documentId: string;
    sourceTitle: string;
    chunkOrdinal: number;
    chunkCount: number;
    chunkTextSnapshot: string;
};

/**
 * Un bloque de la respuesta. `documentado`, `interpretacion` y `conflicto` llevan al menos un factRef; `evidencia` lleva al menos una cita; `faltante`, `catalogo`, `limitacion` y `fuente` son deterministas y están exentos. Las citas van solo dentro de su bloque.
 */
export type ChatBlock = {
    kind: 'documentado' | 'interpretacion' | 'catalogo' | 'evidencia' | 'conflicto' | 'faltante' | 'limitacion' | 'fuente';
    text: string;
    factRefs?: Array<string>;
    citations?: Array<ChatCitation>;
};

/**
 * Enlace de un factRef a un dato del paciente. Solo viaja hacia el navegador, nunca a Backend 2. La ruta del histórico la deriva la UI (no hay historyPath).
 */
export type ConversationDataLink = {
    factRef: string;
    resourceType: 'diagnosis' | 'biomarker' | 'clinical_attribute' | 'prior_treatment' | 'clinical_event';
    resourceId: string;
    origin: 'ocr' | 'manual' | 'manual_correction' | 'seed';
    /**
     * Día relativo al diagnóstico; null si el dato no tiene fecha confiable.
     */
    relativeDay: number | null;
    recordedDate: string | null;
};

export type ConversationTurn = {
    id: string;
    turnNumber: number;
    createdAt: string;
    /**
     * Pregunta normalizada y enmascarada (RN-11).
     */
    question: string;
    intent: 'caso' | 'faltantes' | 'evidencia' | 'fuentes_limitaciones' | 'no_clasificada' | 'fuera_de_alcance';
    aboutTurnId?: string;
    /**
     * Lo deriva clinical-api; con evidenceAnalysis, del resultado del análisis.
     */
    status: 'respondido' | 'sin_evidencia' | 'no_clasificada';
    /**
     * Lo deriva clinical-api. null (sin evidencia) no es 0.0 (RN-02).
     */
    topRelevanceScore: number | null;
    blocks: Array<ChatBlock>;
    dataLinks: Array<ConversationDataLink>;
    omittedClaims: number;
    analysisId?: string;
    /**
     * Avisos de IA (RN-19) tal como los devolvió Backend 2; vacío en los mensajes del sistema.
     */
    notices: Array<string>;
    /**
     * Etiquetas de los hechos del caso enviados a Backend 2 en este turno.
     */
    dataUsed: Array<string>;
    /**
     * Etiquetas de los datos faltantes (con tipo de faltante) enviados en este turno.
     */
    dataMissing: Array<string>;
};

export type ErrorInterno = {
    error: 'ERROR_INTERNO';
    message: string;
    traceId: string;
};

export type ErrorServicioAutenticacion = {
    error: 'ERROR_SERVICIO_AUTENTICACION';
    message: string;
    traceId: string;
};

export type ErrorNoAutenticado = {
    error: 'NO_AUTENTICADO';
    message: string;
    traceId: string;
};

export type ErrorCredencialesInvalidas = {
    error: 'CREDENCIALES_INVALIDAS';
    message: string;
    traceId: string;
};

export type ErrorPermisoDenegado = {
    error: 'PERMISO_DENEGADO';
    message: string;
    traceId: string;
};

export type ErrorPermisoOOptOut = {
    error: 'PERMISO_DENEGADO' | 'OPT_OUT_ANALISIS_IA';
    message: string;
    traceId: string;
};

export type ErrorNoEncontrado = {
    error: 'NO_ENCONTRADO';
    message: string;
    traceId: string;
};

export type ErrorLimiteSeguimiento = {
    error: 'LIMITE_SEGUIMIENTO';
    /**
     * Sin imperativos ni claves de configuración.
     */
    message: string;
    traceId: string;
};

export type ErrorDocumentoDuplicado = {
    error: 'DOCUMENTO_DUPLICADO';
    message: string;
    traceId: string;
};

export type ErrorCuerpoInvalido = {
    error: 'CUERPO_INVALIDO';
    message: string;
    traceId: string;
};

export type ErrorDocumentoNoProcesable = {
    error: 'CUERPO_INVALIDO' | 'ARCHIVO_NO_PDF' | 'ARCHIVO_DEMASIADO_GRANDE' | 'PACIENTE_EGRESADO';
    message: string;
    traceId: string;
};

export type ErrorAlmacenNoDisponible = {
    error: 'ALMACEN_NO_DISPONIBLE';
    message: string;
    traceId: string;
};

export type ErrorAnalisisNoProcesable = {
    error: 'CUERPO_INVALIDO' | 'PACIENTE_EGRESADO' | 'TIPO_CANCER_NO_REGISTRADO';
    message: string;
    traceId: string;
};

export type ErrorRegistroManualInvalido = {
    error: 'CUERPO_INVALIDO' | 'PACIENTE_EGRESADO' | 'VALOR_FUERA_DE_CATALOGO';
    /**
     * Nombre lógico del dato que causó el error, no siempre una propiedad del cuerpo (p. ej. attributeKey al corregir la declaración de ausencia); ausente si el error no es de un campo (p. ej. PACIENTE_EGRESADO). Nunca repite el valor enviado.
     */
    field?: string;
    message: string;
    traceId: string;
};

export type ErrorRegistroClinicoInvalido = {
    error: 'CUERPO_INVALIDO' | 'PACIENTE_EGRESADO' | 'VALOR_FUERA_DE_CATALOGO' | 'TIPO_CANCER_NO_REGISTRADO';
    /**
     * Nombre lógico del dato que causó el error, no siempre una propiedad del cuerpo (p. ej. attributeKey al corregir la declaración de ausencia); ausente si el error no es de un campo (p. ej. PACIENTE_EGRESADO). Nunca repite el valor enviado.
     */
    field?: string;
    message: string;
    traceId: string;
};

export type ErrorDiagnosticoInvalido = {
    error: 'CUERPO_INVALIDO' | 'PACIENTE_EGRESADO' | 'VALOR_FUERA_DE_CATALOGO' | 'GRADACION_INCOHERENTE';
    /**
     * Nombre lógico del dato que causó el error, no siempre una propiedad del cuerpo (p. ej. attributeKey al corregir la declaración de ausencia); ausente si el error no es de un campo (p. ej. PACIENTE_EGRESADO). Nunca repite el valor enviado.
     */
    field?: string;
    message: string;
    traceId: string;
};

export type ErrorSeguimientoNoProcesable = {
    error: 'CUERPO_INVALIDO' | 'PACIENTE_EGRESADO' | 'ANALISIS_SIN_EVIDENCIA';
    message: string;
    traceId: string;
};

export type ErrorLimiteSolicitudes = {
    error: 'LIMITE_SOLICITUDES';
    message: string;
    traceId: string;
};

export type ErrorLimiteGeneracion = {
    error: 'LIMITE_SOLICITUDES' | 'COLA_INFERENCIA_LLENA';
    message: string;
    traceId: string;
};

export type ErrorCatalogVersionMismatch = {
    error: 'CATALOG_VERSION_MISMATCH';
    message: string;
    traceId: string;
};

export type ErrorServicioIa = {
    error: 'ERROR_SERVICIO_IA';
    message: string;
    traceId: string;
};

export type ErrorLlmLocalNoDisponible = {
    error: 'LOCAL_LLM_UNAVAILABLE';
    message: string;
    traceId: string;
};

/**
 * La salida del LLM local no se pudo parsear o no cumple el esquema interno. El message es fijo: nunca incluye detalles internos ni texto generado.
 */
export type ErrorSalidaLlmInvalida = {
    error: 'LLM_OUTPUT_INVALID';
    message: string;
    traceId: string;
};

export type ErrorDesidentificacionNoDisponible = {
    error: 'DESIDENTIFICACION_NO_DISPONIBLE';
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
     * Referencia al chunk del corpus recuperado en esa consulta; puede no resolverse si el chunk se reindexó.
     */
    chunkId: string;
};

export type StudyPopulationValue = {
    /**
     * Extraído por IA de un fragmento citado y verificado con NLI contra él (ADR-47); no es texto copiado del corpus; recorrido por el filtro RN-23.
     */
    value: string;
    chunkId: string;
    scope: 'elegibilidad' | 'subgrupo' | 'mencion';
};

export type LoginRequestWritable = {
    email: string;
    password: string;
};

export type DiagnosisWritable = {
    id: string;
    cancerType: string;
    icd10Code: string | null;
    histology: string | null;
    histologyCode: string | null;
    stagingSystem: string;
    stageValue: string;
    performanceScale: string | null;
    performanceValue: number | null;
    diagnosedAt: string;
    isActive: boolean;
    provenance: Provenance;
};

/**
 * Vista del doctor (permiso clinical:read).
 */
export type PatientSummaryWritable = {
    view: 'doctor';
    id: string;
    /**
     * Solo para el doctor autorizado; cada lectura se audita.
     */
    identification: {
        idType: IdType;
        nationalId: string;
        fullName: string;
    };
    dataOrigin: DataOrigin;
    lifecycleStatus: LifecycleStatus;
    birthYear: number;
    requiresRatification: boolean;
    /**
     * false significa fuera del alcance del piloto.
     */
    cancerTypeEnabled: boolean;
    diagnosis: DiagnosisWritable | null;
    /**
     * Último valor por biomarcador (serie completa en GET …/biomarkers?biomarkerName=).
     */
    recentBiomarkers: Array<Biomarker>;
    pendingReviewCount: number;
    /**
     * Datos críticos faltantes (FR-23).
     */
    missingCriticalCount: number;
    /**
     * false si el checklist no pudo calcularse; entonces missingCriticalCount = 0 y no debe mostrarse como contador (RN-26). Ausente equivale a true.
     */
    completenessAvailable?: boolean;
    /**
     * false si el paciente tiene opt-out vigente de analisis_ia o es real sin convenio (RN-15); toda generación con IA responde 403. No expone la referencia, el motivo ni la causa (RN-10).
     */
    aiAnalysisAvailable: boolean;
};

export type PatientId = string;

export type AnalysisId = string;

export type ConversationId = string;

export type BiomarkerId = string;

export type NoteId = string;

export type TreatmentId = string;

export type AttributeId = string;

export type GetHealthData = {
    body?: never;
    path?: never;
    query?: never;
    url: '/health';
};

export type GetHealthResponses = {
    /**
     * El proceso está listo.
     */
    200: HealthStatus;
};

export type GetHealthResponse = GetHealthResponses[keyof GetHealthResponses];

export type LoginData = {
    body: LoginRequestWritable;
    path?: never;
    query?: never;
    url: '/platform/auth/login';
};

export type LoginErrors = {
    /**
     * Credenciales inválidas o cuenta no activa.
     */
    401: ErrorCredencialesInvalidas;
    /**
     * Cuerpo inválido.
     */
    422: ErrorCuerpoInvalido;
    /**
     * Límite de solicitudes superado.
     */
    429: ErrorLimiteSolicitudes;
    /**
     * Fallo interno de clinical-api. Mensaje fijo, sin eco ni detalle interno.
     */
    500: ErrorInterno;
};

export type LoginError = LoginErrors[keyof LoginErrors];

export type LoginResponses = {
    /**
     * Sesión iniciada; no hay cuerpo.
     */
    204: void;
};

export type LoginResponse = LoginResponses[keyof LoginResponses];

export type LogoutData = {
    body?: never;
    path?: never;
    query?: never;
    url: '/platform/auth/logout';
};

export type LogoutErrors = {
    /**
     * Sesión ausente o expirada.
     */
    401: ErrorNoAutenticado;
};

export type LogoutError = LogoutErrors[keyof LogoutErrors];

export type LogoutResponses = {
    /**
     * Sesión revocada; no hay cuerpo.
     */
    204: void;
};

export type LogoutResponse = LogoutResponses[keyof LogoutResponses];

export type ListPatientsData = {
    body?: never;
    path?: never;
    query?: {
        status?: 'activo' | 'egresado';
        dataOrigin?: 'sintetico' | 'real_anonimizado' | 'real_identificado';
        page?: number;
    };
    url: '/platform/patients';
};

export type ListPatientsErrors = {
    /**
     * Sesión ausente o expirada.
     */
    401: ErrorNoAutenticado;
    /**
     * Permiso denegado por RBAC u opt-out.
     */
    403: ErrorPermisoDenegado;
    /**
     * Parámetros inválidos.
     */
    422: ErrorCuerpoInvalido;
    /**
     * Fallo interno de clinical-api. Mensaje fijo, sin eco ni detalle interno.
     */
    500: ErrorInterno;
};

export type ListPatientsError = ListPatientsErrors[keyof ListPatientsErrors];

export type ListPatientsResponses = {
    /**
     * Página de pacientes.
     */
    200: PatientPage;
};

export type ListPatientsResponse = ListPatientsResponses[keyof ListPatientsResponses];

export type SearchPatientsData = {
    body: PatientSearchRequest;
    path?: never;
    query?: never;
    url: '/platform/patients/search';
};

export type SearchPatientsErrors = {
    /**
     * Sesión ausente o expirada.
     */
    401: ErrorNoAutenticado;
    /**
     * Permiso denegado por RBAC u opt-out.
     */
    403: ErrorPermisoDenegado;
    /**
     * Cuerpo inválido.
     */
    422: ErrorCuerpoInvalido;
    /**
     * Límite de solicitudes superado.
     */
    429: ErrorLimiteSolicitudes;
    /**
     * Fallo interno de clinical-api. Mensaje fijo, sin eco ni detalle interno.
     */
    500: ErrorInterno;
};

export type SearchPatientsError = SearchPatientsErrors[keyof SearchPatientsErrors];

export type SearchPatientsResponses = {
    /**
     * Página de pacientes que coinciden.
     */
    200: PatientPage;
};

export type SearchPatientsResponse = SearchPatientsResponses[keyof SearchPatientsResponses];

export type GetPatientData = {
    body?: never;
    path: {
        patientId: string;
    };
    query?: never;
    url: '/platform/patients/{patientId}';
};

export type GetPatientErrors = {
    /**
     * Sesión ausente o expirada.
     */
    401: ErrorNoAutenticado;
    /**
     * Permiso denegado por RBAC u opt-out.
     */
    403: ErrorPermisoDenegado;
    /**
     * Recurso no encontrado.
     */
    404: ErrorNoEncontrado;
    /**
     * Fallo interno de clinical-api. Mensaje fijo, sin eco ni detalle interno.
     */
    500: ErrorInterno;
};

export type GetPatientError = GetPatientErrors[keyof GetPatientErrors];

export type GetPatientResponses = {
    /**
     * Ficha del paciente.
     */
    200: ({
        view: 'doctor';
    } & PatientSummary) | ({
        view: 'admin';
    } & PatientAdminSummary);
};

export type GetPatientResponse = GetPatientResponses[keyof GetPatientResponses];

export type GetCompletenessData = {
    body?: never;
    path: {
        patientId: string;
    };
    query?: never;
    url: '/platform/patients/{patientId}/completeness';
};

export type GetCompletenessErrors = {
    /**
     * Sesión ausente o expirada.
     */
    401: ErrorNoAutenticado;
    /**
     * Permiso denegado por RBAC u opt-out.
     */
    403: ErrorPermisoDenegado;
    /**
     * Recurso no encontrado.
     */
    404: ErrorNoEncontrado;
    /**
     * Fallo interno de clinical-api. Mensaje fijo, sin eco ni detalle interno.
     */
    500: ErrorInterno;
};

export type GetCompletenessError = GetCompletenessErrors[keyof GetCompletenessErrors];

export type GetCompletenessResponses = {
    /**
     * Checklist del paciente.
     */
    200: CompletenessView;
};

export type GetCompletenessResponse = GetCompletenessResponses[keyof GetCompletenessResponses];

export type GetPatientCaseData = {
    body?: never;
    path: {
        patientId: string;
    };
    query?: never;
    url: '/platform/patients/{patientId}/case';
};

export type GetPatientCaseErrors = {
    /**
     * Sesión ausente o expirada.
     */
    401: ErrorNoAutenticado;
    /**
     * Permiso denegado por RBAC u opt-out.
     */
    403: ErrorPermisoDenegado;
    /**
     * Recurso no encontrado.
     */
    404: ErrorNoEncontrado;
    /**
     * Fallo interno de clinical-api. Mensaje fijo, sin eco ni detalle interno.
     */
    500: ErrorInterno;
};

export type GetPatientCaseError = GetPatientCaseErrors[keyof GetPatientCaseErrors];

export type GetPatientCaseResponses = {
    /**
     * Vista de caso.
     */
    200: CaseView;
};

export type GetPatientCaseResponse = GetPatientCaseResponses[keyof GetPatientCaseResponses];

export type UploadDocumentData = {
    body: {
        file: Blob | File;
        documentType: 'historia_clinica' | 'examen';
    };
    path: {
        patientId: string;
    };
    query?: never;
    url: '/platform/patients/{patientId}/documents';
};

export type UploadDocumentErrors = {
    /**
     * Sesión ausente o expirada.
     */
    401: ErrorNoAutenticado;
    /**
     * Permiso denegado por RBAC u opt-out.
     */
    403: ErrorPermisoDenegado;
    /**
     * Recurso no encontrado.
     */
    404: ErrorNoEncontrado;
    /**
     * El mismo archivo ya fue cargado para este paciente (checksum).
     */
    409: ErrorDocumentoDuplicado;
    /**
     * documentType inválido, archivo que no es PDF (magic bytes), tamaño mayor que MAX_UPLOAD_MB, o paciente egresado (RN-17).
     */
    422: ErrorDocumentoNoProcesable;
    /**
     * Almacén de documentos (clinical-minio) no disponible; sin detalles internos.
     */
    503: ErrorAlmacenNoDisponible;
};

export type UploadDocumentError = UploadDocumentErrors[keyof UploadDocumentErrors];

export type UploadDocumentResponses = {
    /**
     * Documento recibido, extracción en curso.
     */
    202: Document;
};

export type UploadDocumentResponse = UploadDocumentResponses[keyof UploadDocumentResponses];

export type CreateEvidenceAnalysisData = {
    body: EvidenceAnalysisRequest;
    headers?: {
        'Idempotency-Key'?: string;
    };
    path?: never;
    query?: never;
    url: '/platform/evidence-analyses';
};

export type CreateEvidenceAnalysisErrors = {
    /**
     * Sesión ausente o expirada.
     */
    401: ErrorNoAutenticado;
    /**
     * Permiso denegado por RBAC (PERMISO_DENEGADO) u opt-out de analisis_ia del paciente (OPT_OUT_ANALISIS_IA, RN-15): bloquea toda generación con IA.
     */
    403: ErrorPermisoOOptOut;
    /**
     * Recurso no encontrado.
     */
    404: ErrorNoEncontrado;
    /**
     * CATALOG_VERSION_MISMATCH: la versión del catálogo clínico difiere entre los backends (NFR-14). No se persiste análisis ni se reenvía el cuerpo de rag-orchestrator.
     */
    409: ErrorCatalogVersionMismatch;
    /**
     * Cuerpo inválido; paciente egresado (RN-17); o TIPO_CANCER_NO_REGISTRADO: el caso no tiene tipo de cáncer y el análisis no se realiza (no se llama a la IA ni se persiste análisis).
     */
    422: ErrorAnalisisNoProcesable;
    /**
     * Límite de generaciones con IA por usuario, o cola de inferencia llena.
     */
    429: ErrorLimiteGeneracion;
    /**
     * Fallo interno de clinical-api. Mensaje fijo, sin eco ni detalle interno.
     */
    500: ErrorInterno;
    /**
     * Error de comunicación con rag-orchestrator (sin detalles internos).
     */
    502: ErrorServicioIa;
    /**
     * La generación no está disponible: LLM local caído (los datos reales nunca se envían a la nube), salida del LLM local no validada (LLM_OUTPUT_INVALID: no parseable o fuera del esquema; no se persiste contenido generado, RN-06) o desidentificación no disponible (falla cerrada, RN-11; no se invoca a Backend 2).
     */
    503: ErrorLlmLocalNoDisponible | ErrorDesidentificacionNoDisponible | ErrorSalidaLlmInvalida;
    /**
     * rag-orchestrator no respondió dentro del deadline.
     */
    504: ErrorDeadlineVencido;
};

export type CreateEvidenceAnalysisError = CreateEvidenceAnalysisErrors[keyof CreateEvidenceAnalysisErrors];

export type CreateEvidenceAnalysisResponses = {
    /**
     * Resultado del análisis.
     */
    200: EvidenceAnalysis;
};

export type CreateEvidenceAnalysisResponse = CreateEvidenceAnalysisResponses[keyof CreateEvidenceAnalysisResponses];

export type CreateManualBiomarkerData = {
    body: BiomarkerManualCreate;
    path: {
        patientId: string;
    };
    query?: never;
    url: '/platform/patients/{patientId}/biomarkers';
};

export type CreateManualBiomarkerErrors = {
    /**
     * Sesión ausente o expirada.
     */
    401: ErrorNoAutenticado;
    /**
     * Permiso denegado por RBAC u opt-out.
     */
    403: ErrorPermisoDenegado;
    /**
     * Recurso no encontrado.
     */
    404: ErrorNoEncontrado;
    /**
     * Cuerpo inválido, valor fuera del catálogo o paciente egresado.
     */
    422: ErrorRegistroManualInvalido;
};

export type CreateManualBiomarkerError = CreateManualBiomarkerErrors[keyof CreateManualBiomarkerErrors];

export type CreateManualBiomarkerResponses = {
    /**
     * Biomarcador registrado.
     */
    201: Biomarker;
};

export type CreateManualBiomarkerResponse = CreateManualBiomarkerResponses[keyof CreateManualBiomarkerResponses];

export type CreateManualDiagnosisData = {
    body: DiagnosisManualCreate;
    path: {
        patientId: string;
    };
    query?: never;
    url: '/platform/patients/{patientId}/diagnoses';
};

export type CreateManualDiagnosisErrors = {
    /**
     * Sesión ausente o expirada.
     */
    401: ErrorNoAutenticado;
    /**
     * Permiso denegado por RBAC u opt-out.
     */
    403: ErrorPermisoDenegado;
    /**
     * Recurso no encontrado.
     */
    404: ErrorNoEncontrado;
    /**
     * Cuerpo inválido, valor fuera del catálogo, gradación incoherente (el score o el grupo ISUP no cuadran con los patrones) o paciente egresado.
     */
    422: ErrorDiagnosticoInvalido;
};

export type CreateManualDiagnosisError = CreateManualDiagnosisErrors[keyof CreateManualDiagnosisErrors];

export type CreateManualDiagnosisResponses = {
    /**
     * Diagnóstico registrado.
     */
    201: Diagnosis;
};

export type CreateManualDiagnosisResponse = CreateManualDiagnosisResponses[keyof CreateManualDiagnosisResponses];

export type GetManualEntryOptionsData = {
    body?: never;
    path: {
        patientId: string;
    };
    query?: never;
    url: '/platform/patients/{patientId}/manual-entry-options';
};

export type GetManualEntryOptionsErrors = {
    /**
     * Sesión ausente o expirada.
     */
    401: ErrorNoAutenticado;
    /**
     * Permiso denegado por RBAC u opt-out.
     */
    403: ErrorPermisoDenegado;
    /**
     * Recurso no encontrado.
     */
    404: ErrorNoEncontrado;
    /**
     * Fallo interno de clinical-api. Mensaje fijo, sin eco ni detalle interno.
     */
    500: ErrorInterno;
};

export type GetManualEntryOptionsError = GetManualEntryOptionsErrors[keyof GetManualEntryOptionsErrors];

export type GetManualEntryOptionsResponses = {
    /**
     * Opciones del catálogo para los formularios.
     */
    200: ManualEntryOptions;
};

export type GetManualEntryOptionsResponse = GetManualEntryOptionsResponses[keyof GetManualEntryOptionsResponses];

export type CreateManualPriorTreatmentData = {
    body: PriorTreatmentManualCreate;
    path: {
        patientId: string;
    };
    query?: never;
    url: '/platform/patients/{patientId}/prior-treatments';
};

export type CreateManualPriorTreatmentErrors = {
    /**
     * Sesión ausente o expirada.
     */
    401: ErrorNoAutenticado;
    /**
     * Permiso denegado por RBAC u opt-out.
     */
    403: ErrorPermisoDenegado;
    /**
     * Recurso no encontrado.
     */
    404: ErrorNoEncontrado;
    /**
     * Cuerpo inválido (fechas o motivo de fin incoherentes) o paciente egresado.
     */
    422: ErrorRegistroClinicoInvalido;
    /**
     * Fallo interno de clinical-api. Mensaje fijo, sin eco ni detalle interno.
     */
    500: ErrorInterno;
};

export type CreateManualPriorTreatmentError = CreateManualPriorTreatmentErrors[keyof CreateManualPriorTreatmentErrors];

export type CreateManualPriorTreatmentResponses = {
    /**
     * Tratamiento previo registrado.
     */
    201: PriorTreatment;
};

export type CreateManualPriorTreatmentResponse = CreateManualPriorTreatmentResponses[keyof CreateManualPriorTreatmentResponses];

export type ListClinicalAttributesData = {
    body?: never;
    path: {
        patientId: string;
    };
    query?: never;
    url: '/platform/patients/{patientId}/clinical-attributes';
};

export type ListClinicalAttributesErrors = {
    /**
     * Sesión ausente o expirada.
     */
    401: ErrorNoAutenticado;
    /**
     * Permiso denegado por RBAC u opt-out.
     */
    403: ErrorPermisoDenegado;
    /**
     * Recurso no encontrado.
     */
    404: ErrorNoEncontrado;
    /**
     * Fallo interno de clinical-api. Mensaje fijo, sin eco ni detalle interno.
     */
    500: ErrorInterno;
};

export type ListClinicalAttributesError = ListClinicalAttributesErrors[keyof ListClinicalAttributesErrors];

export type ListClinicalAttributesResponses = {
    /**
     * Atributos vigentes y atributos permitidos.
     */
    200: ClinicalAttributeList;
};

export type ListClinicalAttributesResponse = ListClinicalAttributesResponses[keyof ListClinicalAttributesResponses];

export type CreateManualClinicalAttributeData = {
    body: ClinicalAttributeManualCreate;
    path: {
        patientId: string;
    };
    query?: never;
    url: '/platform/patients/{patientId}/clinical-attributes';
};

export type CreateManualClinicalAttributeErrors = {
    /**
     * Sesión ausente o expirada.
     */
    401: ErrorNoAutenticado;
    /**
     * Permiso denegado por RBAC u opt-out.
     */
    403: ErrorPermisoDenegado;
    /**
     * Recurso no encontrado.
     */
    404: ErrorNoEncontrado;
    /**
     * Cuerpo inválido, clave o valor fuera del catálogo, paciente sin tipo de cáncer, paciente egresado, o declaración de ausencia de tratamiento (sin_tratamiento_previo) con tratamientos previos vigentes (CUERPO_INVALIDO con field = attributeKey).
     */
    422: ErrorRegistroClinicoInvalido;
    /**
     * Fallo interno de clinical-api. Mensaje fijo, sin eco ni detalle interno.
     */
    500: ErrorInterno;
};

export type CreateManualClinicalAttributeError = CreateManualClinicalAttributeErrors[keyof CreateManualClinicalAttributeErrors];

export type CreateManualClinicalAttributeResponses = {
    /**
     * Atributo clínico registrado.
     */
    201: ClinicalAttribute;
};

export type CreateManualClinicalAttributeResponse = CreateManualClinicalAttributeResponses[keyof CreateManualClinicalAttributeResponses];

export type CorrectPriorTreatmentData = {
    body: PriorTreatmentManualCreate;
    path: {
        patientId: string;
        treatmentId: string;
    };
    query?: never;
    url: '/platform/patients/{patientId}/prior-treatments/{treatmentId}/corrections';
};

export type CorrectPriorTreatmentErrors = {
    /**
     * Sesión ausente o expirada.
     */
    401: ErrorNoAutenticado;
    /**
     * Permiso denegado por RBAC u opt-out.
     */
    403: ErrorPermisoDenegado;
    /**
     * Recurso no encontrado.
     */
    404: ErrorNoEncontrado;
    /**
     * El dato ya no está vigente (fue reemplazado o rechazado).
     */
    409: ErrorDatoNoVigente;
    /**
     * Cuerpo inválido (fechas o motivo de fin incoherentes, corrección sin cambios) o paciente egresado.
     */
    422: ErrorCorreccionInvalida;
};

export type CorrectPriorTreatmentError = CorrectPriorTreatmentErrors[keyof CorrectPriorTreatmentErrors];

export type CorrectPriorTreatmentResponses = {
    /**
     * Tratamiento corregido (la fila nueva, vigente).
     */
    201: PriorTreatment;
};

export type CorrectPriorTreatmentResponse = CorrectPriorTreatmentResponses[keyof CorrectPriorTreatmentResponses];

export type GetPriorTreatmentHistoryData = {
    body?: never;
    path: {
        patientId: string;
        treatmentId: string;
    };
    query?: never;
    url: '/platform/patients/{patientId}/prior-treatments/{treatmentId}/history';
};

export type GetPriorTreatmentHistoryErrors = {
    /**
     * Sesión ausente o expirada.
     */
    401: ErrorNoAutenticado;
    /**
     * Permiso denegado por RBAC u opt-out.
     */
    403: ErrorPermisoDenegado;
    /**
     * Recurso no encontrado.
     */
    404: ErrorNoEncontrado;
};

export type GetPriorTreatmentHistoryError = GetPriorTreatmentHistoryErrors[keyof GetPriorTreatmentHistoryErrors];

export type GetPriorTreatmentHistoryResponses = {
    /**
     * Versiones reemplazadas (vacía si el dato nunca se corrigió).
     */
    200: CorrectionHistory;
};

export type GetPriorTreatmentHistoryResponse = GetPriorTreatmentHistoryResponses[keyof GetPriorTreatmentHistoryResponses];

export type CorrectClinicalAttributeData = {
    body: ClinicalAttributeCorrection;
    path: {
        patientId: string;
        attributeId: string;
    };
    query?: never;
    url: '/platform/patients/{patientId}/clinical-attributes/{attributeId}/corrections';
};

export type CorrectClinicalAttributeErrors = {
    /**
     * Sesión ausente o expirada.
     */
    401: ErrorNoAutenticado;
    /**
     * Permiso denegado por RBAC u opt-out.
     */
    403: ErrorPermisoDenegado;
    /**
     * Recurso no encontrado.
     */
    404: ErrorNoEncontrado;
    /**
     * El dato ya no está vigente (fue reemplazado o rechazado).
     */
    409: ErrorDatoNoVigente;
    /**
     * Cuerpo inválido (propiedad ajena como attributeKey, corrección sin cambios), valor fuera del catálogo (field = value), paciente egresado, o corrección de la declaración sin_tratamiento_previo con tratamientos previos vigentes (CUERPO_INVALIDO con field = attributeKey; defensa de la coherencia D4, estado que no debería darse).
     */
    422: ErrorCorreccionInvalida;
};

export type CorrectClinicalAttributeError = CorrectClinicalAttributeErrors[keyof CorrectClinicalAttributeErrors];

export type CorrectClinicalAttributeResponses = {
    /**
     * Atributo corregido (la fila nueva, vigente).
     */
    201: ClinicalAttribute;
};

export type CorrectClinicalAttributeResponse = CorrectClinicalAttributeResponses[keyof CorrectClinicalAttributeResponses];

export type GetClinicalAttributeHistoryData = {
    body?: never;
    path: {
        patientId: string;
        attributeId: string;
    };
    query?: never;
    url: '/platform/patients/{patientId}/clinical-attributes/{attributeId}/history';
};

export type GetClinicalAttributeHistoryErrors = {
    /**
     * Sesión ausente o expirada.
     */
    401: ErrorNoAutenticado;
    /**
     * Permiso denegado por RBAC u opt-out.
     */
    403: ErrorPermisoDenegado;
    /**
     * Recurso no encontrado.
     */
    404: ErrorNoEncontrado;
};

export type GetClinicalAttributeHistoryError = GetClinicalAttributeHistoryErrors[keyof GetClinicalAttributeHistoryErrors];

export type GetClinicalAttributeHistoryResponses = {
    /**
     * Versiones reemplazadas (vacía si el dato nunca se corrigió).
     */
    200: CorrectionHistory;
};

export type GetClinicalAttributeHistoryResponse = GetClinicalAttributeHistoryResponses[keyof GetClinicalAttributeHistoryResponses];

export type CorrectBiomarkerData = {
    body: BiomarkerCorrection;
    path: {
        patientId: string;
        biomarkerId: string;
    };
    query?: never;
    url: '/platform/patients/{patientId}/biomarkers/{biomarkerId}/corrections';
};

export type CorrectBiomarkerErrors = {
    /**
     * Sesión ausente o expirada.
     */
    401: ErrorNoAutenticado;
    /**
     * Permiso denegado por RBAC u opt-out.
     */
    403: ErrorPermisoDenegado;
    /**
     * Recurso no encontrado.
     */
    404: ErrorNoEncontrado;
    /**
     * El dato ya no está vigente (fue reemplazado o rechazado).
     */
    409: ErrorDatoNoVigente;
    /**
     * Cuerpo inválido (fecha posterior a hoy, corrección sin cambios), valor fuera del catálogo o paciente egresado.
     */
    422: ErrorCorreccionInvalida;
};

export type CorrectBiomarkerError = CorrectBiomarkerErrors[keyof CorrectBiomarkerErrors];

export type CorrectBiomarkerResponses = {
    /**
     * Biomarcador corregido (la fila nueva, vigente).
     */
    201: Biomarker;
};

export type CorrectBiomarkerResponse = CorrectBiomarkerResponses[keyof CorrectBiomarkerResponses];

export type GetBiomarkerHistoryData = {
    body?: never;
    path: {
        patientId: string;
        biomarkerId: string;
    };
    query?: never;
    url: '/platform/patients/{patientId}/biomarkers/{biomarkerId}/history';
};

export type GetBiomarkerHistoryErrors = {
    /**
     * Sesión ausente o expirada.
     */
    401: ErrorNoAutenticado;
    /**
     * Permiso denegado por RBAC u opt-out.
     */
    403: ErrorPermisoDenegado;
    /**
     * Recurso no encontrado.
     */
    404: ErrorNoEncontrado;
};

export type GetBiomarkerHistoryError = GetBiomarkerHistoryErrors[keyof GetBiomarkerHistoryErrors];

export type GetBiomarkerHistoryResponses = {
    /**
     * Versiones reemplazadas (vacía si el dato nunca se corrigió).
     */
    200: CorrectionHistory;
};

export type GetBiomarkerHistoryResponse = GetBiomarkerHistoryResponses[keyof GetBiomarkerHistoryResponses];

export type ListClinicalNotesData = {
    body?: never;
    path: {
        patientId: string;
    };
    query?: never;
    url: '/platform/patients/{patientId}/clinical-notes';
};

export type ListClinicalNotesErrors = {
    /**
     * Sesión ausente o expirada.
     */
    401: ErrorNoAutenticado;
    /**
     * Permiso denegado por RBAC u opt-out.
     */
    403: ErrorPermisoDenegado;
    /**
     * Recurso no encontrado.
     */
    404: ErrorNoEncontrado;
};

export type ListClinicalNotesError = ListClinicalNotesErrors[keyof ListClinicalNotesErrors];

export type ListClinicalNotesResponses = {
    /**
     * Notas vigentes.
     */
    200: ClinicalNoteList;
};

export type ListClinicalNotesResponse = ListClinicalNotesResponses[keyof ListClinicalNotesResponses];

export type CorrectClinicalNoteData = {
    body: ClinicalNoteCorrection;
    path: {
        patientId: string;
        noteId: string;
    };
    query?: never;
    url: '/platform/patients/{patientId}/clinical-notes/{noteId}/corrections';
};

export type CorrectClinicalNoteErrors = {
    /**
     * Sesión ausente o expirada.
     */
    401: ErrorNoAutenticado;
    /**
     * Permiso denegado por RBAC u opt-out.
     */
    403: ErrorPermisoDenegado;
    /**
     * Recurso no encontrado.
     */
    404: ErrorNoEncontrado;
    /**
     * La nota ya no está vigente (fue reemplazada).
     */
    409: ErrorDatoNoVigente;
    /**
     * Cuerpo inválido (texto vacío o mayor que CLINICAL_NOTE_MAX_CHARS, corrección sin cambios) o paciente egresado.
     */
    422: ErrorCorreccionInvalida;
};

export type CorrectClinicalNoteError = CorrectClinicalNoteErrors[keyof CorrectClinicalNoteErrors];

export type CorrectClinicalNoteResponses = {
    /**
     * Nota corregida (la fila nueva, vigente).
     */
    201: ClinicalNote;
};

export type CorrectClinicalNoteResponse = CorrectClinicalNoteResponses[keyof CorrectClinicalNoteResponses];

export type GetClinicalNoteHistoryData = {
    body?: never;
    path: {
        patientId: string;
        noteId: string;
    };
    query?: never;
    url: '/platform/patients/{patientId}/clinical-notes/{noteId}/history';
};

export type GetClinicalNoteHistoryErrors = {
    /**
     * Sesión ausente o expirada.
     */
    401: ErrorNoAutenticado;
    /**
     * Permiso denegado por RBAC u opt-out.
     */
    403: ErrorPermisoDenegado;
    /**
     * Recurso no encontrado.
     */
    404: ErrorNoEncontrado;
};

export type GetClinicalNoteHistoryError = GetClinicalNoteHistoryErrors[keyof GetClinicalNoteHistoryErrors];

export type GetClinicalNoteHistoryResponses = {
    /**
     * Versiones reemplazadas (vacía si la nota nunca se corrigió).
     */
    200: CorrectionHistory;
};

export type GetClinicalNoteHistoryResponse = GetClinicalNoteHistoryResponses[keyof GetClinicalNoteHistoryResponses];

export type ListFollowUpsData = {
    body?: never;
    path: {
        analysisId: string;
    };
    query?: never;
    url: '/platform/evidence-analyses/{analysisId}/follow-ups';
};

export type ListFollowUpsErrors = {
    /**
     * Sesión ausente o expirada.
     */
    401: ErrorNoAutenticado;
    /**
     * Permiso denegado por RBAC u opt-out.
     */
    403: ErrorPermisoDenegado;
    /**
     * Recurso no encontrado.
     */
    404: ErrorNoEncontrado;
};

export type ListFollowUpsError = ListFollowUpsErrors[keyof ListFollowUpsErrors];

export type ListFollowUpsResponses = {
    /**
     * Turnos en orden de creación.
     */
    200: Array<FollowUpTurn>;
};

export type ListFollowUpsResponse = ListFollowUpsResponses[keyof ListFollowUpsResponses];

export type CreateFollowUpData = {
    body: FollowUpCreate;
    path: {
        analysisId: string;
    };
    query?: never;
    url: '/platform/evidence-analyses/{analysisId}/follow-ups';
};

export type CreateFollowUpErrors = {
    /**
     * Sesión ausente o expirada.
     */
    401: ErrorNoAutenticado;
    /**
     * Permiso denegado por RBAC (PERMISO_DENEGADO) u opt-out de analisis_ia del paciente (OPT_OUT_ANALISIS_IA, RN-15): bloquea toda generación con IA.
     */
    403: ErrorPermisoOOptOut;
    /**
     * Recurso no encontrado.
     */
    404: ErrorNoEncontrado;
    /**
     * El análisis alcanzó el máximo de preguntas de seguimiento configurado.
     */
    409: ErrorLimiteSeguimiento;
    /**
     * Cuerpo inválido, paciente egresado (RN-17) o análisis sin evidencia al que no se le puede preguntar.
     */
    422: ErrorSeguimientoNoProcesable;
    /**
     * Límite de generaciones con IA por usuario, o cola de inferencia llena.
     */
    429: ErrorLimiteGeneracion;
    /**
     * Fallo interno de clinical-api. Mensaje fijo, sin eco ni detalle interno.
     */
    500: ErrorInterno;
    /**
     * Error de comunicación con rag-orchestrator (sin detalles internos).
     */
    502: ErrorServicioIa;
    /**
     * La generación no está disponible: LLM local caído (los datos reales nunca se envían a la nube), salida del LLM local no validada (LLM_OUTPUT_INVALID: no parseable o fuera del esquema; no se persiste contenido generado, RN-06) o desidentificación no disponible (falla cerrada, RN-11; no se invoca a Backend 2).
     */
    503: ErrorLlmLocalNoDisponible | ErrorDesidentificacionNoDisponible | ErrorSalidaLlmInvalida;
    /**
     * rag-orchestrator no respondió dentro del deadline.
     */
    504: ErrorDeadlineVencido;
};

export type CreateFollowUpError = CreateFollowUpErrors[keyof CreateFollowUpErrors];

export type CreateFollowUpResponses = {
    /**
     * Turno de seguimiento registrado.
     */
    201: FollowUpTurn;
};

export type CreateFollowUpResponse = CreateFollowUpResponses[keyof CreateFollowUpResponses];

export type CreateConversationData = {
    body?: never;
    path: {
        patientId: string;
    };
    query?: never;
    url: '/platform/patients/{patientId}/conversations';
};

export type CreateConversationErrors = {
    /**
     * Sesión ausente o expirada.
     */
    401: ErrorNoAutenticado;
    /**
     * Permiso denegado por RBAC u opt-out.
     */
    403: ErrorPermisoDenegado;
    /**
     * Recurso no encontrado.
     */
    404: ErrorNoEncontrado;
    /**
     * Fallo interno de clinical-api. Mensaje fijo, sin eco ni detalle interno.
     */
    500: ErrorInterno;
};

export type CreateConversationError = CreateConversationErrors[keyof CreateConversationErrors];

export type CreateConversationResponses = {
    /**
     * Conversación abierta, sin turnos.
     */
    201: Conversation;
};

export type CreateConversationResponse = CreateConversationResponses[keyof CreateConversationResponses];

export type GetConversationData = {
    body?: never;
    path: {
        conversationId: string;
    };
    query?: never;
    url: '/platform/conversations/{conversationId}';
};

export type GetConversationErrors = {
    /**
     * Sesión ausente o expirada.
     */
    401: ErrorNoAutenticado;
    /**
     * Permiso denegado por RBAC u opt-out.
     */
    403: ErrorPermisoDenegado;
    /**
     * Recurso no encontrado.
     */
    404: ErrorNoEncontrado;
    /**
     * Fallo interno de clinical-api. Mensaje fijo, sin eco ni detalle interno.
     */
    500: ErrorInterno;
};

export type GetConversationError = GetConversationErrors[keyof GetConversationErrors];

export type GetConversationResponses = {
    /**
     * La conversación con sus turnos en orden de turnNumber.
     */
    200: Conversation;
};

export type GetConversationResponse = GetConversationResponses[keyof GetConversationResponses];

export type CreateConversationTurnData = {
    body: ConversationTurnCreate;
    path: {
        conversationId: string;
    };
    query?: never;
    url: '/platform/conversations/{conversationId}/turns';
};

export type CreateConversationTurnErrors = {
    /**
     * Sesión ausente o expirada.
     */
    401: ErrorNoAutenticado;
    /**
     * Permiso denegado por RBAC (PERMISO_DENEGADO) u opt-out de analisis_ia del paciente (OPT_OUT_ANALISIS_IA, RN-15): bloquea toda generación con IA.
     */
    403: ErrorPermisoOOptOut;
    /**
     * Recurso no encontrado.
     */
    404: ErrorNoEncontrado;
    /**
     * CATALOG_VERSION_MISMATCH: la versión del catálogo clínico difiere entre los backends (NFR-14). No se guarda el turno.
     */
    409: ErrorCatalogVersionMismatch;
    /**
     * Cuerpo inválido.
     */
    422: ErrorCuerpoInvalido;
    /**
     * Fallo interno de clinical-api. Mensaje fijo, sin eco ni detalle interno.
     */
    500: ErrorInterno;
    /**
     * Error de comunicación con rag-orchestrator (sin detalles internos).
     */
    502: ErrorServicioIa;
    /**
     * La generación no está disponible: LLM local caído (los datos reales nunca se envían a la nube), salida del LLM local no validada (LLM_OUTPUT_INVALID: no parseable o fuera del esquema; no se persiste contenido generado, RN-06) o desidentificación no disponible (falla cerrada, RN-11; no se invoca a Backend 2).
     */
    503: ErrorLlmLocalNoDisponible | ErrorDesidentificacionNoDisponible | ErrorSalidaLlmInvalida;
    /**
     * rag-orchestrator no respondió dentro del deadline.
     */
    504: ErrorDeadlineVencido;
};

export type CreateConversationTurnError = CreateConversationTurnErrors[keyof CreateConversationTurnErrors];

export type CreateConversationTurnResponses = {
    /**
     * Turno registrado.
     */
    201: ConversationTurn;
};

export type CreateConversationTurnResponse = CreateConversationTurnResponses[keyof CreateConversationTurnResponses];
