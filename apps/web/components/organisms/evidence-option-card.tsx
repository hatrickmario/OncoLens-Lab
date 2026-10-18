'use client';

import { useState } from 'react';
import type {
  CitedSource,
  EvidenceOption,
} from '../../../../packages/api-contracts/src/types/clinical-api';
import { mensajes } from '../../lib/mensajes';
import estilos from '../evidence.module.css';
import { CitationChip } from '../molecules/citation-chip';
import { CitationDetails } from '../molecules/citation-details';
import { RelevanceMeta } from '../molecules/relevance-meta';

export interface EvidenceOptionCardProps {
  opcion: EvidenceOption;
  /** Distingue los ids de esta tarjeta de los de otras (la UI itera el arreglo). */
  indice: number;
  onVerFragmento: (cita: CitedSource, idChip: string) => void;
}

/** Una opción descrita con su justificación, sus citas verificables (RN-01) y la relevancia al final (RN-03). */
export function EvidenceOptionCard({ opcion, indice, onVerFragmento }: EvidenceOptionCardProps) {
  const [abierta, setAbierta] = useState<string | null>(null);
  return (
    <article className={estilos.tarjeta}>
      <h3>{opcion.option}</h3>
      <p>{opcion.rationale}</p>
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
      <RelevanceMeta valor={opcion.relevanceScore} idAyuda={`ayuda-relevancia-${indice}`} />
    </article>
  );
}
