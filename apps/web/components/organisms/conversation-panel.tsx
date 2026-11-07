'use client';

import type { ReactElement } from 'react';

export interface ConversationPanelProps {
  /** UUID del paciente de la ruta; va solo en la ruta de la API, nunca en una query string. */
  patientId: string;
  /** De 0 a 4 textos ya compuestos por el RSC (AC-8); el cliente no recibe el resumen ni el catálogo. */
  preguntasGuiadas?: readonly string[];
  /** RN-15: la pasa L1D-213 desde `aiAnalysisAvailable = false`. */
  disabled?: boolean;
}

export function ConversationPanel(_props: ConversationPanelProps): ReactElement {
  throw new Error('no implementado');
}
