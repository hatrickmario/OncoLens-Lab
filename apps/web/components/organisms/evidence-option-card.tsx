'use client';

import { useState } from 'react';
import type {
  CitedSource,
  EvidenceOption,
  SourceApplicability,
} from '../../../../packages/api-contracts/src/types/clinical-api';
import { elegirBaseDeRelevancia } from '../../lib/evidence/criterio-de-orden';
import { mensajes } from '../../lib/mensajes';
import estilos from '../evidence.module.css';
import { CitationChip } from '../molecules/citation-chip';
import { CitationDetails } from '../molecules/citation-details';
import { OptionApplicability } from '../molecules/option-applicability';
import { RelevanceMeta } from '../molecules/relevance-meta';
import { ApplicabilityTable } from './applicability-table';

export interface EvidenceOptionCardProps {
  opcion: EvidenceOption;
  /** Distingue los ids de esta tarjeta de los de otras (la UI itera el arreglo). */
  indice: number;
  /** Rótulo de posición en la lista («Opción descrita n de N»): posición, no jerarquía (RN-23). */
  posicion: string;
  /** `applicability[]` del análisis: criterios por fuente para la tabla de la opción. */
  fuentes: readonly SourceApplicability[];
  patientId: string;
  onVerFragmento: (cita: CitedSource, idChip: string) => void;
}

/** Una opción descrita con su justificación, sus citas verificables (RN-01) y la relevancia al final (RN-03). */
export function EvidenceOptionCard({
  opcion,
  indice,
  posicion,
  fuentes,
  patientId,
  onVerFragmento,
}: EvidenceOptionCardProps) {
  const [abierta, setAbierta] = useState<string | null>(null);
  return (
    <article className={estilos.tarjeta}>
      <p>{posicion}</p>
      <h3>{opcion.option}</h3>
      <p>{opcion.rationale}</p>
      <OptionApplicability opcion={opcion}>
        <ApplicabilityTable opcion={opcion} fuentes={fuentes} patientId={patientId} />
      </OptionApplicability>
      {opcion.details && opcion.details.length > 0 && (
        <details className={estilos.masDetalle}>
          <summary>{mensajes().evidence.detalle.resumen}</summary>
          {opcion.details.map((parrafo) => (
            <p key={parrafo}>{parrafo}</p>
          ))}
        </details>
      )}
      <ul className={estilos.citas} aria-label={mensajes().evidence.cita.lista}>
        {opcion.citedSources.map((cita) => {
          const idChip = `cita-${indice}-${cita.chunkId}`;
          const idDetalle = `detalle-${indice}-${cita.chunkId}`;
          const expandida = abierta === cita.chunkId;
          return (
            <li key={cita.chunkId}>
              <CitationChip
                cita={cita}
                id={idChip}
                idDetalle={idDetalle}
                expandida={expandida}
                onAlternar={() => setAbierta(expandida ? null : cita.chunkId)}
              />
              {expandida && (
                <CitationDetails
                  cita={cita}
                  id={idDetalle}
                  onVerFragmento={() => onVerFragmento(cita, idChip)}
                />
              )}
            </li>
          );
        })}
      </ul>
      <RelevanceMeta
        valor={opcion.relevanceScore}
        idAyuda={`ayuda-relevancia-${indice}`}
        basis={elegirBaseDeRelevancia(opcion)}
      />
    </article>
  );
}
