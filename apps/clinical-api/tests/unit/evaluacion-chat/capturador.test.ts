import { describe, expect, it } from 'vitest';
import peticionDeEjemplo from '../../../../../contracts/examples/chat-turn-request.json' with { type: 'json' };
import { zChatTurnResponseRefinado } from '../../../../../packages/api-contracts/src/zod/rag-orchestrator/refinamientos.gen.js';
import type { ChatTurnRequest } from '../../../../../packages/api-contracts/src/client/rag-orchestrator/index.js';
import {
  SinPeticionCapturadaError,
  crearCapturadorDeTurnosDeEvaluacion,
} from '../../../src/evaluacion/chat/capturador.js';

const peticion = peticionDeEjemplo as ChatTurnRequest;

describe('crearCapturadorDeTurnosDeEvaluacion', () => {
  it('guarda la petición recibida y la devuelve en ultimaPeticion', async () => {
    const capturador = crearCapturadorDeTurnosDeEvaluacion();

    await capturador.responder(peticion);

    expect(capturador.ultimaPeticion()).toBe(peticion);
  });

  it('lanza cuando ultimaPeticion se pide antes de que el servicio llame al puerto', () => {
    expect(() => crearCapturadorDeTurnosDeEvaluacion().ultimaPeticion()).toThrow(
      SinPeticionCapturadaError,
    );
  });

  it('responde ok con un cuerpo que cumple el contrato de ChatTurnResponse, como el cliente real de /chat/turn', async () => {
    const respuesta = await crearCapturadorDeTurnosDeEvaluacion().responder(peticion);

    expect(respuesta.ok).toBe(true);
    if (!respuesta.ok) return;
    expect(zChatTurnResponseRefinado.safeParse(respuesta.cuerpo).success).toBe(true);
  });

  it('cita cada hecho de la petición en un bloque documentado con su factRef', async () => {
    const respuesta = await crearCapturadorDeTurnosDeEvaluacion().responder(peticion);

    if (!respuesta.ok) throw new Error('el capturador respondió un fallo');
    expect(respuesta.cuerpo.blocks.flatMap((bloque) => bloque.factRefs ?? [])).toEqual(
      peticion.caseFacts.map((hecho) => hecho.factRef),
    );
  });
});
