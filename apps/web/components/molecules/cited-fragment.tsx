'use client';

import { useEffect, useRef } from 'react';
import type { CitedSource } from '../../../../packages/api-contracts/src/types/clinical-api';
import { mensajes } from '../../lib/mensajes';
import estilos from '../evidence.module.css';
import { AutoresDeLaCita } from './citation-details';

/** Texto original recuperado (`[S1 resp. 8]`: sin traducción); el foco va al encabezado al abrirse. */
export function CitedFragment({ cita, onVolver }: { cita: CitedSource; onVolver: () => void }) {
  const { fragmento, cita: textos, licencia } = mensajes().evidence;
  const encabezado = useRef<HTMLHeadingElement>(null);
  useEffect(() => encabezado.current?.focus(), [cita.chunkId]);
  return (
    <div>
      <h3 ref={encabezado} tabIndex={-1}>
        {fragmento.titulo}
      </h3>
      <p lang={cita.language} data-origen="corpus" data-campo="chunkTextSnapshot">
        {cita.chunkTextSnapshot}
      </p>
      <p>
        <span data-origen="corpus" data-campo="sourceName">
          {cita.sourceName}
        </span>
        {' · '}
        <span lang={cita.language} data-origen="corpus" data-campo="title">
          {cita.title}
        </span>
      </p>
      <p>
        {textos.licencia}: {licencia[cita.licenseClass]} · {textos.autores}:{' '}
        <AutoresDeLaCita autores={cita.authors} />
      </p>
      <button type="button" className={estilos.chip} onClick={onVolver}>
        {fragmento.volver}
      </button>
    </div>
  );
}
