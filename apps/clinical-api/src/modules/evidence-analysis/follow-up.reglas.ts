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
export function alcanzaLimiteDeSeguimiento(turnosExistentes: number, maximo: number): boolean {
  return turnosExistentes >= maximo;
}

const chunkIdsDe = (citas: readonly { chunkId: string }[]): string[] =>
  citas.map(({ chunkId }) => chunkId);

/** Chunks que el análisis de origen ya citó (opciones y síntesis). */
export function chunksCitadosPorElAnalisis(
  opciones: readonly EvidenceOption[],
  sintesis: Synthesis,
): ReadonlySet<string> {
  const afirmaciones = [
    ...sintesis.agreements,
    ...sintesis.discrepancies.map(({ claim }) => claim),
  ];
  return new Set([
    ...opciones.flatMap((opcion) => chunkIdsDe(opcion.citedSources)),
    ...afirmaciones.flatMap((afirmacion) => chunkIdsDe(afirmacion.citedSources)),
  ]);
}

/** `isNewSource` de cada cita del turno: `true` si su `chunkId` no estaba entre los del análisis de origen. */
export function marcarFuentesNuevas(
  citas: readonly CitedSource[],
  chunksDelAnalisis: ReadonlySet<string>,
): FollowUpCitedSource[] {
  return citas.map((cita) => ({ ...cita, isNewSource: !chunksDelAnalisis.has(cita.chunkId) }));
}

export interface EnlacesDelTurno {
  enlaces: PatientDataLink[];
  /** `dataRef` que citan las afirmaciones y el análisis no conoce: la respuesta es incoherente. */
  sinResolver: string[];
}

/** Enlaces del turno: los `dataRef` que citan sus afirmaciones, resueltos con el mapa del análisis (en su orden). */
export function enlacesDelTurno(
  afirmaciones: readonly SupportedClaim[],
  enlacesDelAnalisis: readonly PatientDataLink[],
): EnlacesDelTurno {
  const citados = new Set(afirmaciones.flatMap((afirmacion) => afirmacion.patientDataRefs));
  const conocidos = new Set(enlacesDelAnalisis.map(({ dataRef }) => dataRef));
  return {
    enlaces: enlacesDelAnalisis.filter(({ dataRef }) => citados.has(dataRef)),
    sinResolver: [...citados].filter((dataRef) => !conocidos.has(dataRef)),
  };
}
