import type { FaseDeLaConversacion } from '../../lib/conversacion/use-conversacion';
import { mensajes } from '../../lib/mensajes';

export interface ConversationProgressProps {
  fase: FaseDeLaConversacion;
  onReintentar: () => void;
}

/**
 * Solo progreso o error, nunca contenido del asistente (TBD-08): «Analizando…» mientras corre la petición y, si falla,
 * un `role="alert"` montado al llegar, sin código HTTP ni mensaje técnico. El mensaje del sistema no lleva avisos de IA.
 */
export function ConversationProgress({ fase, onReintentar }: ConversationProgressProps) {
  const { analizando, errorTitulo, reintentar } = mensajes().conversacion;
  if (fase === 'enviando') {
    return (
      <p role="status" className="text-text-muted mt-3">
        {analizando}
      </p>
    );
  }
  if (fase !== 'error') return null;
  return (
    <div role="alert" className="bg-error-bg text-error rounded-tarjeta mt-3 p-3">
      <p className="m-0 font-semibold">{errorTitulo}</p>
      <button
        type="button"
        onClick={onReintentar}
        className="border-control-border rounded-control bg-surface text-text mt-2 min-h-11 cursor-pointer border px-4"
      >
        {reintentar}
      </button>
    </div>
  );
}
