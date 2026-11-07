import type { ConversationDataLink } from '../../../../packages/api-contracts/src/types/clinical-api';
import type { EnlaceDeDato } from '../../lib/conversacion/enlaces-de-datos';
import { mensajes } from '../../lib/mensajes';

export interface ConversationDataLinksProps {
  enlaces: readonly EnlaceDeDato[];
  /** Prefijo de los ids de los botones: único por turno y bloque, para devolverles el foco. */
  idBase: string;
  onVerEnCaso: (enlace: ConversationDataLink, idDisparador: string) => void;
}

/** Chips ◆ de los datos del paciente que cita un bloque; «Ver en el caso» abre el dato en el panel lateral. */
export function ConversationDataLinks({
  enlaces,
  idBase,
  onVerEnCaso,
}: ConversationDataLinksProps) {
  if (enlaces.length === 0) return null;
  const { verEnCaso } = mensajes().conversacion;
  return (
    <ul className="m-0 mt-2 flex list-none flex-wrap gap-2 p-0">
      {enlaces.map(({ clave, etiqueta, enlace }) => {
        const id = `${idBase}-${clave}`;
        return (
          <li key={clave}>
            <button
              type="button"
              id={id}
              aria-haspopup="dialog"
              onClick={() => onVerEnCaso(enlace, id)}
              className="text-clinical min-h-11 cursor-pointer text-sm underline"
            >
              ◆ {etiqueta} — {verEnCaso}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
