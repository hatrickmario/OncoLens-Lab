'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  AssistantRuntimeProvider,
  ThreadPrimitive,
  useExternalStoreRuntime,
  type ThreadMessageLike,
} from '@assistant-ui/react';
import { mensajesDelHilo, textoDelMensaje } from '../../lib/conversacion/mensajes-del-hilo';
import type { AlAbrirPanel, PanelLateral } from '../../lib/conversacion/panel-lateral';
import { useConversacion } from '../../lib/conversacion/use-conversacion';
import { mensajes } from '../../lib/mensajes';
import { RUTA_LOGIN_EXPIRADA } from '../../lib/sesion/motivo-de-sesion';
import { ConversationComposer } from '../molecules/conversation-composer';
import { ConversationProgress } from '../molecules/conversation-progress';
import { GuidedQuestions } from '../molecules/guided-questions';
import { ConversationThread } from './conversation-thread';
import { PanelLateralDelChat } from './panel-lateral-del-chat';

export interface ConversationSessionProps {
  patientId: string;
  preguntasGuiadas: readonly string[];
  disabled: boolean;
  /** Descarta esta conversación: el panel la remonta con otra `key` y la siguiente se abre al primer envío. */
  onNueva: () => void;
}

/** Una conversación: su estado (`useConversacion`), el runtime de assistant-ui sobre él y su panel lateral (cita o dato). */
export function ConversationSession({
  patientId,
  preguntasGuiadas,
  disabled,
  onNueva,
}: ConversationSessionProps) {
  const router = useRouter();
  const conversacion = useConversacion(patientId, () => router.replace(RUTA_LOGIN_EXPIRADA));
  const [panel, setPanel] = useState<PanelLateral | null>(null);
  const disparador = useRef<HTMLElement | null>(null);
  const abrirPanel = useCallback<AlAbrirPanel>((nuevo, idDisparador) => {
    disparador.current = document.getElementById(idDisparador);
    setPanel(nuevo);
  }, []);
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

  return (
    <AssistantRuntimeProvider runtime={runtime}>
      <ThreadPrimitive.Root className="flex flex-col gap-2">
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
          <ConversationThread patientId={patientId} onAbrirPanel={abrirPanel}>
            <ConversationProgress fase={conversacion.fase} onReintentar={conversacion.reintentar} />
          </ConversationThread>
          <ConversationComposer deshabilitado={bloqueado} />
        </div>
      </ThreadPrimitive.Root>
      <PanelLateralDelChat
        panel={panel}
        patientId={patientId}
        alCerrar={() => setPanel(null)}
        retornoDeFoco={disparador}
      />
    </AssistantRuntimeProvider>
  );
}
