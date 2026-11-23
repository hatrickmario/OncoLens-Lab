import type {
  ChatTurnRequest,
  ChatTurnResponse,
} from '../../../../../packages/api-contracts/src/client/rag-orchestrator/index.js';
import type { ChatTurnPort } from '../../modules/evidence-analysis/ports.js';

/**
 * Cliente de Backend 2 que no llama a nadie: guarda el cuerpo que saldría hacia `/chat/turn`. Solo para la evaluación: no
 * sustituye al cliente real (`crearRagChatClient`) ni se cablea fuera de `evaluate:chat`.
 */
export interface CapturadorDeTurnosDeEvaluacion extends ChatTurnPort {
  /** La última petición recibida; lanza si todavía no hubo ninguna. */
  ultimaPeticion(): ChatTurnRequest;
}

/** Sin petición capturada: `ultimaPeticion()` antes de que el servicio llame al puerto. */
export class SinPeticionCapturadaError extends Error {
  constructor() {
    super('el servicio no llegó a enviar ninguna petición a Backend 2');
    this.name = 'SinPeticionCapturadaError';
  }
}

/**
 * Respuesta mínima y válida del turno: un bloque `documentado` por hecho del caso, con la verbalización que ya viaja en
 * la petición. Existe solo para que el servicio de conversación resuelva `factRef → dato` y lo devuelva en `dataLinks`;
 * nunca sale de este proceso ni se mide.
 */
function respuestaQueCitaCadaHecho(peticion: ChatTurnRequest): ChatTurnResponse {
  return {
    intent: 'caso',
    blocks: peticion.caseFacts.map((hecho) => ({
      kind: 'documentado',
      text: hecho.verbalization,
      factRefs: [hecho.factRef],
    })),
    omittedClaims: 0,
    structuredState: {
      intentsVistos: ['caso'],
      preguntasPrevias: [],
      opcionesMostradas: [],
      citasMostradas: [],
      faltantesSenalados: [],
    },
    llmProvider: 'local',
    notices: [],
  };
}

/** Puerto de `/chat/turn` sin HTTP: es el borde arquitectónico por el que cruza la petición desidentificada. */
export function crearCapturadorDeTurnosDeEvaluacion(): CapturadorDeTurnosDeEvaluacion {
  let ultima: ChatTurnRequest | null = null;
  return {
    responder: (peticion) => {
      ultima = peticion;
      return Promise.resolve({ ok: true, cuerpo: respuestaQueCitaCadaHecho(peticion) });
    },
    ultimaPeticion: () => {
      if (ultima === null) throw new SinPeticionCapturadaError();
      return ultima;
    },
  };
}
