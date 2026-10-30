// GENERADO desde apps/clinical-api/openapi.yaml — no editar a mano (npm run contracts:generate)

import { client } from './client.gen.js';
import { type Client, type ClientMeta, formDataBodySerializer, type Options as Options2, type RequestResult, type TDataShape } from './client/index.js';
import type { CreateEvidenceAnalysisData, CreateEvidenceAnalysisErrors, CreateEvidenceAnalysisResponses, CreateFollowUpData, CreateFollowUpErrors, CreateFollowUpResponses, CreateManualBiomarkerData, CreateManualBiomarkerErrors, CreateManualBiomarkerResponses, CreateManualDiagnosisData, CreateManualDiagnosisErrors, CreateManualDiagnosisResponses, GetCompletenessData, GetCompletenessErrors, GetCompletenessResponses, GetHealthData, GetHealthResponses, GetPatientCaseData, GetPatientCaseErrors, GetPatientCaseResponses, GetPatientData, GetPatientErrors, GetPatientResponses, ListFollowUpsData, ListFollowUpsErrors, ListFollowUpsResponses, ListPatientsData, ListPatientsErrors, ListPatientsResponses, LoginData, LoginErrors, LoginResponses, LogoutData, LogoutErrors, LogoutResponses, SearchPatientsData, SearchPatientsErrors, SearchPatientsResponses, UploadDocumentData, UploadDocumentErrors, UploadDocumentResponses } from './types.gen.js';

export type Options<TData extends TDataShape = TDataShape, ThrowOnError extends boolean = boolean, TResponse = unknown> = Options2<TData, ThrowOnError, TResponse> & {
    /**
     * You can provide a client instance returned by `createClient()` instead of
     * individual options. This might be also useful if you want to implement a
     * custom client.
     */
    client?: Client;
    /**
     * You can pass arbitrary values through the `meta` object. This can be
     * used to access values that aren't defined as part of the SDK function.
     */
    meta?: keyof ClientMeta extends never ? Record<string, unknown> : ClientMeta;
};

/**
 * Estado del proceso para el healthcheck de Compose
 *
 * Solo en la red interna; web no lo reenvía. No consulta a rag-orchestrator: con el LLM caído sigue respondiendo 200.
 */
export const getHealth = <ThrowOnError extends boolean = false>(options?: Options<GetHealthData, ThrowOnError>): RequestResult<GetHealthResponses, unknown, ThrowOnError> => (options?.client ?? client).get<GetHealthResponses, unknown, ThrowOnError>({ url: '/health', ...options });

/**
 * Inicia sesión con correo y contraseña
 *
 * Responde 204 sin cuerpo y entrega la cookie de sesión opaca en Set-Cookie. Credenciales inválidas y cuentas que no están activas (pendiente, rechazado, desactivado) responden 401 con el mismo código CREDENCIALES_INVALIDAS, para no revelar qué cuentas existen.
 */
export const login = <ThrowOnError extends boolean = false>(options: Options<LoginData, ThrowOnError>): RequestResult<LoginResponses, LoginErrors, ThrowOnError> => (options.client ?? client).post<LoginResponses, LoginErrors, ThrowOnError>({
    url: '/platform/auth/login',
    ...options,
    headers: {
        'Content-Type': 'application/json',
        ...options.headers
    }
});

/**
 * Cierra la sesión y la revoca
 */
export const logout = <ThrowOnError extends boolean = false>(options?: Options<LogoutData, ThrowOnError>): RequestResult<LogoutResponses, LogoutErrors, ThrowOnError> => (options?.client ?? client).post<LogoutResponses, LogoutErrors, ThrowOnError>({
    security: [{
            in: 'cookie',
            name: 'oncolens_session',
            type: 'apiKey'
        }],
    url: '/platform/auth/logout',
    ...options
});

/**
 * Lista pacientes con filtros que no contienen identidad
 *
 * Listado paginado. Solo admite filtros sin identidad (status, dataOrigin, page): la búsqueda por documento o por nombre es POST /platform/patients/search, porque la identidad nunca viaja en la URL ni en las cabeceras (RN-10). La forma de cada elemento depende del permiso (x-view-by-permission). El listado devuelve el nombre y el documento ENMASCARADOS; completos solo en la ficha GET /platform/patients/{patientId}, con auditoría. Orden determinista: fecha de alta descendente (el registro más reciente primero) y, a igual fecha, el id ascendente.
 */
export const listPatients = <ThrowOnError extends boolean = false>(options?: Options<ListPatientsData, ThrowOnError>): RequestResult<ListPatientsResponses, ListPatientsErrors, ThrowOnError> => (options?.client ?? client).get<ListPatientsResponses, ListPatientsErrors, ThrowOnError>({
    security: [{
            in: 'cookie',
            name: 'oncolens_session',
            type: 'apiKey'
        }],
    url: '/platform/patients',
    ...options
});

