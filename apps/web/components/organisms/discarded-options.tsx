'use client';

import { useState } from 'react';
import type { DiscardedOption } from '../../../../packages/api-contracts/src/types/clinical-api';
import { mensajes } from '../../lib/mensajes';
import estilos from '../evidence.module.css';
import { DiscardedAuditMeta } from '../molecules/discarded-audit-meta';

export interface DiscardedOptionsProps {
  descartadas: DiscardedOption[];
  idAnalisis: string;
  creadoEn: string;
}

/**
 * Descartadas por falta de soporte: sección plegada, solo para revisión (FR-10). Sin botones ni enlaces
 * dentro: nunca se presentan como contenido clínico utilizable.
 */
export function DiscardedOptions({ descartadas, idAnalisis, creadoEn }: DiscardedOptionsProps) {
  const [abierta, setAbierta] = useState(false);
  const { discarded, discardReason } = mensajes().evidence;
  return (
    <section>
      <h2>
        <button
          type="button"
          className={estilos.titulo}
          aria-expanded={abierta}
          aria-controls="descartadas"
          onClick={() => setAbierta(!abierta)}
        >
          {discarded.titulo}
        </button>
      </h2>
      <p>{discarded.linea}</p>
      <div id="descartadas" hidden={!abierta}>
        {abierta && (
          <>
            <p>{discarded.auditoria}</p>
            <ol>
              {descartadas.map((descartada, indice) => (
                <li key={descartada.option} className={estilos.descartada}>
                  <DiscardedAuditMeta
                    numero={indice + 1}
                    idAnalisis={idAnalisis}
                    creadoEn={creadoEn}
                  />
                  <p>{descartada.option}</p>
                  <p>{discardReason[descartada.discardReason]}</p>
                  {descartada.unsupportedClaims.map((afirmacion) => (
                    <p key={afirmacion}>
                      <span className={estilos.sinSoporte}>⚠ {discarded.sinSoporte}</span>{' '}
                      <span>{afirmacion}</span>
                    </p>
                  ))}
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </section>
  );
}
