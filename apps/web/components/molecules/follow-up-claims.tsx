'use client';

import { useState } from 'react';
import type {
  CitedSource,
  FollowUpTurn,
} from '../../../../packages/api-contracts/src/types/clinical-api';
import { numerarCitasDelTurno } from '../../lib/evidence/seguimiento/numerar-citas-del-turno';
import { mensajes } from '../../lib/mensajes';
import estilos from '../evidence.module.css';
import { CitationChip } from './citation-chip';
import { CitationDetails } from './citation-details';

export interface FollowUpClaimsProps {
  turno: FollowUpTurn;
  onVerFragmento: (cita: CitedSource, idChip: string) => void;
}

/** Afirmaciones del turno con sus citas `[k]` (RN-01) y la marca de fuente nueva; todo el texto como texto React. */
export function FollowUpClaims({ turno, onVerFragmento }: FollowUpClaimsProps) {
  const [abierta, setAbierta] = useState<string | null>(null);
  const { nuevaFuente } = mensajes().followUp;
  return (
    <ul className={estilos.citas}>
      {numerarCitasDelTurno(turno).map(({ texto, citas }, indiceAfirmacion) => (
        <li key={`${indiceAfirmacion}-${texto}`}>
          <p>{texto}</p>
          <ul className={estilos.citas} aria-label={mensajes().evidence.cita.lista}>
            {citas.map(({ numero, cita }) => {
              const id = `cita-seguimiento-${turno.turnNumber}-${indiceAfirmacion}-${cita.chunkId}`;
              const expandida = abierta === id;
              return (
                <li key={cita.chunkId}>
                  <span>[{numero}] </span>
                  <CitationChip
                    cita={cita}
                    id={id}
                    idDetalle={`${id}-detalle`}
                    expandida={expandida}
                    onAlternar={() => setAbierta(expandida ? null : id)}
                  />
                  {cita.isNewSource && <span> {nuevaFuente}</span>}
                  {expandida && (
                    <CitationDetails
                      cita={cita}
                      id={`${id}-detalle`}
                      onVerFragmento={() => onVerFragmento(cita, id)}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </li>
      ))}
    </ul>
  );
}