/**
 * Busca pacientes por identidad exacta o por nombre
 *
 * La identidad (idType + nationalId, o name) viaja en el cuerpo, nunca en la URL ni en las cabeceras (RN-10). La búsqueda por documento es exacta (índice ciego) y no usa el país emisor (issuingCountry no participa); la búsqueda por nombre es exacta sobre el nombre completo normalizado (sin tildes, en minúsculas, espacios colapsados) por índice ciego: un nombre parcial o un apellido suelto no encuentra nada. Si el cuerpo trae documento y nombre, gana el documento. Los resultados se ordenan por fecha de alta descendente y, a igual fecha, por id ascendente. La forma de cada elemento depende del permiso (x-view-by-permission). Los resultados traen el nombre y el documento ENMASCARADOS; completos solo en la ficha GET /platform/patients/{patientId}, con auditoría.
 */
export const searchPatients = <ThrowOnError extends boolean = false>(options: Options<SearchPatientsData, ThrowOnError>): RequestResult<SearchPatientsResponses, SearchPatientsErrors, ThrowOnError> => (options.client ?? client).post<SearchPatientsResponses, SearchPatientsErrors, ThrowOnError>({
    security: [{
            in: 'cookie',
            name: 'oncolens_session',
            type: 'apiKey'
        }],
    url: '/platform/patients/search',
    ...options,
    headers: {
        'Content-Type': 'application/json',
        ...options.headers
    }
});

/**
 * Obtiene la ficha resumen del paciente
 *
 * Alimenta el Panel del doctor. La forma de la respuesta depende del permiso: con clinical:read es PatientSummary (la identificación se descifra solo para esta respuesta y la lectura queda auditada); sin él, PatientAdminSummary, con la identificación enmascarada y sin datos clínicos (mínimo privilegio del administrador). El descifrado completo de la identidad para registrar un opt-out solo ocurre por la CLI, auditado.
 */
export const getPatient = <ThrowOnError extends boolean = false>(options: Options<GetPatientData, ThrowOnError>): RequestResult<GetPatientResponses, GetPatientErrors, ThrowOnError> => (options.client ?? client).get<GetPatientResponses, GetPatientErrors, ThrowOnError>({
    security: [{
            in: 'cookie',
            name: 'oncolens_session',
            type: 'apiKey'
        }],
    url: '/platform/patients/{patientId}',
    ...options
});

/**
 * Checklist de datos críticos del paciente con procedencia por ítem
 *
 * Determinista (FR-23), sin IA. Un faltante nunca produce 4xx (RN-26). Lectura clínica: el administrador recibe 403.
 */
export const getCompleteness = <ThrowOnError extends boolean = false>(options: Options<GetCompletenessData, ThrowOnError>): RequestResult<GetCompletenessResponses, GetCompletenessErrors, ThrowOnError> => (options.client ?? client).get<GetCompletenessResponses, GetCompletenessErrors, ThrowOnError>({
    security: [{
            in: 'cookie',
            name: 'oncolens_session',
            type: 'apiKey'
        }],
    url: '/platform/patients/{patientId}/completeness',
    ...options
});

/**
 * Obtiene la vista de caso del paciente
 *
 * Vista de caso (FR-21, FR-23): timeline, tratamientos previos, atributos clínicos, series de biomarcadores y checklist de datos críticos. Los eventos de entidades con tabla propia se derivan en la vista (el análisis aparece como evento derivado) y los demás vienen de ClinicalEvent. Es una lectura clínica: el administrador recibe 403.
 */
export const getPatientCase = <ThrowOnError extends boolean = false>(options: Options<GetPatientCaseData, ThrowOnError>): RequestResult<GetPatientCaseResponses, GetPatientCaseErrors, ThrowOnError> => (options.client ?? client).get<GetPatientCaseResponses, GetPatientCaseErrors, ThrowOnError>({
    security: [{
            in: 'cookie',
            name: 'oncolens_session',
            type: 'apiKey'
        }],
    url: '/platform/patients/{patientId}/case',
    ...options
});

/**
 * Carga un documento clínico (PDF) para extracción
 *
 * Valida la sesión, el permiso, el PDF por magic bytes, el tamaño y los duplicados por checksum. Guarda el binario en clinical-minio y encola la extracción. Es asíncrono: retorna el Document con ocrStatus=pendiente. Para varios archivos en una acción se usa POST /platform/patients/{patientId}/documents/batch (207, un resultado por archivo).
 */
export const uploadDocument = <ThrowOnError extends boolean = false>(options: Options<UploadDocumentData, ThrowOnError>): RequestResult<UploadDocumentResponses, UploadDocumentErrors, ThrowOnError> => (options.client ?? client).post<UploadDocumentResponses, UploadDocumentErrors, ThrowOnError>({
    ...formDataBodySerializer,
    security: [{
            in: 'cookie',
            name: 'oncolens_session',
            type: 'apiKey'
        }],
    url: '/platform/patients/{patientId}/documents',
    ...options,
    headers: {
        'Content-Type': null,
        ...options.headers
    }
});

