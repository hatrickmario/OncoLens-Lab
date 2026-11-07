import type { ChatCitation } from '../../../../packages/api-contracts/src/types/clinical-api';
import type { CitaNumeradaDelBloque } from '../../lib/conversacion/numerar-citas';
import { mensajes, rellenar } from '../../lib/mensajes';

export interface ConversationCitationsProps {
  citas: readonly CitaNumeradaDelBloque[];
  /** Distingue los ids de los botones de un turno de los de otro (`[E1]` se repite en cada turno). */
  idDelTurno: string;
  /** Abre el fragmento de la cita en el panel lateral (S6 variante B). */
  onVerCita: (cita: ChatCitation, idDisparador: string) => void;
}

/** Citas de un bloque `evidencia` (RN-01): `[E<n> · frag. <m>]` abre el fragmento del corpus, que va como texto. */
export function ConversationCitations({
  citas,
  idDelTurno,
  onVerCita,
}: ConversationCitationsProps) {
  if (citas.length === 0) return null;
  const { citaEtiqueta } = mensajes().conversacion;
  return (
    <ul className="m-0 mt-2 list-none p-0">
      {citas.map(({ numero, cita }) => {
        const id = `cita-${idDelTurno}-${numero}`;
        return (
          <li key={`${cita.chunkId}-${numero}`} className="mt-1">
            <button
              type="button"
              id={id}
              aria-haspopup="dialog"
              onClick={() => onVerCita(cita, id)}
              className="text-evidence min-h-11 cursor-pointer text-sm underline"
            >
              {rellenar(citaEtiqueta, { n: numero, f: cita.chunkOrdinal })}
            </button>{' '}
            <span className="text-sm">{cita.sourceTitle}</span>
          </li>
        );
      })}
    </ul>
  );
}
