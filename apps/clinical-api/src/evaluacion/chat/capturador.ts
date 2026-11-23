import type { ChatTurnRequest } from '../../../../../packages/api-contracts/src/client/rag-orchestrator/index.js';
import type { ChatTurnPort } from '../../modules/evidence-analysis/ports.js';

/** Cliente de Backend 2 que no llama a nadie: guarda el cuerpo que saldría hacia `/chat/turn`. */
export interface CapturadorDeTurnos extends ChatTurnPort {
  /** La última petición recibida; lanza si todavía no hubo ninguna. */
  ultimaPeticion(): ChatTurnRequest;
}

export function crearCapturadorDeTurnos(): CapturadorDeTurnos {
  return {
    responder: () => Promise.reject(new Error('no implementado')),
    ultimaPeticion: () => {
      throw new Error('no implementado');
    },
  };
}
