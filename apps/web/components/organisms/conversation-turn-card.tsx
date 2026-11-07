import type {
  CitedSource,
  ConversationTurn,
} from '../../../../packages/api-contracts/src/types/clinical-api';
import { faltanAvisosDeIA } from '../../lib/conversacion/avisos-de-ia';
import { mensajes, rellenar } from '../../lib/mensajes';
import { ConversationDataLine } from '../molecules/conversation-data-line';
import { ConversationNotices } from '../molecules/conversation-notices';
import { ConversationTurnHeader } from '../molecules/conversation-turn-header';
import { ConversationTurnBody } from './conversation-turn-body';

export interface ConversationTurnCardProps {
  turn: ConversationTurn;
  patientId: string;
  /** Abre el fragmento citado de un análisis de evidencia; sin él, el turno no ofrece «ver fragmento». */
  onVerFragmento?: (cita: CitedSource, idChip: string) => void;
}

/**
 * Tarjeta de un turno del asistente. Los avisos de IA son solo los de `turn.notices[]` (RN-19). Un turno con contenido
 * generado y sin avisos no se pinta como válido: muestra un `role="alert"` sin detalle técnico y ningún bloque.
 */
export function ConversationTurnCard({
  turn,
  patientId,
  onVerFragmento,
}: ConversationTurnCardProps) {
  const { turno: titulo, sinAvisosTitulo } = mensajes().conversacion;
  return (
    // Grupo y no `article`: las tarjetas de opción del análisis ya son `article` y se anidan en la del turno.
    <div
      role="group"
      aria-label={rellenar(titulo, { n: turn.turnNumber })}
      className="bg-surface border-control-border rounded-tarjeta mt-3 border p-3"
    >
      <ConversationTurnHeader turno={turn} />
      {faltanAvisosDeIA(turn) ? (
        <p role="alert" className="text-error m-0 mt-2">
          {sinAvisosTitulo}
        </p>
      ) : (
        <>
          <ConversationTurnBody
            turno={turn}
            patientId={patientId}
            onVerFragmento={onVerFragmento ?? (() => {})}
          />
          <ConversationDataLine usados={turn.dataUsed ?? []} ausentes={turn.dataMissing ?? []} />
          <ConversationNotices avisos={turn.notices} />
        </>
      )}
    </div>
  );
}
