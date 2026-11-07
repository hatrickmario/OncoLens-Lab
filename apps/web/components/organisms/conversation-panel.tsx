'use client';

import { useState } from 'react';
import { ConversationSession } from './conversation-session';

export interface ConversationPanelProps {
  /** UUID del paciente de la ruta; va solo en la ruta de la API, nunca en una query string. */
  patientId: string;
  /** De 0 a 4 textos ya compuestos por el RSC (AC-8); el cliente no recibe el resumen ni el catálogo. */
  preguntasGuiadas?: readonly string[];
  /** RN-15: la pasa L1D-213 desde `aiAnalysisAvailable = false`; con `true` no se puede preguntar ni se envía nada. */
  disabled?: boolean;
}

/**
 * Panel conversacional del paciente (US-267): sustituye al formulario de una pregunta y al hilo de 10 seguimientos.
 * «Nueva conversación» remonta la sesión con otra `key` (sin `threadId` experimental de assistant-ui, ADR-51 §8).
 */
export function ConversationPanel({
  patientId,
  preguntasGuiadas = [],
  disabled = false,
}: ConversationPanelProps) {
  const [conversacion, setConversacion] = useState(0);
  return (
    <ConversationSession
      key={conversacion}
      patientId={patientId}
      preguntasGuiadas={preguntasGuiadas}
      disabled={disabled}
      onNueva={() => setConversacion((n) => n + 1)}
    />
  );
}
