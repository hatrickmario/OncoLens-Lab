'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { MessagePrimitive, ThreadPrimitive } from '@assistant-ui/react';
import type {
  CitedSource,
  ConversationTurn,
} from '../../../../packages/api-contracts/src/types/clinical-api';
import { PARTE_DEL_TURNO } from '../../lib/conversacion/mensajes-del-hilo';
import { mensajes } from '../../lib/mensajes';
import { ConversationTurnCard } from './conversation-turn-card';

interface ContextoDelTurno {
  patientId: string;
  onVerFragmento: (cita: CitedSource, idChip: string) => void;
}

/**
 * assistant-ui monta las partes con un componente sin props propias: patientId y el manejador del fragmento le llegan
 * por contexto (acotado al hilo, nunca al paciente ni al análisis; design D1).
 */
const ContextoDelHilo = createContext<ContextoDelTurno | null>(null);

/** Componente estable (fuera del render): assistant-ui remonta las partes si `by_name` cambia de identidad. */
function ParteDelTurno({ data }: { data: unknown }) {
  const contexto = useContext(ContextoDelHilo)!;
  return (
    <ConversationTurnCard
      turn={data as ConversationTurn}
      patientId={contexto.patientId}
      onVerFragmento={contexto.onVerFragmento}
    />
  );
}
const COMPONENTES = { data: { by_name: { [PARTE_DEL_TURNO]: ParteDelTurno } } };

export interface ConversationThreadProps extends ContextoDelTurno {
  /** Estado de la petición (progreso o error): va tras el hilo y fuera del `role="log"`. */
  children?: ReactNode;
}

/** Hilo del chat: `role="log"` con `aria-live="polite"`, la pregunta del oncólogo y la tarjeta de cada turno en orden. */
export function ConversationThread({
  patientId,
  onVerFragmento,
  children,
}: ConversationThreadProps) {
  const { hilo, preguntaDelOncologo } = mensajes().conversacion;
  return (
    <ContextoDelHilo.Provider value={{ patientId, onVerFragmento }}>
      <ThreadPrimitive.Viewport className="max-h-[60vh] overflow-y-auto">
        <div role="log" aria-live="polite" aria-label={hilo}>
          <ThreadPrimitive.Messages>
            {({ message }) => (
              <MessagePrimitive.Root>
                {message.role === 'user' ? (
                  <p className="bg-surface-alt rounded-tarjeta mt-3 mb-0 ml-auto max-w-[85%] p-2">
                    <span className="sr-only">{preguntaDelOncologo}: </span>
                    {message.content
                      .map((parte) => (parte.type === 'text' ? parte.text : ''))
                      .join('')}
                  </p>
                ) : (
                  <MessagePrimitive.Parts components={COMPONENTES} />
                )}
              </MessagePrimitive.Root>
            )}
          </ThreadPrimitive.Messages>
        </div>
        {children}
      </ThreadPrimitive.Viewport>
    </ContextoDelHilo.Provider>
  );
}
