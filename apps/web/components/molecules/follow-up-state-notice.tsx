import { mensajes } from '../../lib/mensajes';
import { Button } from '../ui/button';

export interface FollowUpStateNoticeProps {
  /** Texto del estado (sin evidencia, fuera de contexto o límite): sin código HTTP ni traza. */
  texto: string;
  onNuevoAnalisis: () => void;
}

/** Aviso que no bloquea (RN-26): dice qué pasó y ofrece abrir un análisis nuevo. */
export function FollowUpStateNotice({ texto, onNuevoAnalisis }: FollowUpStateNoticeProps) {
  return (
    <div>
      <p>{texto}</p>
      <Button variante="secundario" onClick={onNuevoAnalisis}>
        {mensajes().followUp.nuevoAnalisis}
      </Button>
    </div>
  );
}
