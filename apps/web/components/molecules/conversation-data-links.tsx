import type { EnlaceDeDato } from '../../lib/conversacion/enlaces-de-datos';
import { mensajes } from '../../lib/mensajes';

/** Enlaces ◆ a los datos del paciente que cita un bloque; abren en otra pestaña para no perder la conversación. */
export function ConversationDataLinks({ enlaces }: { enlaces: readonly EnlaceDeDato[] }) {
  if (enlaces.length === 0) return null;
  const { verEnCaso } = mensajes().conversacion;
  return (
    <ul className="m-0 mt-2 flex list-none flex-wrap gap-2 p-0">
      {enlaces.map((enlace) => (
        <li key={enlace.clave}>
          <a
            href={enlace.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-clinical text-sm underline"
          >
            ◆ {enlace.etiqueta} — {verEnCaso}
          </a>
        </li>
      ))}
    </ul>
  );
}
