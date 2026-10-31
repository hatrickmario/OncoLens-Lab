'use client';

import { useId, useState } from 'react';
import type {
  EvidenceOption,
  SourceApplicability,
} from '../../../../packages/api-contracts/src/types/clinical-api';
import { mensajes } from '../../lib/mensajes';
import estilos from '../evidence.module.css';
import { ApplicabilitySource } from '../molecules/applicability-source';

export interface ApplicabilityTableProps {
  opcion: EvidenceOption;
  /** `applicability[]` del análisis: los criterios de cada fuente. */
  fuentes: readonly SourceApplicability[];
  patientId: string;
}

/** Aplicabilidad de una opción por fuente y criterio, plegada por defecto (D1). Solo muestra lo calculado. */
export function ApplicabilityTable({ opcion, fuentes, patientId }: ApplicabilityTableProps) {
  const idPanel = useId();
  const [abierta, setAbierta] = useState(false);
  return (
    <div className={estilos.aplicabilidadPorCriterio}>
      <button
        type="button"
        className={estilos.chip}
        aria-expanded={abierta}
        aria-controls={idPanel}
        onClick={() => setAbierta(!abierta)}
      >
        {mensajes().evidence.aplicabilidad.verPorCriterio}
      </button>
      <div id={idPanel}>
        {abierta &&
          opcion.perSource.map((fuente) => (
            <ApplicabilitySource
              key={fuente.externalId}
              fuente={fuente}
              criterios={fuentes.find((f) => f.externalId === fuente.externalId)?.criteria ?? []}
              citas={opcion.citedSources}
              patientId={patientId}
            />
          ))}
      </div>
    </div>
  );
}
