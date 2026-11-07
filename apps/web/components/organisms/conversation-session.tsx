'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import {
  AssistantRuntimeProvider,
  ThreadPrimitive,
  useExternalStoreRuntime,
  type ThreadMessageLike,
} from '@assistant-ui/react';
import type { CitedSource } from '../../../../packages/api-contracts/src/types/clinical-api';
import { mensajesDelHilo, textoDelMensaje } from '../../lib/conversacion/mensajes-del-hilo';
import { useConversacion } from '../../lib/conversacion/use-conversacion';
import { mensajes } from '../../lib/mensajes';
import { RUTA_LOGIN_EXPIRADA } from '../../lib/sesion/motivo-de-sesion';
import { CitedFragment } from '../molecules/cited-fragment';
import { ConversationComposer } from '../molecules/conversation-composer';
import { ConversationProgress } from '../molecules/conversation-progress';
import { GuidedQuestions } from '../molecules/guided-questions';
import { ConversationThread } from './conversation-thread';

export interface ConversationSessionProps {
  patientId: string;
  preguntasGuiadas: readonly string[];
  disabled: boolean;
  /** Descarta esta conversación: el panel la remonta con otra `key` y la siguiente se abre al primer envío. */
  onNueva: () => void;
}

interface FragmentoAbierto {
  cita: CitedSource;
  idChip: string;
}

/** Una conversación: su estado (`useConversacion`), el runtime de assistant-ui sobre él y el fragmento citado abierto. */
export function ConversationSession({
  patientId,
  preguntasGuiadas,
  disabled,
  onNueva,
}: ConversationSessionProps) {
  const router = useRouter();
  const conversacion = useConversacion(patientId, () => router.replace(RUTA_LOGIN_EXPIRADA));
  const [fragmento, setFragmento] = useState<FragmentoAbierto | null>(null);
  const mensajesDelChat = useMemo<ThreadMessageLike[]>(
    () => mensajesDelHilo(conversacion.elementos),
    [conversacion.elementos],
  );
  const runtime = useExternalStoreRuntime<ThreadMessageLike>({
    messages: mensajesDelChat,
    isRunning: conversacion.fase === 'enviando',
    convertMessage: (mensaje) => mensaje,
    onNew: async (mensaje) => conversacion.enviar(textoDelMensaje(mensaje)),
  });

  const { nuevaConversacion } = mensajes().conversacion;
  const bloqueado = disabled || conversacion.fase === 'bloqueado';
  const sinTurnos = !conversacion.elementos.some((e) => e.tipo === 'turno');
  const ofrecerGuiadas =
    conversacion.elementos.length === 0 || (conversacion.fase === 'bloqueado' && sinTurnos);

  function volverALaCita() {
    const idChip = fragmento?.idChip;
    setFragmento(null);
    if (idChip) document.getElementById(idChip)?.focus();
  }

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root className="flex flex-col gap-2 md:flex-row">
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={onNueva}
            className="border-control-border rounded-control bg-surface min-h-11 cursor-pointer border px-4"
          >
            {nuevaConversacion}
          </button>
          {ofrecerGuiadas && (
            <GuidedQuestions
              preguntas={preguntasGuiadas}
              deshabilitadas={bloqueado}
              onElegir={conversacion.enviar}
            />
          )}
          <ConversationThread
            patientId={patientId}
            onVerFragmento={(cita, idChip) => setFragmento({ cita, idChip })}
          >
            <ConversationProgress fase={conversacion.fase} onReintentar={conversacion.reintentar} />
          </ConversationThread>
          <ConversationComposer deshabilitado={bloqueado} />
        </div>
        {fragmento && (
          <aside className="md:w-80" aria-label={mensajes().evidence.fragmento.titulo}>
            <CitedFragment cita={fragmento.cita} onVolver={volverALaCita} />
          </aside>
        )}
      </ThreadPrimitive.Root>
    </AssistantRuntimeProvider>
  );
}
