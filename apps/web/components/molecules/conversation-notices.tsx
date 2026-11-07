import { mensajes } from '../../lib/mensajes';

/**
 * Avisos de IA del turno (RN-19): cada entrada de `turn.notices[]` tal como la devolvió Backend 2, sin añadir, traducir
 * ni tomar nada de la configuración de `web`. Sin entradas no pinta nada (los mensajes del sistema no llevan avisos).
 */
export function ConversationNotices({ avisos }: { avisos: readonly string[] }) {
  if (avisos.length === 0) return null;
  return (
    <section
      aria-label={mensajes().conversacion.avisosTitulo}
      className="bg-warn-bg border-warn-border text-warn rounded-tarjeta mt-2 border p-2 text-sm"
    >
      <ul className="m-0 list-none p-0">
        {avisos.map((aviso, indice) => (
          <li key={`${indice}-${aviso}`}>{aviso}</li>
        ))}
      </ul>
    </section>
  );
}
