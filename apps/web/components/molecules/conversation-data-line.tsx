import { mensajes } from '../../lib/mensajes';

export interface ConversationDataLineProps {
  usados: readonly string[];
  ausentes: readonly string[];
}

/** «◆ Datos usados: … · Ausentes: …» con las etiquetas que Backend 1 envió y detectó faltantes en este turno. */
export function ConversationDataLine({ usados, ausentes }: ConversationDataLineProps) {
  if (usados.length === 0 && ausentes.length === 0) return null;
  const { datosUsados, datosAusentes, ninguno } = mensajes().conversacion;
  const lista = (etiquetas: readonly string[]) => (etiquetas.length > 0 ? etiquetas.join(', ') : ninguno);
  return (
    <p className="text-text-muted m-0 mt-2 text-sm">
      ◆ {datosUsados}: {lista(usados)} · {datosAusentes}: {lista(ausentes)}
    </p>
  );
}
