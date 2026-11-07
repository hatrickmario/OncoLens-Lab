'use client';

import { memo, useState } from 'react';
import type { ConversationTurn } from '../../../../packages/api-contracts/src/types/clinical-api';
import { faltanAvisosDeIA } from '../../lib/conversacion/avisos-de-ia';
import { ExpansionDelTurno } from '../../lib/conversacion/expansion-del-turno';
import { fuentesDelTurno } from '../../lib/conversacion/fuentes-del-turno';
import type { AlAbrirPanel } from '../../lib/conversacion/panel-lateral';
import { mensajes, rellenar } from '../../lib/mensajes';
import { AccionesDelTurno } from '../molecules/acciones-del-turno';
import { ConversationDataLine } from '../molecules/conversation-data-line';
import { ConversationNotices } from '../molecules/conversation-notices';
import { ConversationTurnHeader } from '../molecules/conversation-turn-header';
import { ConversationTurnBody } from './conversation-turn-body';

export interface ConversationTurnCardProps {
  turn: ConversationTurn;
  patientId: string;
  /** Abre una cita o un dato en el panel lateral; el padre lo mantiene estable para que la tarjeta no se repinte. */
  onAbrirPanel: AlAbrirPanel;
}

/**
 * Tarjeta de un turno del asistente. Los avisos de IA son solo los de `turn.notices[]` (RN-19). Un turno con contenido
 * generado y sin avisos no se pinta como válido: muestra un `role="alert"` sin detalle técnico y ningún bloque.
 * «Expandir todo» es estado de esta tarjeta (`memo`: abrir el panel o expandir otro turno no la repinta).
 */
export const ConversationTurnCard = memo(function ConversationTurnCard({
  turn,
  patientId,
  onAbrirPanel,
}: ConversationTurnCardProps) {
  const { turno: titulo, sinAvisosTitulo } = mensajes().conversacion;
  const [expandido, setExpandido] = useState(false);
  const fuentes = fuentesDelTurno(turn);
  // En un turno de evidencia los avisos van junto al encabezado de las opciones; en los demás, al final de la tarjeta.
  const avisos = <ConversationNotices avisos={turn.notices} />;
  const avisosEnElCuerpo = turn.evidenceAnalysis !== undefined;
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
        <ExpansionDelTurno.Provider value={expandido}>
          <ConversationTurnBody
            turno={turn}
            fuentes={fuentes}
            patientId={patientId}
            onAbrirPanel={onAbrirPanel}
            avisos={avisosEnElCuerpo ? avisos : undefined}
          />
          <ConversationDataLine usados={turn.dataUsed ?? []} ausentes={turn.dataMissing ?? []} />
          <AccionesDelTurno
            expandido={expandido}
            onAlternar={() => setExpandido(!expandido)}
            afirmacionesOmitidas={turn.omittedClaims}
            fuentes={fuentes}
          />
          {!avisosEnElCuerpo && avisos}
        </ExpansionDelTurno.Provider>
      )}
    </div>
  );
});