/**
 * Ejecuta un análisis de evidencia sobre un paciente
 *
 * Construye el contexto del caso (timeline, línea de tratamiento, trayectorias, faltantes y memoria de análisis previos rotulada), etiquetado y desidentificado, y lo reenvía a Backend 2. Agrega la Base del análisis y persiste el AIAnalysisRecord antes de responder (JSON completo, nunca tokens sin validar). El análisis aparece en el timeline como evento derivado del AIAnalysisRecord: no se escribe ningún ClinicalEvent. Sin evidencia suficiente responde 200 con status sin_evidencia, evidenceOptions vacío, topRelevanceScore null y la Base del análisis. Para un tipo de cáncer no habilitado responde 200 con status tipo_no_habilitado, sin invocar al LLM. Los datos faltantes no bloquean (continueWithWarning). Si la petición no trae filtersApplied.publishedFromYear, clinical-api aplica año actual menos EVIDENCE_DEFAULT_YEARS.
 */
export const createEvidenceAnalysis = <ThrowOnError extends boolean = false>(options: Options<CreateEvidenceAnalysisData, ThrowOnError>): RequestResult<CreateEvidenceAnalysisResponses, CreateEvidenceAnalysisErrors, ThrowOnError> => (options.client ?? client).post<CreateEvidenceAnalysisResponses, CreateEvidenceAnalysisErrors, ThrowOnError>({
    security: [{
            in: 'cookie',
            name: 'oncolens_session',
            type: 'apiKey'
        }],
    url: '/platform/evidence-analyses',
    ...options,
    headers: {
        'Content-Type': 'application/json',
        ...options.headers
    }
});

/**
 * Registra a mano un biomarcador desde un faltante
 *
 * Crea un Exam con entry_method = manual (exam_type = registro_manual) y el Biomarker asociado. La normalización final del término la decide Backend 1 (ADR-33), con la misma versión del catálogo que los datos extraídos. Exige un paciente activo (RN-17).
 */
export const createManualBiomarker = <ThrowOnError extends boolean = false>(options: Options<CreateManualBiomarkerData, ThrowOnError>): RequestResult<CreateManualBiomarkerResponses, CreateManualBiomarkerErrors, ThrowOnError> => (options.client ?? client).post<CreateManualBiomarkerResponses, CreateManualBiomarkerErrors, ThrowOnError>({
    security: [{
            in: 'cookie',
            name: 'oncolens_session',
            type: 'apiKey'
        }],
    url: '/platform/patients/{patientId}/biomarkers',
    ...options,
    headers: {
        'Content-Type': 'application/json',
        ...options.headers
    }
});

/**
 * Completa o corrige el diagnóstico a mano
 *
 * Sin diagnóstico vigente crea uno con entry_method = manual y exige cancerType, stagingSystem, stageValue y diagnosedAt. Con diagnóstico vigente es una corrección explícita: crea uno manual_correction y el anterior pasa a reemplazado, nunca en silencio (RN-08). La gradación se envía como grading estructurada; el campo grade nunca se escribe a mano: es texto derivado de la gradación de referencia.
 */
export const createManualDiagnosis = <ThrowOnError extends boolean = false>(options: Options<CreateManualDiagnosisData, ThrowOnError>): RequestResult<CreateManualDiagnosisResponses, CreateManualDiagnosisErrors, ThrowOnError> => (options.client ?? client).post<CreateManualDiagnosisResponses, CreateManualDiagnosisErrors, ThrowOnError>({
    security: [{
            in: 'cookie',
            name: 'oncolens_session',
            type: 'apiKey'
        }],
    url: '/platform/patients/{patientId}/diagnoses',
    ...options,
    headers: {
        'Content-Type': 'application/json',
        ...options.headers
    }
});

/**
 * Lista los turnos de seguimiento de un análisis
 */
export const listFollowUps = <ThrowOnError extends boolean = false>(options: Options<ListFollowUpsData, ThrowOnError>): RequestResult<ListFollowUpsResponses, ListFollowUpsErrors, ThrowOnError> => (options.client ?? client).get<ListFollowUpsResponses, ListFollowUpsErrors, ThrowOnError>({
    security: [{
            in: 'cookie',
            name: 'oncolens_session',
            type: 'apiKey'
        }],
    url: '/platform/evidence-analyses/{analysisId}/follow-ups',
    ...options
});

/**
 * Formula una pregunta de seguimiento sobre un análisis
 *
 * La pregunta se ancla al análisis: usa su contexto desidentificado, sus datos y su evidencia, y la respuesta se valida completa y se persiste antes de responder (RN-01, RN-06). Se guarda y se devuelve la versión enmascarada de la pregunta si tenía PII. El análisis admite hasta ANALYSIS_FOLLOWUP_MAX preguntas (409 al superarlo). Backend 2 no guarda estado entre turnos; isNewSource lo calcula clinical-api.
 */
export const createFollowUp = <ThrowOnError extends boolean = false>(options: Options<CreateFollowUpData, ThrowOnError>): RequestResult<CreateFollowUpResponses, CreateFollowUpErrors, ThrowOnError> => (options.client ?? client).post<CreateFollowUpResponses, CreateFollowUpErrors, ThrowOnError>({
    security: [{
            in: 'cookie',
            name: 'oncolens_session',
            type: 'apiKey'
        }],
    url: '/platform/evidence-analyses/{analysisId}/follow-ups',
    ...options,
    headers: {
        'Content-Type': 'application/json',
        ...options.headers
    }
});
