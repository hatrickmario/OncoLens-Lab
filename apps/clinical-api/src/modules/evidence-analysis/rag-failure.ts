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

/**
 * Tabla ÚNICA de fallos de rag-orchestrator (`[S1 resp. 12]`, `[S1 resp. 35]`): qué responde clinical-api ante cada uno.
 * Ninguna fila persiste un registro ni reenvía el cuerpo, el `message` o las cabeceras de rag-orchestrator.
 * En el S1 `409` y `429` caen en `502`; US-041 (S2) y US-056 (S4) los cambian por regresión.
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
      return servicioIa('catalogo_en_conflicto');
    case 429:
      return servicioIa('limite_de_rag_alcanzado');
    case null:
      return servicioIa('sin_conexion_con_rag');
    default:
      return servicioIa('error_de_rag');
  }
}
