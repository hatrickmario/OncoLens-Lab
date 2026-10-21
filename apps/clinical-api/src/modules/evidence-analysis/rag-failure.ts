import type { FalloDeRag, RespuestaDeFallo } from './ports.js';

const respuesta = (
  status: RespuestaDeFallo['status'],
  codigo: RespuestaDeFallo['codigo'],
  resultado: string,
): RespuestaDeFallo => ({ status, codigo, resultado });

const DEADLINE_VENCIDO = respuesta(504, 'DEADLINE_VENCIDO', 'deadline_vencido');
const LLM_LOCAL_NO_DISPONIBLE = respuesta(503, 'LOCAL_LLM_UNAVAILABLE', 'llm_local_no_disponible');
const TIPO_CANCER_NO_REGISTRADO = respuesta(
  422,
  'TIPO_CANCER_NO_REGISTRADO',
  'tipo_cancer_no_registrado_en_rag',
);
const CATALOGO_EN_CONFLICTO = respuesta(409, 'CATALOG_VERSION_MISMATCH', 'catalogo_en_conflicto');
const servicioIa = (resultado: string) => respuesta(502, 'ERROR_SERVICIO_IA', resultado);

/** `200` de rag-orchestrator que no cumple `RagQueryInternalResponse` o es incoherente. */
export const RESPUESTA_INTERNA_INVALIDA = servicioIa('respuesta_interna_invalida');

/** `503` de rag-orchestrator según su código (`RETRIEVAL_UNAVAILABLE` y `NLI_UNAVAILABLE` no se exponen: 502). */
function falloDe503(codigo: string | null | undefined): RespuestaDeFallo {
  switch (codigo) {
    case 'LOCAL_LLM_UNAVAILABLE':
      return LLM_LOCAL_NO_DISPONIBLE;
    case 'RETRIEVAL_UNAVAILABLE':
      return servicioIa('recuperacion_no_disponible');
    case 'NLI_UNAVAILABLE':
      return servicioIa('nli_no_disponible');
    default:
      return servicioIa('servicio_ia_no_disponible');
  }
}

/** `409` de rag-orchestrator según su código: solo el de catálogo es público; cualquier otro conflicto es `502`. */
function falloDe409(codigo: string | null | undefined): RespuestaDeFallo {
  return codigo === 'CATALOG_VERSION_MISMATCH'
    ? CATALOGO_EN_CONFLICTO
    : servicioIa('conflicto_de_rag');
}

/**
 * Tabla ÚNICA de fallos de rag-orchestrator (`[S1 resp. 12]`, `[S1 resp. 35]`): qué responde clinical-api ante cada uno.
 * Ninguna fila persiste un registro ni reenvía el cuerpo, el `message` o las cabeceras de rag-orchestrator.
 * `409` con `CATALOG_VERSION_MISMATCH` se traduce a `409` (US-041); cualquier otro `409` y el `429` caen en `502`
 * hasta que US-056 (S4) cambie el `429` por regresión.
 */
export function mapearFalloRag(fallo: FalloDeRag): RespuestaDeFallo {
  if (fallo.tiempoAgotado === true) return DEADLINE_VENCIDO;
  switch (fallo.status) {
    case 504:
      return DEADLINE_VENCIDO;
    case 503:
      return falloDe503(fallo.codigo);
    case 422:
      return fallo.codigo === 'TIPO_CANCER_NO_REGISTRADO'
        ? TIPO_CANCER_NO_REGISTRADO
        : servicioIa('validacion_rechazada_por_rag');
    case 401:
      return servicioIa('token_de_servicio_rechazado');
    case 409:
      return falloDe409(fallo.codigo);
    case 429:
      return servicioIa('limite_de_rag_alcanzado');
    case null:
      return servicioIa('sin_conexion_con_rag');
    default:
      return servicioIa('error_de_rag');
  }
}
