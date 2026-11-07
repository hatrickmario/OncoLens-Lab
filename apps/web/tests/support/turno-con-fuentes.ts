import { turnoDeEvidencia } from './msw/conversaciones';
import { fx08ba } from './aplicabilidad-ui';

type Json = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

const copia = <T>(valor: T): T => structuredClone(valor);
const LETRAS = ['a', 'b', 'c'] as const;

export interface OpcionesDeTurnoConFuentes {
  /** Cambios sobre cada fuente citada, en orden (la 1.ª, la 2.ª, la 3.ª). */
  cambiosPorFuente?: Json[];
  omitidas?: number;
  /** Texto del fragmento de la 1.ª fuente (en la cita del bloque y en la fuente). */
  textoDelFragmento?: string;
}

/**
 * Turno de evidencia del contrato (`conversation-turn-evidencia.json`) con tres fuentes citadas: la 1.ª sin autores
 * (la del ejemplo) y las otras dos con autores. Cada cita del bloque `evidencia` lleva el `chunkId` de su fuente, como
 * en un turno real de Backend 1, y el análisis es el de aplicabilidad `fx08ba` para que la tabla tenga estados.
 */
export function turnoDeEvidenciaConFuentes({
  cambiosPorFuente = [],
  omitidas = 0,
  textoDelFragmento,
}: OpcionesDeTurnoConFuentes = {}): Json {
  const turno = copia(turnoDeEvidencia) as Json;
  const analisis = fx08ba();
  const base = analisis.evidenceOptions[0].citedSources[0] as Json;
  const fuentes = LETRAS.map((letra, indice) => {
    const fuente =
      indice === 0
        ? base
        : {
            ...copia(base),
            chunkId: `chunk_fuente_${letra}`,
            externalId: `doc-fuente-${letra}`,
            title: `Fuente sintética ${indice + 1}`,
            authors: `Autora Sintética ${letra.toUpperCase()}`,
          };
    return { ...fuente, ...cambiosPorFuente[indice] };
  });
  if (textoDelFragmento) fuentes[0]!.chunkTextSnapshot = textoDelFragmento;
  analisis.evidenceOptions[0].citedSources = fuentes;
  turno.evidenceAnalysis = analisis;
  turno.omittedClaims = omitidas;
  turno.blocks[0].citations = fuentes.map((fuente, indice) => ({
    chunkId: fuente.chunkId,
    documentId: `doc-${LETRAS[indice]}`,
    sourceTitle: fuente.title,
    chunkOrdinal: 5 + indice,
    chunkCount: 12,
    chunkTextSnapshot: fuente.chunkTextSnapshot,
  }));
  return turno;
}
