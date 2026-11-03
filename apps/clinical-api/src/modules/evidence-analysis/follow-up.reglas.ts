import type {
  EvidenceOption,
  FollowUpCitedSource,
  PatientDataLink,
  Synthesis,
} from '../../../../../packages/api-contracts/src/client/clinical-api/index.js';
import type {
  CitedSource,
  SupportedClaim,
} from '../../../../../packages/api-contracts/src/client/rag-orchestrator/index.js';

/** RN-22: ¿el análisis ya tiene el máximo de turnos? El tope sale de configuración (`ANALYSIS_FOLLOWUP_MAX`). */
export function superaLimiteDeSeguimiento(turnosExistentes: number, maximo: number): boolean {
  void turnosExistentes;
  void maximo;
  throw new Error('no implementado');
}

/** Chunks que el análisis de origen ya citó (opciones y síntesis). */
export function chunksCitadosPorElAnalisis(
  opciones: readonly EvidenceOption[],
  sintesis: Synthesis,
): ReadonlySet<string> {
  void opciones;
  void sintesis;
  throw new Error('no implementado');
}

/** `isNewSource` de cada cita del turno: `true` si su `chunkId` no estaba entre los del análisis de origen. */
export function marcarFuentesNuevas(
  citas: readonly CitedSource[],
  chunksDelAnalisis: ReadonlySet<string>,
): FollowUpCitedSource[] {
  void citas;
  void chunksDelAnalisis;
  throw new Error('no implementado');
}

/** Enlaces del turno: los `dataRef` que citan sus afirmaciones, resueltos con el mapa del análisis. */
export function enlacesDelTurno(
  afirmaciones: readonly SupportedClaim[],
  enlacesDelAnalisis: readonly PatientDataLink[],
): PatientDataLink[] {
  void afirmaciones;
  void enlacesDelAnalisis;
  throw new Error('no implementado');
}
