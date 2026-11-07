import type { CitedSource } from '../../../../packages/api-contracts/src/types/clinical-api';
import { mensajes } from '../../lib/mensajes';
import { AvisoDeAfirmacionesOmitidas } from './aviso-de-afirmaciones-omitidas';
import { ReferenciasDelTurno } from './referencias-del-turno';

export interface AccionesDelTurnoProps {
  expandido: boolean;
  onAlternar: () => void;
  afirmacionesOmitidas: number;
  fuentes: readonly CitedSource[];
}

/**
 * Cierre de la tarjeta de un turno: «Expandir todo» / «Plegar todo» (`aria-pressed`), el aviso de afirmaciones omitidas
 * —solo expandido— y «Ver referencias». No altera ningún otro turno: su estado es el de su tarjeta.
 */
export function AccionesDelTurno({
  expandido,
  onAlternar,
  afirmacionesOmitidas,
  fuentes,
}: AccionesDelTurnoProps) {
  const { expandirTodo, plegarTodo } = mensajes().conversacion;
  return (
    <>
      <button
        type="button"
        aria-pressed={expandido}
        onClick={onAlternar}
        className="border-control-border rounded-control bg-surface mt-2 min-h-11 cursor-pointer border px-4"
      >
        {expandido ? plegarTodo : expandirTodo}
      </button>
      {expandido && <AvisoDeAfirmacionesOmitidas cantidad={afirmacionesOmitidas} />}
      <ReferenciasDelTurno fuentes={fuentes} />
    </>
  );
}
