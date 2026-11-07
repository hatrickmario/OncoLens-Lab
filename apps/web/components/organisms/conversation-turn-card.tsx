import type { ReactElement } from 'react';
import type { ConversationTurn } from '../../../../packages/api-contracts/src/types/clinical-api';

export interface ConversationTurnCardProps {
  turn: ConversationTurn;
  patientId: string;
}

export function ConversationTurnCard(_props: ConversationTurnCardProps): ReactElement {
  throw new Error('no implementado');
}
