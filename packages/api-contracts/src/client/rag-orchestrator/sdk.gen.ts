// GENERADO desde apps/rag-orchestrator/openapi.yaml — no editar a mano (npm run contracts:generate)

import { client } from './client.gen.js';
import { type Client, type ClientMeta, formDataBodySerializer, type Options as Options2, type RequestResult, type TDataShape } from './client/index.js';
import type { AnswerFollowUpData, AnswerFollowUpErrors, AnswerFollowUpResponses, CaseSummaryData, CaseSummaryErrors, CaseSummaryResponses, ExtractDocumentData, ExtractDocumentErrors, ExtractDocumentResponses, GetHealthData, GetHealthErrors, GetHealthResponses, RagQueryData, RagQueryErrors, RagQueryResponses } from './types.gen.js';

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
 * Estado del proceso y del LLM nativo
 *
 * Con LLM_PROVIDER=local verifica el LLM nativo en LLM_BASE_URL y responde 503 LOCAL_LLM_UNAVAILABLE si no está; con LLM_PROVIDER=fake no lo consulta.
 */
export const getHealth = <ThrowOnError extends boolean = false>(options?: Options<GetHealthData, ThrowOnError>): RequestResult<GetHealthResponses, GetHealthErrors, ThrowOnError> => (options?.client ?? client).get<GetHealthResponses, GetHealthErrors, ThrowOnError>({ url: '/health', ...options });

/**
 * Recuperación híbrida multilingüe + generación + validación
 *
 * Invocado solo por clinical-api. Expansión bilingüe, recuperación (dense; sparse desde el Sprint 3) con filtros is_current, source_type y cancer_type; reranker; umbral de relevancia (sin evidencia, sin invocar al LLM); generación en el idioma de la pregunta; validación de citas y chequeo de soporte NLI (los análisis previos de la memoria nunca cuentan como soporte). Desde el Sprint 4 genera síntesis y aplicabilidad, ejecuta el agente acotado (agentLimits) y ordena las opciones por aplicabilidad. Lo que no tiene soporte se devuelve en discardedOptions. Si dataClassification es real, solo usa modelos locales (RN-12).
 */
export const ragQuery = <ThrowOnError extends boolean = false>(options: Options<RagQueryData, ThrowOnError>): RequestResult<RagQueryResponses, RagQueryErrors, ThrowOnError> => (options.client ?? client).post<RagQueryResponses, RagQueryErrors, ThrowOnError>({
    security: [{ scheme: 'bearer', type: 'http' }],
    url: '/rag/query',
    ...options,
    headers: {
        'Content-Type': 'application/json',
        ...options.headers
    }
});

/**
 * Responde una pregunta de seguimiento anclada a un análisis
 *
 * Invocado solo por clinical-api (FR-31). Sin estado entre turnos: rag-orchestrator no guarda turnos ni memoria, ni en disco, ni en caché, ni en Milvus, ni en logs; clinical-api envía en cada llamada el contexto desidentificado del paciente y la memoria del análisis (analysisMemory, rotulada y no citable: nunca cuenta como soporte, RN-24). El pseudoPatientId y el traceId son nuevos en cada turno. question llega enmascarada (RN-11). Recupera solo del corpus, valida citas y soporte NLI sobre la respuesta completa, y clasifica fuera_de_contexto cuando la pregunta no se refiere al análisis. Con datos reales solo se usan modelos locales, sin fallback a la nube (RN-12).
 */
export const answerFollowUp = <ThrowOnError extends boolean = false>(options: Options<AnswerFollowUpData, ThrowOnError>): RequestResult<AnswerFollowUpResponses, AnswerFollowUpErrors, ThrowOnError> => (options.client ?? client).post<AnswerFollowUpResponses, AnswerFollowUpErrors, ThrowOnError>({
    security: [{ scheme: 'bearer', type: 'http' }],
    url: '/rag/follow-up',
    ...options,
    headers: {
        'Content-Type': 'application/json',
        ...options.headers
    }
});

/**
 * Extrae datos estructurados de un documento clínico
 *
 * Invocado solo por clinical-api. El PDF viaja en el cuerpo porque rag-orchestrator no tiene credenciales ni red hacia clinical-minio. clinical-api envía un nombre de archivo neutro (por ejemplo documento.pdf), nunca el original, que puede contener identidad (RN-10). Primero la capa de texto; OCR solo en las páginas escaneadas; gate de PII según dataClassification; estructuración con el LLM local y confianza por campo (anclaje textual, dominio, consistencia). El PDF no se persiste ni se registra en logs. clinical-api valida y persiste. Con datos reales solo se usan modelos locales (RN-12).
 */
export const extractDocument = <ThrowOnError extends boolean = false>(options: Options<ExtractDocumentData, ThrowOnError>): RequestResult<ExtractDocumentResponses, ExtractDocumentErrors, ThrowOnError> => (options.client ?? client).post<ExtractDocumentResponses, ExtractDocumentErrors, ThrowOnError>({
    ...formDataBodySerializer,
    security: [{ scheme: 'bearer', type: 'http' }],
    url: '/documents/extract',
    ...options,
    headers: {
        'Content-Type': null,
        ...options.headers
    }
});

/**
 * Genera el resumen verificable del caso
 *
 * Invocado solo por clinical-api (FR-21). Recibe el ClinicalContext desidentificado, con referencias opacas por dato (dataRef), y devuelve afirmaciones que referencian esos datos (supportingDataRefs). Cada afirmación pasa el chequeo de soporte contra los datos referenciados; las que no, se omiten y cuentan en omittedClaims. Si dataClassification es real, solo usa modelos locales (RN-12).
 */
export const caseSummary = <ThrowOnError extends boolean = false>(options: Options<CaseSummaryData, ThrowOnError>): RequestResult<CaseSummaryResponses, CaseSummaryErrors, ThrowOnError> => (options.client ?? client).post<CaseSummaryResponses, CaseSummaryErrors, ThrowOnError>({
    security: [{ scheme: 'bearer', type: 'http' }],
    url: '/case/summary',
    ...options,
    headers: {
        'Content-Type': 'application/json',
        ...options.headers
    }
});
