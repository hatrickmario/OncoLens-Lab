import type {
  FollowUpCitedSource,
  FollowUpTurn,
  SupportedClaim,
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

function fuenteDelTurno(turno: FollowUpTurn, chunkId: string): number {
  return turno.citedSources.findIndex((fuente) => fuente.chunkId === chunkId);
}

/**
 * Afirmaciones con soporte resoluble en el turno (RN-01): al menos una cita presente en `citedSources` del turno o un
 * dato del paciente resuelto en `patientDataLinks`. Una afirmación sin ninguna de las dos no se muestra.
 */
export function afirmacionesConCita(turno: FollowUpTurn): SupportedClaim[] {
  const enlaces = new Set(turno.patientDataLinks.map(({ dataRef }) => dataRef));
  return turno.answer.filter(
    ({ citedSources, patientDataRefs }) =>
      citedSources.some(({ chunkId }) => fuenteDelTurno(turno, chunkId) >= 0) ||
      patientDataRefs.some((ref) => enlaces.has(ref)),
  );
}

/** Formato: numera las citas de cada afirmación mostrable sobre `citedSources` del turno. */
export function numerarCitasDelTurno(turno: FollowUpTurn): AfirmacionNumerada[] {
  return afirmacionesConCita(turno).map(({ text, citedSources }) => ({
    texto: text,
    citas: citedSources.flatMap(({ chunkId }) => {
      const indice = fuenteDelTurno(turno, chunkId);
      return indice < 0 ? [] : [{ numero: indice + 1, cita: turno.citedSources[indice]! }];
    }),
  }));
}
