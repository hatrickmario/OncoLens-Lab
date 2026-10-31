import type { DiscardedOption } from '../../../../packages/api-contracts/src/types/clinical-api';
import { descripcionDeDescartada } from '../../lib/evidence/descripcion-descartada';
import { mensajes } from '../../lib/mensajes';
import estilos from '../evidence.module.css';

export interface DiscardedOptionItemProps {
  descartada: DiscardedOption;
}

/**
 * Una descartada para revisión (FR-10): nombre, motivo recibido y, según el motivo, sus afirmaciones sin
 * soporte o la nota de redacción. Todo texto generado pasa por RN-23 antes de renderizarse.
 */
export function DiscardedOptionItem({ descartada }: DiscardedOptionItemProps) {
  const { discarded, discardReason } = mensajes().evidence;
  const { motivo, opcion, afirmaciones, porLenguaje } = descripcionDeDescartada(descartada);
  return (
    <>
      <p>{opcion ?? discarded.textoNoMostrado}</p>
      <p>{discardReason[motivo]}</p>
      {porLenguaje && <p>{discarded.notaLenguaje}</p>}
      {afirmaciones.map((afirmacion, indice) =>
        afirmacion === null ? (
          <p key={indice}>{discarded.textoNoMostrado}</p>
        ) : (
          <p key={indice}>
            <span className={estilos.sinSoporte}>⚠ {discarded.afirmacionNoVerificada}</span>{' '}
            <span>{afirmacion}</span>
          </p>
        ),
      )}
    </>
  );
}
