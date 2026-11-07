import type {
  CitedSource,
  ConversationTurn,
} from '../../../../packages/api-contracts/src/types/clinical-api';
import { enlacesDelBloque } from '../../lib/conversacion/enlaces-de-datos';
import { numerarCitas } from '../../lib/conversacion/numerar-citas';
import { mensajes } from '../../lib/mensajes';
import { ConversationBlock } from '../molecules/conversation-block';
import { ConversationCitations } from '../molecules/conversation-citations';
import { ConversationDataLinks } from '../molecules/conversation-data-links';
import { AnalysisResult } from './analysis-result';

export interface ConversationTurnBodyProps {
  turno: ConversationTurn;
  patientId: string;
  onVerFragmento: (cita: CitedSource, idChip: string) => void;
}

/**
 * Cuerpo del turno. Con `evidenceAnalysis` el análisis ya persistido y validado se pinta con `AnalysisResult` (sin hilo
 * de seguimiento) y las citas de sus bloques `[E<n>]` van aparte; sin él, un bloque por `blocks[]` en su orden.
 */
export function ConversationTurnBody({
  turno,
  patientId,
  onVerFragmento,
}: ConversationTurnBodyProps) {
  const citas = numerarCitas(turno.blocks);
  if (turno.evidenceAnalysis) {
    const deEvidencia = citas.flat();
    return (
      <>
        <AnalysisResult
          analisis={turno.evidenceAnalysis}
          patientId={patientId}
          onVerFragmento={onVerFragmento}
        />
        {deEvidencia.length > 0 && (
          <section
            data-grupo="evidencia"
            className="border-evidence bg-evidence-bg mt-2 border-l-4 p-3"
          >
            <p className="text-evidence m-0 text-sm font-semibold">
              {mensajes().conversacion.rotulos.evidencia}
            </p>
            <ConversationCitations citas={deEvidencia} />
          </section>
        )}
      </>
    );
  }
  return turno.blocks.map((bloque, indice) => (
    <ConversationBlock key={`${indice}-${bloque.kind}`} bloque={bloque}>
      <ConversationDataLinks enlaces={enlacesDelBloque(bloque, turno.dataLinks ?? [], patientId)} />
      <ConversationCitations citas={citas[indice] ?? []} />
    </ConversationBlock>
  ));
}
