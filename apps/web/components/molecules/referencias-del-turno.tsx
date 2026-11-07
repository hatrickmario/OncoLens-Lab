'use client';

import { useId, useState } from 'react';
import type { CitedSource } from '../../../../packages/api-contracts/src/types/clinical-api';
import { mensajes } from '../../lib/mensajes';
import { CitationDetails } from './citation-details';

/**
 * «Ver referencias» del turno: las fuentes que citan sus opciones, con los metadatos del corpus (una sola fuente de
 * «No disponible», RN-25) y el enlace original solo si es seguro (L1D-266, `esUrlHttpSegura`). La lista se monta al
 * abrirla, para no duplicar en el DOM los metadatos que la tarjeta ya muestra. Sin fuentes no pinta nada. Una
 * referencia nunca es un análisis previo (RN-24): salen del corpus.
 */
export function ReferenciasDelTurno({ fuentes }: { fuentes: readonly CitedSource[] }) {
  const idPanel = useId();
  const [abierta, setAbierta] = useState(false);
  if (fuentes.length === 0) return null;
  const { verReferencias, referenciasLista } = mensajes().conversacion;
  return (
    <div className="mt-2">
      <button
        type="button"
        aria-expanded={abierta}
        aria-controls={idPanel}
        onClick={() => setAbierta(!abierta)}
        className="border-control-border rounded-control bg-surface min-h-11 cursor-pointer border px-4"
      >
        {verReferencias}
      </button>
      <div id={idPanel}>
        {abierta && (
          <ul aria-label={referenciasLista} className="m-0 list-none p-0">
            {fuentes.map((fuente) => (
              <li key={fuente.chunkId} className="border-control-border mt-2 border-t pt-2">
                <CitationDetails cita={fuente} id={`referencia-${fuente.chunkId}`} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
