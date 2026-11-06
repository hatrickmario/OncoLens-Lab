import 'server-only';
import {
  createConversation,
  createConversationTurn,
  getConversation,
} from '../../../../packages/api-contracts/src/client-web/clinical-api';
import type { ConversationTurnCreate } from '../../../../packages/api-contracts/src/client-web/clinical-api';
import {
  zCreateConversationPath,
  zCreateConversationTurnPath,
  zGetConversationPath,
} from '../../../../packages/api-contracts/src/zod/clinical-api/zod.gen';
import { crearSdkClinicalApi } from './clinical-api';
import type { DependenciasDelBff } from './dependencias';
import { verificarOrigen } from './origen';
import { leerCuerpoAcotado } from './peticiones';
import { crearProxyDeLectura } from './proxy-de-lectura';
import { responderCuerpoExcesivo, retransmitir } from './proxy-json';
import { respuestaPropia } from './respuestas';

type Manejador = (request: Request, id: string) => Promise<Response>;

const EVENTO_APERTURA = 'conversations.proxy';
const EVENTO_TURNO = 'conversation_turns.proxy';

/** Un id mal formado es indistinguible de uno inexistente: `404` propio sin llamar a clinical-api ni eco del id. */
function responderNoEncontrado(
  dependencias: DependenciasDelBff,
  evento: string,
  mensaje: string,
): Response {
  const traceId = dependencias.nuevoTraceId();
  dependencias.registrar({ event: evento, status: 404, traceId });
  return respuestaPropia({ error: 'NO_ENCONTRADO', message: mensaje, traceId }, 404);
}

/**
 * Proxy de `POST /platform/patients/{id}/conversations` (L1D-315): Origin → id UUID (si no, 404 propio) → tope de
 * cuerpo → SDK generado → `retransmitir`. No lleva cuerpo: lo que llegue no se reenvía.
 */
export function crearManejadorAperturaDeConversacion(dependencias: DependenciasDelBff): Manejador {
  return async (request, patientId) => {
    const rechazo = verificarOrigen(request, { ...dependencias, evento: EVENTO_APERTURA });
    if (rechazo !== null) return rechazo;
    if (!zCreateConversationPath.safeParse({ patientId }).success) {
      return responderNoEncontrado(dependencias, EVENTO_APERTURA, 'Paciente no encontrado.');
    }
    if ((await leerCuerpoAcotado(request, dependencias.config.maxBodyBytes)) === null) {
      return responderCuerpoExcesivo(dependencias, EVENTO_APERTURA);
    }
    const inicio = dependencias.ahora();
    const sdk = crearSdkClinicalApi(dependencias.config, { request, fetch: dependencias.fetch });
    const resultado = await createConversation({
      client: sdk.client,
      path: { patientId },
      parseAs: 'text',
      throwOnError: false,
    });
    return retransmitir(dependencias, {
      evento: EVENTO_APERTURA,
      sdk,
      respuesta: resultado.response,
      inicio,
    });
  };
}

/** Proxy de `GET /platform/conversations/{conversationId}` (L1D-315). Sin caché: la conversación es dato clínico. */
export function crearManejadorLecturaDeConversacion(dependencias: DependenciasDelBff): Manejador {
  return crearProxyDeLectura(dependencias, {
    evento: 'conversation.proxy',
    mensajeDeFallo: 'No se pudo obtener la conversación.',
    mensajeNoEncontrado: 'Conversación no encontrada.',
    idValido: (conversationId) => zGetConversationPath.safeParse({ conversationId }).success,
    pedir: (sdk, conversationId) =>
      getConversation({
        client: sdk.client,
        path: { conversationId },
        parseAs: 'text',
        throwOnError: false,
      }),
  });
}

/**
 * Proxy de `POST /platform/conversations/{conversationId}/turns` (L1D-315): igual que el seguimiento (Origin → id →
 * tope → SDK → `retransmitir`), sin validar la pregunta (la del borde es de clinical-api) y sin streaming. El log
 * nunca lleva la pregunta ni el id.
 */
export function crearManejadorTurnoDeConversacion(dependencias: DependenciasDelBff): Manejador {
  return async (request, conversationId) => {
    const rechazo = verificarOrigen(request, { ...dependencias, evento: EVENTO_TURNO });
    if (rechazo !== null) return rechazo;
    if (!zCreateConversationTurnPath.safeParse({ conversationId }).success) {
      return responderNoEncontrado(dependencias, EVENTO_TURNO, 'Conversación no encontrada.');
    }
    const cuerpo = await leerCuerpoAcotado(request, dependencias.config.maxBodyBytes);
    if (cuerpo === null) return responderCuerpoExcesivo(dependencias, EVENTO_TURNO);
    const inicio = dependencias.ahora();
    const sdk = crearSdkClinicalApi(dependencias.config, { request, fetch: dependencias.fetch });
    const resultado = await createConversationTurn({
      client: sdk.client,
      path: { conversationId },
      // Se reenvía tal cual: la validación del borde es de clinical-api.
      body: cuerpo as unknown as ConversationTurnCreate,
      bodySerializer: (texto) => texto as string,
      parseAs: 'text',
      throwOnError: false,
    });
    return retransmitir(dependencias, {
      evento: EVENTO_TURNO,
      sdk,
      respuesta: resultado.response,
      inicio,
    });
  };
}
