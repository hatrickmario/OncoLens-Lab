import type {
  FollowUpCitedSource,
  FollowUpTurn,
} from '../../../../../packages/api-contracts/src/types/clinical-api';

export interface CitaNumerada {
  /** Número `[k]` sobre `citedSources` del turno, desde 1. */
  numero: number;
  cita: FollowUpCitedSource;
}

export interface AfirmacionNumerada {
  texto: string;
  citas: CitaNumerada[];
}

/** Numera las citas de cada afirmación sobre `citedSources` del turno; una cita sin fuente en el turno no se muestra. */
export function numerarCitasDelTurno(turno: FollowUpTurn): AfirmacionNumerada[] {
  return turno.answer.map(({ text, citedSources }) => ({
    texto: text,
    citas: citedSources.flatMap(({ chunkId }) => {
      const indice = turno.citedSources.findIndex((fuente) => fuente.chunkId === chunkId);
      return indice < 0 ? [] : [{ numero: indice + 1, cita: turno.citedSources[indice]! }];
    }),
  }));
}
