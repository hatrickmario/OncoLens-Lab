'use client';

import type { CitedSource } from '../../../../packages/api-contracts/src/types/clinical-api';
import estilos from '../evidence.module.css';

export interface CitationChipProps {
  cita: CitedSource;
  id: string;
  idDetalle: string;
  expandida: boolean;
  onAlternar: () => void;
}

/** Chip de la cita (RN-01): `sourceName · externalId` copiados del corpus, hojas marcadas con `data-origen`. */
export function CitationChip({ cita, id, idDetalle, expandida, onAlternar }: CitationChipProps) {
  return (
    <button
      type="button"
      id={id}
      className={estilos.chip}
      aria-expanded={expandida}
      aria-controls={idDetalle}
      onClick={onAlternar}
    >
      <span data-origen="corpus" data-campo="sourceName">
        {cita.sourceName}
      </span>
      {' · '}
      <span data-origen="corpus" data-campo="externalId">
        {cita.externalId}
      </span>
    </button>
  );
}
