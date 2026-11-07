import type { ChatCitation } from '../../../../packages/api-contracts/src/types/clinical-api';

export interface CitaNumerada {
  numero: number;
  cita: ChatCitation;
}

/** Citas de un bloque `evidencia` (RN-01): `[E<n>]`, fuente y fragmento del corpus como texto (nunca HTML). */
export function ConversationCitations({ citas }: { citas: readonly CitaNumerada[] }) {
  if (citas.length === 0) return null;
  return (
    <ul className="m-0 mt-2 list-none p-0">
      {citas.map(({ numero, cita }) => (
        <li key={`${cita.chunkId}-${numero}`} className="mt-1">
          <details>
            <summary className="text-evidence cursor-pointer text-sm">
              [E{numero}] {cita.sourceTitle} · fragmento {cita.chunkOrdinal} de {cita.chunkCount}
            </summary>
            <blockquote className="border-control-border m-0 mt-1 border-l-2 pl-3 text-sm">
              {cita.chunkTextSnapshot}
            </blockquote>
          </details>
        </li>
      ))}
    </ul>
  );
}
