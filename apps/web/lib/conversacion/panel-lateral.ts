import type { ConversationDataLink } from '../../../../packages/api-contracts/src/types/clinical-api';
import type { FragmentoAbierto } from './fragmento-abierto';

/**
 * Qué muestra el panel lateral del chat (design D1). Una cita lleva su fragmento ya resuelto; un dato lleva su enlace y
 * lo que el turno dice de él (el contrato no trae el valor del biomarcador ni del diagnóstico en la vista de caso).
 */
export type PanelLateral =
  | { tipo: 'cita'; fragmento: FragmentoAbierto }
  | { tipo: 'dato'; enlace: ConversationDataLink; textosDelTurno: readonly string[] };

/** Abre el panel; `idDisparador` es el id del botón que lo abrió, al que vuelve el foco al cerrarlo. */
export type AlAbrirPanel = (panel: PanelLateral, idDisparador: string) => void;
