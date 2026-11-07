import type { ReactNode } from 'react';
import type {
  ChatCitation,
  CitedSource,
  ConversationTurn,
} from '../../../../packages/api-contracts/src/types/clinical-api';
import { enlacesDelBloque } from '../../lib/conversacion/enlaces-de-datos';
import {
  fragmentoDeCitaDelChat,
  fragmentoDeFuente,
} from '../../lib/conversacion/fragmento-abierto';
import { numerarCitas } from '../../lib/conversacion/numerar-citas';
import type { AlAbrirPanel } from '../../lib/conversacion/panel-lateral';
import { mensajes } from '../../lib/mensajes';
import { ConversationBlock } from '../molecules/conversation-block';
import { ConversationCitations } from '../molecules/conversation-citations';
import { ConversationDataLinks } from '../molecules/conversation-data-links';
import { AnalysisResult } from './analysis-result';

export interface ConversationTurnBodyProps {
  turno: ConversationTurn;
  /** `fuentesDelTurno(turno)`, calculadas una vez por la tarjeta. */
  fuentes: readonly CitedSource[];
  patientId: string;
  onAbrirPanel: AlAbrirPanel;
  /** Avisos del turno ya pintados por la tarjeta: en un turno de evidencia van junto al encabezado de las opciones. */
  avisos?: ReactNode;
}

/**
 * Cuerpo del turno. Con `evidenceAnalysis` el análisis ya persistido y validado se pinta con `AnalysisResult` (sin hilo
 * de seguimiento) y las citas de sus bloques `[E<n>]` van aparte; sin él, un bloque por `blocks[]` en su orden. Citas y
 * datos ◆ abren su contenido en el panel lateral (`onAbrirPanel`), nunca en otra página.
 */
export function ConversationTurnBody({
  turno,
  fuentes,
  patientId,
  onAbrirPanel,
  avisos,
}: ConversationTurnBodyProps) {
  const citas = numerarCitas(turno.blocks);
  const verCita = (cita: ChatCitation, id: string) =>
    onAbrirPanel({ tipo: 'cita', fragmento: fragmentoDeCitaDelChat(cita, fuentes) }, id);
  if (turno.evidenceAnalysis) {
    const deEvidencia = citas.flat();
    const verFuente = (cita: CitedSource, idChip: string) =>
      onAbrirPanel({ tipo: 'cita', fragmento: fragmentoDeFuente(cita) }, idChip);
    return (
      <>
        <AnalysisResult
          analisis={turno.evidenceAnalysis}
          patientId={patientId}
          onVerFragmento={verFuente}
          avisos={avisos}
        />
        {turno.blocks
          .filter((bloque) => bloque.kind === 'limitacion')
          .map((bloque, indice) => (
            <ConversationBlock key={`${indice}-${bloque.text}`} bloque={bloque} />
          ))}
        {deEvidencia.length > 0 && (
          <section
            data-grupo="evidencia"
            className="border-evidence bg-evidence-bg mt-2 border-l-4 p-3"
          >
            <p className="text-evidence m-0 text-sm font-semibold">
              {mensajes().conversacion.rotulos.evidencia}
            </p>
            <ConversationCitations citas={deEvidencia} idDelTurno={turno.id} onVerCita={verCita} />
          </section>
        )}
      </>
    );
  }
  return turno.blocks.map((bloque, indice) => (
    <ConversationBlock key={`${indice}-${bloque.kind}`} bloque={bloque}>
      <ConversationDataLinks
        enlaces={enlacesDelBloque(bloque, turno.dataLinks ?? [], patientId)}
        idBase={`dato-${turno.id}-${indice}`}
        onVerEnCaso={(enlace, id) =>
          onAbrirPanel({ tipo: 'dato', enlace, textosDelTurno: [bloque.text] }, id)
        }
      />
      <ConversationCitations
        citas={citas[indice] ?? []}
        idDelTurno={turno.id}
        onVerCita={verCita}
      />
    </ConversationBlock>
  ));
}
